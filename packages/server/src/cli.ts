import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_MAX_REQUEST_BODY_SIZE } from '@modelcontextprotocol/sdk/server/requestBody.js'
import { start } from './http.ts'
import { mcp } from './mcp.ts'
import { voiceCommand } from './voice-settings.ts'
import {
  catalog,
  contextText,
  installProjectSkill,
  skillMarkdown,
  workflowMarkdown,
} from './agent-context.ts'
import { prReport } from '../../core/src/pr-review.ts'
export async function main() {
  if (process.versions.node.split('.')[0] !== '24')
    throw Error('Janotate requires Node 24')
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      data: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      session: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      title: { type: 'string' },
      example: { type: 'boolean' },
    },
  })

  const [cmd, arg, ...rest] = positionals
  if (values.help || cmd === 'help') {
    console.log(
      [
        'janotate [--data DIR] [--port NUMBER] [--no-open]  Start or find the workspace',
        'janotate mcp                                     Connect an agent over stdio',
        'janotate context [ITEM_KIND] [--json]            Read the workflow or an item reference',
        'janotate skill [install]                         Print the skill or install it in this project',
        'janotate review-pr REPORT | --example             Open a feynman-review v2 report',
        'janotate voice status                            Inspect project narration settings',
      ].join('\n'),
    )
    return
  }
  if (cmd === 'context') {
    if (rest.length) throw Error('Usage: janotate context [ITEM_KIND] [--json]')
    const markdown = contextText(arg)
    const item = catalog.items.find((i) => i.kind === arg)
    console.log(
      values.json
        ? JSON.stringify(
            item
              ? { ...item, markdown }
              : { ...catalog, workflow: workflowMarkdown() },
            null,
            2,
          )
        : markdown.trimEnd(),
    )
    return
  }
  if (cmd === 'skill') {
    if (rest.length || (arg && arg !== 'install'))
      throw Error('Usage: janotate skill [install]')
    console.log(
      arg ? installProjectSkill(process.cwd()) : skillMarkdown().trimEnd(),
    )
    return
  }
  const data = resolve(values.data ?? '.janotate')
  if (cmd === 'voice') return voiceCommand(data, positionals.slice(1))
  let prInput
  if (cmd === 'review-pr') {
    if ((!arg && !values.example) || (arg && values.example) || rest.length)
      throw Error(
        'Usage: janotate review-pr REPORT | --example [--title TITLE] [--json]',
      )
    if (values.host)
      throw Error(
        'To import into a hosted project, send the report using review_open over its MCP endpoint.',
      )
    const source = values.example
      ? new URL('./docs/examples/receipt-review.json', import.meta.url)
      : arg
    const file = statSync(source)
    if (!file.isFile()) throw Error('Expected a local review.json file.')
    // Pretty-printed reports can be considerably larger than their MCP payload.
    if (file.size > DEFAULT_MAX_REQUEST_BODY_SIZE * 4)
      throw Error(
        'This report file exceeds 16 MiB. Try a compact JSON export for the 4 MiB MCP request limit.',
      )
    const checked = prReport.safeParse(JSON.parse(readFileSync(source, 'utf8')))
    if (!checked.success) {
      const issue = checked.error.issues[0]
      throw Error(
        'Invalid review report at ' +
          (issue.path.join('.') || 'report') +
          '. ' +
          issue.message,
      )
    }
    const report = checked.data
    const title =
      values.title ??
      report?.pr?.title ??
      (values.example
        ? 'Field Notes · receipt retries'
        : report?.summary?.essence) ??
      'Pull request review'
    prInput = {
      title,
      mode: values.session ? 'session' : undefined,
      items: [{ kind: 'pr_review', title, report }],
    }
    if (
      Buffer.byteLength(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'review_open', arguments: prInput },
        }),
      ) > DEFAULT_MAX_REQUEST_BODY_SIZE
    )
      throw Error(
        'This report exceeds the 4 MiB MCP request limit. Review a smaller change range.',
      )
  } else if (arg || (cmd && !['mcp', 'serve'].includes(cmd)))
    throw Error('Unknown command. Run janotate --help.')
  mkdirSync(data, { recursive: true, mode: 0o700 })
  const lock = resolve(data, 'server.json')
  const port = Number(
    values.port ??
      20000 +
        (createHash('sha256').update(data).digest().readUInt16BE() % 30000),
  )
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('Invalid --port')
  async function find() {
    try {
      const { origin, pid } = JSON.parse(readFileSync(lock, 'utf8'))
      const url = new URL(origin)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return
      const health = await (
        await fetch(origin + '/health', {
          signal: AbortSignal.timeout(500),
          redirect: 'error',
        })
      ).json()
      if (health.service === 'Janotate' && health.pid === pid) return origin
    } catch {}
  }
  if (values.host) {
    if (cmd === 'mcp')
      throw Error('Connect hosted clients to the HTTP endpoint')
    const service = await start(
      data,
      port,
      values.session,
      dirname(fileURLToPath(import.meta.url)),
      {
        host: values.host,
        uiToken: process.env.JANOTATE_UI_TOKEN,
        mcpToken: process.env.JANOTATE_MCP_TOKEN,
        publicOrigin: process.env.JANOTATE_PUBLIC_ORIGIN,
        frameOrigin: process.env.JANOTATE_FRAME_ORIGIN,
        framePort: Number(process.env.JANOTATE_FRAME_PORT ?? 0),
      },
    )
    console.log(service.origin)
    process.once('SIGTERM', () => service.close())
    process.once('SIGINT', () => service.close())
    return
  }
  if (cmd === 'serve') {
    // SQLite releases this project-wide startup lease even if the owner crashes.
    const lease = new DatabaseSync(resolve(data, 'server-lock.sqlite'))
    lease.exec('BEGIN EXCLUSIVE')
    const service = await start(
      data,
      port,
      values.session,
      dirname(fileURLToPath(import.meta.url)),
    )
    const tmp = lock + '.' + randomUUID()
    writeFileSync(
      tmp,
      JSON.stringify({ pid: process.pid, origin: service.origin }),
      { mode: 0o600 },
    )
    renameSync(tmp, lock)
    function shutdown() {
      service.close()
      rmSync(lock, { force: true })
      lease.close()
      process.exit(0)
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
    return
  }
  let origin = await find()
  if (!origin) {
    const child = spawn(
      process.execPath,
      [
        process.argv[1],
        'serve',
        '--data',
        data,
        '--port',
        String(port),
        ...(values.session ? ['--session'] : []),
      ],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
    for (let i = 0; i < 80 && !origin; i++) {
      await delay(75)
      origin = await find()
    }
    if (!origin) throw Error('Could not start the server on port ' + port)
  }
  if (cmd === 'mcp' || cmd === 'review-pr') {
    const client = new Client({ name: 'Janotate', version: '0.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', origin)),
    )
    if (cmd === 'review-pr') {
      try {
        const result = await client.callTool({
          name: 'review_open',
          arguments: prInput,
        })
        if (result.isError) throw Error(result.content[0].text)
        const opened = result.structuredContent
        if (
          !opened ||
          typeof opened !== 'object' ||
          !('url' in opened) ||
          typeof opened.url !== 'string'
        )
          throw Error('The workspace could not return a review URL.')
        console.log(values.json ? JSON.stringify(opened) : opened.url)
        if (!values['no-open'] && !values.json) openBrowser(String(opened.url))
      } finally {
        await client.close()
      }
      return
    }
    await mcp(async (name, args, progress, signal) => {
      if (name === 'review_open' && values.session && args.mode === undefined)
        args = { ...args, mode: 'session' }
      const r = await client.callTool({ name, arguments: args }, undefined, {
        signal,
        onprogress: (p) => progress(p.progress),
      })
      if (r.isError) throw Error(r.content[0].text)
      return r.structuredContent
    }).connect(new StdioServerTransport())
  } else {
    console.log(origin)
    if (!values['no-open']) openBrowser(origin)
  }
}
function openBrowser(url: string) {
  const child = spawn(
    process.platform === 'darwin' ? 'open' : 'xdg-open',
    [url],
    { detached: true, stdio: 'ignore' },
  )
  child.on('error', () => {})
  child.unref()
}
