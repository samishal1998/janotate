import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { start } from '../packages/server/src/http.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
test('tool errors identify invalid input, missing ids, closed reviews and project quota', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-errors-')),
    s = await start(data, 0, false, resolve('dist')),
    client = new Client({ name: 'errors', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', s.origin)),
    )
    async function error(name, args, pattern) {
      const result = await client.callTool({ name, arguments: args })
      assert.equal(result.isError, true)
      assert.match(result.content[0].text, pattern)
    }
    await error('review_get', { review_id: randomUUID() }, /not_found/)
    const args = {
      title: 'Review',
      items: [
        {
          kind: 'decision',
          title: 'Go?',
          options: [{ id: 'yes', label: 'Yes', tradeoffs: 'Begin' }],
        },
      ],
    }
    const r = (await client.callTool({ name: 'review_open', arguments: args }))
      .structuredContent
    const update = {
      review_id: r.review_id,
      item_id: r.item_ids[0],
      reply: 'Revised',
      patch: { options: [] },
    }
    await error('item_update', update, /invalid_items.*patch/)
    await error(
      'review_wait',
      { review_id: r.review_id, wait_seconds: 46 },
      /wait_seconds/,
    )
    const submitted = await fetch(s.origin + '/api/review/' + r.review_id, {
      method: 'POST',
      headers: { Origin: s.origin, 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert(submitted.ok)
    await error('item_update', update, /review_closed/)
    for (let i = 0; i < 100; i++)
      assert(
        !(await client.callTool({ name: 'review_open', arguments: args }))
          .isError,
      )
    await error('review_open', args, /quota/)
  } finally {
    await client.close()
    s.close()
    rmSync(data, { recursive: true })
  }
})
