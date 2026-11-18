import { get as httpGet } from 'node:http'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { start } from '../packages/server/src/http.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const example = (path) =>
  JSON.parse(
    readFileSync(
      'packages/docs/src/content/docs/' + path + '.md',
      'utf8',
    ).match(/```json\n([\s\S]*?)\n```/)[1],
  )
test('hosted reviewer confirms once and agent skips a duplicate using the decision log', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-hosted-')),
    config = {
      host: '127.0.0.1',
      uiToken: randomUUID(),
      mcpToken: randomUUID(),
    }
  await assert.rejects(
    start(data, 0, false, resolve('dist'), { ...config, uiToken: '' }),
    /distinct/,
  )
  const s = await start(data, 0, false, resolve('dist'), config),
    client = new Client({ name: 'agent', version: '1' })
  try {
    for (const token of ['bad', config.uiToken])
      assert.equal(
        (
          await fetch(s.origin + '/mcp', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
          })
        ).status,
        401,
      )
    assert.equal((await fetch(s.origin)).status, 401)
    assert.equal(
      await new Promise((resolve) =>
        httpGet(s.origin, { headers: { host: 'untrusted.invalid' } }, (r) => {
          r.resume()
          resolve(r.statusCode)
        }),
      ),
      403,
    )
    const auth = await fetch(s.origin + '/?token=' + config.uiToken, {
      redirect: 'manual',
    })
    assert.equal(auth.status, 303)
    const cookie = auth.headers.get('set-cookie').split(';')[0]
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', s.origin), {
        requestInit: {
          headers: { Authorization: 'Bearer ' + config.mcpToken },
        },
      }),
    )
    const open = example('interfaces/decision')
    open.arguments.items[0].tags = ['export']
    const query = example('reference/decisions_query')
    const search = async () =>
      (await client.callTool(query)).structuredContent.decisions
    let questions = 0
    async function askIfNeeded() {
      const known = await search()
      if (known.length) return known[0].answer
      questions++
      const r = (await client.callTool(open)).structuredContent
      const submitted = await fetch(s.origin + '/api/review/' + r.review_id, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: s.origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [r.item_ids[0]]: { option: 'md' } }),
      })
      assert.equal(submitted.status, 200)
    }
    await askIfNeeded()
    assert.equal(await askIfNeeded(), 'md')
    assert.equal(questions, 1)
    const files = readdirSync(join(data, 'decisions'))
    assert.equal(files.length, 1)
    assert.match(
      readFileSync(join(data, 'decisions', files[0]), 'utf8'),
      /Export format\?/,
    )
    assert(!(await client.callTool(example('interfaces/digest'))).isError)
  } finally {
    await client.close()
    s.close()
    rmSync(data, { recursive: true })
  }
})
