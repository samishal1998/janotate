import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'

test('recent reviews merge project and session activity, obey reviewer authentication and link the decision log', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-recent-')),
    server = await start(data, 0, false, resolve('dist'), {
      host: '127.0.0.1',
      uiToken: 'reviewer',
      mcpToken: 'agent',
    })
  const client = new Client({ name: 'recent', version: '1' }),
    { origin } = server
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', origin), {
        requestInit: { headers: { authorization: 'Bearer agent' } },
      }),
    )
    const feed = origin + '/api/reviews/recent'
    assert.equal((await fetch(feed)).status, 401)
    assert.equal(
      (await fetch(feed, { headers: { authorization: 'Bearer agent' } }))
        .status,
      401,
    )
    const login = await fetch(origin + '/?token=reviewer', {
      redirect: 'manual',
    })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const headers = { cookie, origin, 'content-type': 'application/json' }
    const list = () =>
      fetch(feed, { headers: { cookie } }).then((r) => r.json())
    assert.deepEqual(await list(), { reviews: [] })
    const title = 'Private item text',
      item = {
        kind: 'proposal',
        title,
        sections: [{ id: 'a', label: 'Draft', body: 'Private content' }],
      }
    const open = async (label: string, mode: string, n = 1, ttl?: number) => {
      const result = await client.callTool({
        name: 'review_open',
        arguments: {
          title: label,
          items: Array(n).fill(item),
          mode,
          ttl_hours: ttl,
        },
      })
      assert(!result.isError)
      return result.structuredContent as {
        review_id: string
        item_ids: string[]
      }
    }
    const session = await open('Current session', 'session', 2)
    const workspace = await open('Project review', 'workspace')
    for (let i = 0; i < 6; i++)
      await open('Queue ' + i, i % 2 === 0 ? 'session' : 'workspace')
    const closed = await open('Already closed', 'workspace'),
      cancelled = await open('Cancelled review', 'session')
    await fetch(origin + '/api/review/' + closed.review_id, {
      method: 'POST',
      headers,
      body: '{}',
    })
    await fetch(origin + '/api/review/' + cancelled.review_id + '/cancel', {
      method: 'POST',
      headers,
    })
    const expired = await open('Expired review', 'workspace', 1, 0.000001)
    await delay(8)
    const comment = async (review: typeof session) =>
      fetch(
        origin +
          '/api/review/' +
          review.review_id +
          '/items/' +
          review.item_ids[0] +
          '/comments',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            body: 'Private comment',
            anchor: { type: 'item' },
          }),
        },
      )
    assert.equal((await comment(workspace)).status, 200)
    await delay(5)
    assert.equal((await comment(session)).status, 200)
    const { reviews } = await list()
    assert.equal(reviews.length, 6)
    assert.deepEqual(
      reviews.slice(0, 2).map((r) => [r.id, r.title, r.mode, r.item_count]),
      [
        [session.review_id, 'Current session', 'session', 2],
        [workspace.review_id, 'Project review', 'workspace', 1],
      ],
    )
    assert.deepEqual(
      reviews.map((r) => r.updated_at),
      reviews
        .map((r) => r.updated_at)
        .toSorted()
        .reverse(),
    )
    for (const review of reviews) {
      assert.deepEqual(Object.keys(review).sort(), [
        'id',
        'item_count',
        'mode',
        'state',
        'title',
        'updated_at',
      ])
      assert.equal(review.state, 'open')
      assert(
        ![closed.review_id, cancelled.review_id, expired.review_id].includes(
          review.id,
        ),
      )
    }
    const log = await fetch(origin + '/decisions', { headers: { cookie } })
    assert.equal(log.status, 200)
    assert.match(log.headers.get('content-type'), /text\/html/)
    assert.match(
      log.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    )
  } finally {
    await client.close()
    server.close()
    rmSync(data, { recursive: true, force: true })
  }
})
