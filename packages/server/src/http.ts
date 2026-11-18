import { isDeepStrictEqual } from 'node:util'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep, extname } from 'node:path'
import { reviewService } from '../../core/src/service.ts'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { openStore } from '../../core/src/store.ts'
import { submission } from '../../core/src/schema.ts'
import { hosted, type Hosting } from './auth.ts'
import { frames } from './frames.ts'
import { mcp } from './mcp.ts'
import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
export async function start(data, port, session, assets, hosting?: Hosting) {
  const authorize = hosting ? hosted(hosting) : null,
    bind = hosting?.host ?? '127.0.0.1'
  if (
    hosting?.publicOrigin &&
    new URL(hosting.publicOrigin).origin ===
      new URL(hosting.frameOrigin ?? hosting.publicOrigin).origin
  )
    throw Error('Hosting requires a distinct frame origin')
  const sessionDir = mkdtempSync(resolve(tmpdir(), 'janotate-session-'))
  const workspace = openStore(
      resolve(data, 'workspace.sqlite'),
      resolve(data, 'decisions'),
    ),
    temporary = openStore(resolve(sessionDir, 'session.sqlite'))
  let origin = ''
  const { locate, dispatch } = reviewService(
    workspace,
    temporary,
    session,
    () => origin,
  )
  const frame = await frames(
    locate,
    () => origin,
    bind,
    hosting?.frameOrigin,
    hosting?.framePort,
  )
  const app = new Hono()
  app.onError((err, c) => c.json({ error: err.message }, 400))
  app.get('/api/decisions', (c) =>
    c.json(workspace.query({ text: c.req.query('q') ?? '', limit: 100 })),
  )
  app.get('/health', (c) => c.json({ service: 'Janotate', pid: process.pid }))
  app.get('/api/review/:id', (c) =>
    c.json(locate(c.req.param('id')).get(c.req.param('id'))),
  )
  app.get('/api/review/:id/items/:key/frame-status', (c) =>
    c.json({ message: frame.status(c.req.param('key')) }),
  )
  app.post('/api/review/:id/items/:key/:action', async (c) => {
    if (c.req.header('origin') !== origin) return c.text('Forbidden', 403)
    const { id, key, action } = c.req.param(),
      input = await c.req.json(),
      store = locate(id)
    if (action === 'frame') {
      const review = store.get(id),
        item = review.items.find((i) => i.id === key)
      if (review.state !== 'open' || item?.kind !== 'html') return c.notFound()
      return c.json({ url: frame.issue(id, item) })
    }
    if (action === 'comments') store.addComment(id, key, input)
    else if (action === 'answer')
      store.save(
        id,
        key,
        input === null ? null : submission.parse({ [key]: input })[key],
      )
    else return c.notFound()
    return c.json(store.get(id))
  })
  app.post('/api/review/:id/cancel', (c) => {
    if (c.req.header('origin') !== origin) return c.text('Forbidden', 403)
    const id = c.req.param('id')
    return c.json(locate(id).cancel(id))
  })
  app.post('/api/review/:id', async (c) => {
    if (
      c.req.header('origin') !== origin ||
      !c.req.header('content-type')?.startsWith('application/json')
    )
      return c.text('Forbidden', 403)
    const id = c.req.param('id'),
      store = locate(id),
      answers = submission.parse(await c.req.json())
    // A retry after a lost response or export error can return the committed result.
    let result
    if (store.state(id) === 'done') {
      result = store.result(id)
      for (const [key, answer] of Object.entries(answers)) {
        const value =
          'values' in answer
            ? answer.values
            : 'other' in answer
              ? answer.other
              : answer.option
        if (
          !isDeepStrictEqual(
            result.result.answers.find((a) => a.item_id === key)?.value,
            value,
          )
        )
          throw Error('review_closed')
      }
    } else result = store.submit(id, answers)
    workspace.flush()
    console.log(JSON.stringify({ event: 'review_submitted', review_id: id }))
    return c.json(result)
  })
  app.get('*', (c) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname)
    if (path === '/docs') return c.redirect('/docs/')
    const docs = path.startsWith('/docs/'),
      root = resolve(assets, docs ? 'docs' : 'ui')
    let file = resolve(
      root,
      '.' +
        (docs
          ? path.slice(5)
          : path.startsWith('/review/')
            ? '/index.html'
            : path),
    )
    if (file !== root && !file.startsWith(root + sep)) return c.notFound()
    try {
      if (statSync(file).isDirectory()) file = resolve(file, 'index.html')
      const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
      }
      return new Response(readFileSync(file), {
        headers: {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          ...(!docs && extname(file) === '.html'
            ? {
                'Content-Security-Policy':
                  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src " +
                  frame.origin,
              }
            : {}),
        },
      })
    } catch {
      return c.notFound()
    }
  })
  const listener = getRequestListener(app.fetch)
  const http = createServer(async (req, res) => {
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end()
      return
    }
    if (authorize && !authorize(req, res, origin)) return
    if (req.url !== '/mcp') return listener(req, res)
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    const server = mcp(dispatch),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
    res.on('close', () => server.close().catch(() => {}))
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  await new Promise<void>((ok, fail) => {
    http.once('error', fail)
    http.listen(port, bind, ok)
  })
  origin = hosting?.publicOrigin
    ? new URL(hosting.publicOrigin).origin
    : 'http://' + bind + ':' + (http.address() as AddressInfo).port
  return {
    origin,
    close() {
      frame.close()
      http.closeAllConnections()
      http.close()
      temporary.close()
      rmSync(sessionDir, { recursive: true })
      workspace.close()
    },
  }
}
