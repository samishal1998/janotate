import assert from 'node:assert/strict'
import { start } from '../packages/server/src/http.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const data = mkdtempSync(join(tmpdir(), 'janotate-wait-')),
  server = await start(data, 0, false, resolve('dist'))
const client = new Client({ name: 'wait', version: '1' })
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
  )
  const r = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Timeout check',
      items: [
        {
          kind: 'decision',
          title: 'Proceed?',
          options: [{ id: 'ok', label: 'OK', tradeoffs: 'Starts work' }],
        },
      ],
    },
  })
  const startTime = Date.now()
  let calls = 0,
    heartbeats = 0
  while (Date.now() - startTime < 600000) {
    const hold = Math.min(
      45,
      Math.max(1, Math.ceil((600000 - Date.now() + startTime) / 1000)),
    )
    const t = Date.now(),
      pending = await client.callTool(
        {
          name: 'review_wait',
          arguments: {
            review_id: r.structuredContent.review_id,
            wait_seconds: hold,
          },
        },
        undefined,
        { timeout: 60000, onprogress: () => heartbeats++ },
      )
    assert.equal(pending.structuredContent.state, 'pending')
    assert(Date.now() - t < 60000)
    calls++
  }
  assert(heartbeats >= 110)
  console.log({ calls, heartbeats, elapsed: Date.now() - startTime })
} finally {
  await client.close()
  server.close()
  rmSync(data, { recursive: true })
}
