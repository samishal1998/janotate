import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { tools } from '../packages/core/src/schema.ts'

const bin = resolve('bin/janotate.mjs')
test('agent skill and references work offline before the workspace exists', () => {
  const project = mkdtempSync(join(tmpdir(), 'janotate-skill-'))
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [bin, ...args], {
      cwd: project,
      encoding: 'utf8',
    }).trim()
  try {
    const catalog = JSON.parse(run('context', '--json'))
    assert.deepEqual(
      Object.keys(catalog.tools).sort(),
      Object.keys(tools).sort(),
    )
    assert(
      catalog.items.every(
        (item) => item.purpose && item.uri.endsWith('/' + item.kind),
      ),
    )
    const ref = JSON.parse(run('context', 'decision', '--json'))
    const example = JSON.parse(
      ref.markdown.match(/```json\n([\s\S]+?)\n```/)[1],
    )
    assert(tools.review_open.safeParse(example.arguments).success)
    const expected = run('skill')
    const file = run('skill', 'install')
    assert.equal(file, join(project, '.agents/skills/janotate/SKILL.md'))
    assert.equal(readFileSync(file, 'utf8').trim(), expected)
    assert.equal(run('skill', 'install'), file)
    writeFileSync(file, 'Project-specific instructions')
    const changed = spawnSync(process.execPath, [bin, 'skill', 'install'], {
      cwd: project,
      encoding: 'utf8',
    })
    assert.equal(changed.status, 1)
    assert.match(changed.stderr, /compare/)
    assert.equal(readFileSync(file, 'utf8'), 'Project-specific instructions')
    assert(!existsSync(join(project, '.janotate')))
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('an agent discovers guidance over HTTP and stdio and imports the packaged PR report', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-agent-'))
  const lock = join(data, 'server.json')
  const clients: Client[] = []
  try {
    const opened = JSON.parse(
      execFileSync(
        process.execPath,
        [bin, 'review-pr', '--example', '--json', '--data', data],
        { encoding: 'utf8' },
      ),
    )
    const transports = [
      new StreamableHTTPClientTransport(new URL('/mcp', opened.url)),
      new StdioClientTransport({
        command: process.execPath,
        args: [bin, 'mcp', '--data', data],
      }),
    ]
    for (const transport of transports) {
      const client = new Client({ name: 'agent-onboarding', version: '1' })
      clients.push(client)
      await client.connect(transport)
      assert.match(client.getInstructions(), /janotate:\/\/agent\/workflow/)
      assert((await client.listTools()).tools.every((tool) => tool.description))
      const { resources } = await client.listResources()
      const read = async (uri: string) =>
        (await client.readResource({ uri })).contents[0].text as string
      assert.match(await read('janotate://agent/workflow'), /after_comment/)
      const { items } = JSON.parse(await read('janotate://agent/catalog'))
      for (const item of items) {
        assert(resources.some((r) => r.uri === item.uri))
        assert((await read(item.uri)).includes('# ' + item.kind))
      }
      const get = await client.callTool({
        name: 'review_get',
        arguments: { review_id: opened.review_id },
      })
      assert(!get.isError)
      const pr = get.structuredContent.review.items[0]
      assert.equal(pr.kind, 'pr_review')
      assert.equal(pr.report.version, 2)
      assert.deepEqual(
        pr.report.coverage,
        JSON.parse(
          readFileSync(
            'packages/docs/public/examples/receipt-review.json',
            'utf8',
          ),
        ).coverage,
      )
    }
  } finally {
    for (const client of clients) await client.close()
    if (existsSync(lock)) {
      process.kill(JSON.parse(readFileSync(lock, 'utf8')).pid, 'SIGTERM')
      for (let i = 0; i < 100 && existsSync(lock); i++) await delay(25)
    }
    rmSync(data, { recursive: true, force: true })
  }
})
