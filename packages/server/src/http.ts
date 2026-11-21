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
import { dbmlText } from '../../core/src/dbml-patch.ts'
import { hosted, type Hosting } from './auth.ts'
import { frames } from './frames.ts'
import { mcp } from './mcp.ts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  configureElevenLabs,
  readVoiceSettings,
  MissingVoicePack,
  setProjectVoice,
  voiceSettings,
  voiceStatus,
} from './voice-settings.ts'
import { createElevenLabsService, elevenLabsConfig } from './elevenlabs.ts'
import { installVoicePack, supportsVoiceInstallation } from './voice-packs.ts'
import { z } from 'zod'
import { createVoiceService, VoiceServiceError } from './voice-service.ts'
import { getRequestListener } from '@hono/node-server'
const voiceChange = z
  .strictObject({
    model: z.enum(['kitten', 'kokoro', 'elevenlabs']).nullable(),
    install: z.boolean().optional(),
  })
  .refine(
    (input) =>
      !input.install || input.model === 'kitten' || input.model === 'kokoro',
  )
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
  const speech = createVoiceService()
  const remoteSpeech = createElevenLabsService()
  app.onError((err, c) => c.json({ error: err.message }, 400))
  app.get('/api/decisions', (c) =>
    c.json(workspace.query({ text: c.req.query('q') ?? '', limit: 100 })),
  )
  app.get('/health', (c) => c.json({ service: 'Janotate', pid: process.pid }))
  app.get('/api/reviews/recent', (c) => {
    const now = new Date().toISOString(),
      limit = 6
    const reviews = [
      ...workspace.recentOpenReviews(limit, now),
      ...temporary.recentOpenReviews(limit, now),
    ]
    reviews.sort(
      (a, b) =>
        b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
    )
    c.header('Cache-Control', 'no-store')
    return c.json({ reviews: reviews.slice(0, limit) })
  })
  app.get('/api/voice/status', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(voiceStatus(data))
  })
  const canConfigure = !hosting && bind === '127.0.0.1'
  const canInstall = canConfigure && supportsVoiceInstallation()
  const publicVoiceSettings = () =>
    voiceSettings(data, canInstall, canConfigure)
  app.get('/api/voice/settings', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(publicVoiceSettings())
  })
  app.on(
    ['PUT', 'DELETE'],
    '/api/voice/elevenlabs',
    bodyLimit({
      maxSize: 8192,
      onError: (c) =>
        c.json({ error: 'Provider settings request is too large.' }, 413),
    }),
    async (c) => {
      c.header('Cache-Control', 'no-store')
      if (!canConfigure || c.req.header('origin') !== origin)
        return c.json(
          { error: 'Only the local operator can manage speech providers.' },
          403,
        )
      if (c.req.method === 'DELETE') {
        configureElevenLabs(data, null)
        return c.json(publicVoiceSettings())
      }
      if (
        c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !==
        'application/json'
      )
        return c.json({ error: 'Send JSON provider settings.' }, 415)
      const input = elevenLabsConfig.safeParse(
        await c.req.json().catch(() => null),
      )
      if (!input.success)
        return c.json(
          {
            error:
              'Check the API base URL, model ID, voice ID and API key. Use HTTPS or loopback HTTP.',
          },
          400,
        )
      try {
        configureElevenLabs(data, input.data)
      } catch (error) {
        if (error instanceof MissingVoicePack)
          return c.json({ error: error.message }, 400)
        throw error
      }
      return c.json(publicVoiceSettings())
    },
  )
  app.put(
    '/api/voice/settings',
    bodyLimit({
      maxSize: 1024,
      onError: (c) =>
        c.json({ error: 'Voice settings request is too large.' }, 413),
    }),
    async (c) => {
      c.header('Cache-Control', 'no-store')
      if (c.req.header('origin') !== origin)
        return c.json({ error: 'Forbidden' }, 403)
      if (
        c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !==
        'application/json'
      )
        return c.json({ error: 'Send JSON voice settings.' }, 415)
      const input = voiceChange.safeParse(await c.req.json().catch(() => null))
      if (!input.success)
        return c.json(
          {
            error: 'Choose an installed voice, a configured provider, or off.',
          },
          400,
        )
      if (input.data.install && !canInstall)
        return c.json(
          { error: 'Install voice packs on the server with the Janotate CLI.' },
          403,
        )
      try {
        await setProjectVoice(
          data,
          input.data.model,
          input.data.install ? installVoicePack : undefined,
        )
        return c.json(publicVoiceSettings())
      } catch (error) {
        if (error instanceof MissingVoicePack)
          return c.json(
            {
              error: error.message,
            },
            409,
          )
        if (input.data.install)
          return c.json(
            { error: 'Could not install the voice pack. ' + error.message },
            503,
          )
        throw error
      }
    },
  )
  app.post(
    '/api/review/:id/speech',
    bodyLimit({
      maxSize: 12 * 1024,
      onError: (c) => c.json({ error: 'Speech request is too large' }, 413),
    }),
    async (c) => {
      if (c.req.header('origin') !== origin)
        return c.json({ error: 'Forbidden' }, 403)
      if (
        c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !==
        'application/json'
      )
        return c.json({ error: 'Send JSON with a text field.' }, 415)
      const id = c.req.param('id')
      if (!locate(id).has(id))
        return c.json({ error: 'Review unavailable.' }, 404)
      const { model, elevenlabs } = readVoiceSettings(data)
      if (!model)
        return c.json(
          { error: 'Read aloud is off or the voice pack is missing.' },
          503,
        )
      const input = await c.req.json()
      if (typeof input?.text !== 'string')
        return c.json({ error: 'Provide text to read aloud.' }, 400)
      try {
        if (model === 'elevenlabs')
          return await remoteSpeech.synthesize(
            elevenlabs,
            input.text,
            c.req.raw.signal,
          )
        const wav = await speech.synthesize(
          { model, text: input.text },
          c.req.raw.signal,
        )
        return new Response(wav as Uint8Array<ArrayBuffer>, {
          headers: {
            'Content-Type': 'audio/wav',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch (err) {
        if (!(err instanceof VoiceServiceError)) throw err
        if (err.code === 'aborted') return new Response(null, { status: 499 })
        if (err.code === 'busy') return c.json({ error: err.message }, 429)
        if (err.code === 'invalid') return c.json({ error: err.message }, 400)
        return c.json(
          { error: err.message },
          err.code === 'unavailable' ? 503 : 500,
        )
      }
    },
  )
  app.get('/api/review/:id', async (c) => {
    const id = c.req.param('id'),
      store = locate(id),
      since = c.req.query('since')
    c.header('Cache-Control', 'no-store')
    if (!store.has(id)) return c.json({ error: 'not_found: review_id' }, 404)
    if (
      since !== undefined &&
      String(store.version(id)) === since &&
      store.state(id) === 'open'
    ) {
      await store.waitForChange(id, 25000, c.req.raw.signal)
      if (String(store.version(id)) === since) return c.body(null, 204)
    }
    return c.json(store.get(id))
  })
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
          'format' in answer
            ? answer
            : 'code' in answer
              ? answer.code
              : 'values' in answer
                ? answer.values
                : 'other' in answer
                  ? answer.other
                  : answer.option
        let previous = result.result.answers.find(
          (a) => a.item_id === key,
        )?.value
        if ('code' in answer && previous?.format === 'unified_diff') {
          const item = store.get(id).items.find((i) => i.id === key)
          previous = dbmlText(item, previous)
        }
        if (!isDeepStrictEqual(previous, value)) throw Error('review_closed')
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
          : path.startsWith('/review/') ||
              path === '/decisions' ||
              path === '/decisions/'
            ? '/index.html'
            : path),
    )
    if (file !== root && !file.startsWith(root + sep)) return c.notFound()
    try {
      if (statSync(file).isDirectory()) file = resolve(file, 'index.html')
      const mime = {
        '.html': 'text/html',
        '.txt': 'text/plain; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
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
                  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src " +
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
      speech.close()
      remoteSpeech.close()
      frame.close()
      http.closeAllConnections()
      http.close()
      temporary.close()
      rmSync(sessionDir, { recursive: true })
      workspace.close()
    },
  }
}
