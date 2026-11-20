import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import test, { type TestContext } from 'node:test'
import { chromium } from 'playwright'
import { build } from 'vite'
import { speechChunks } from '../packages/ui/src/speech-chunks.ts'

let script: string
test.before(async () => {
  const result = await build({
    root: resolve(import.meta.dirname, '..'),
    configFile: false,
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: resolve(import.meta.dirname, 'fixtures/narration-owners.tsx'),
        formats: ['iife'],
        name: 'NarrationTest',
      },
    },
  })
  script = (Array.isArray(result) ? result[0] : result).output.find(
    (file) => file.type === 'chunk',
  ).code
})

async function fixturePage(t: TestContext) {
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(4000)
  // Keep the user-agent 'playing' event independently controllable from the
  // play() promise. The read-aloud integration tests exercise real WAV decoding.
  await page.addInitScript(() => {
    const audio = (window['audioFixture'] = {
      block: false,
      attempts: 0,
      last: null,
    })
    window['Audio'] = class {
      paused = true
      ended = false
      onplaying
      onended
      onerror
      src
      constructor() {
        audio.last = this
      }
      async play() {
        audio.attempts++
        if (audio.block)
          throw new DOMException('User activation required', 'NotAllowedError')
        this.paused = false
        this.ended = false
      }
      pause() {
        this.paused = true
      }
      load() {}
      removeAttribute() {}
      end() {
        this.ended = this.paused = true
        this.onended?.()
      }
    } as any
  })
  return page
}

test('narration ownership, blocked autoplay, loading pause and terminal callbacks', async (t) => {
  const page = await fixturePage(t)
  const release = Promise.withResolvers<void>()
  t.after(() => release.resolve())
  await page.route('http://127.0.0.1:17381/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/voice/status')
      return route.fulfill({ json: { available: true, model: 'kitten' } })
    if (path === '/api/review/test/speech') {
      const { text } = route.request().postDataJSON()
      if (text === 'held') await release.promise
      if (text === 'rejected')
        return route.fulfill({ status: 503, json: { error: 'Voice offline' } })
      return route.fulfill({
        contentType: 'audio/wav',
        body: Buffer.alloc(64),
      })
    }
    if (path === '/probe.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: script,
      })
    return route.fulfill({
      contentType: 'text/html',
      body: '<div id="root"></div><script src="/probe.js"></script>',
    })
  })
  await page.goto('http://127.0.0.1:17381/')
  await page.waitForFunction(
    () => window['narrationProbe']?.readers.a?.available,
  )

  const start = (id: string, text: string, chain = false) =>
    page.evaluate(
      ([id, text, chain]) => {
        const { readers, events } = window['narrationProbe']
        readers[id].start(text, {
          onPlaying: () => events.push(text + ':playing'),
          onStop: () => events.push(text + ':stop'),
          onEnd: () => {
            events.push(text + ':end')
            if (chain)
              readers[id].start('continued', {
                onStop: () => events.push('continued:stop'),
              })
          },
        })
      },
      [id, text, chain] as const,
    )
  const call = (id: string, action: string) =>
    page.evaluate(
      ([id, action]) => window['narrationProbe'].readers[id][action](),
      [id, action],
    )
  const phase = (id: string, expected: string) =>
    page.waitForFunction(
      ([id, expected]) =>
        window['narrationProbe'].readers[id].phase === expected,
      [id, expected],
    )
  const events = () => page.evaluate(() => window['narrationProbe'].events)

  const pending = page.waitForRequest(
    (r) => r.url().endsWith('/speech') && r.postDataJSON().text === 'held',
  )
  await start('a', 'held')
  await pending
  const initialStart = await page.evaluateHandle(
    () => window['narrationProbe'].readers.a.start,
  )
  await call('b', 'pause')
  await call('b', 'stop')
  await phase('a', 'loading')
  await call('a', 'pause')
  await phase('a', 'paused')
  await call('b', 'resume')
  await phase('a', 'paused')
  await call('a', 'resume')
  await phase('a', 'loading')
  await call('a', 'pause')
  const ready = page.waitForResponse((r) => r.url().endsWith('/speech'))
  release.resolve()
  await (await ready).finished()
  await phase('a', 'paused')
  assert.equal(await page.evaluate(() => window['audioFixture'].attempts), 0)
  await page.evaluate(() => {
    window['audioFixture'].block = true
  })
  await call('a', 'resume')
  await page.waitForFunction(() =>
    window['narrationProbe'].readers.a.message?.includes('Resume'),
  )
  await page.evaluate(() => {
    window['audioFixture'].block = false
  })
  await call('a', 'resume')
  assert.deepEqual(await events(), [])
  await page.evaluate(() => window['audioFixture'].last.onplaying())
  await phase('a', 'playing')
  assert(
    await page.evaluate(
      (first) => first === window['narrationProbe'].readers.a.start,
      initialStart,
    ),
  )
  await start('b', 'chain', true)
  await page.waitForFunction(() => window['audioFixture'].last.paused === false)
  await page.evaluate(() => {
    const media = window['audioFixture'].last
    media.onplaying()
    media.end()
  })
  await page.waitForFunction(() => window['audioFixture'].last.paused === false)
  await call('a', 'stop')
  await call('b', 'stop')
  assert.deepEqual(await events(), [
    'held:playing',
    'held:stop',
    'chain:playing',
    'chain:end',
    'continued:stop',
  ])
  await start('a', 'rejected')
  await phase('a', 'error')
  assert.equal(
    await page.evaluate(() => window['narrationProbe'].readers.a.message),
    'Voice offline',
  )
  await call('a', 'stop')
  await phase('a', 'idle')
  await start('a', 'unmount')
  await page.evaluate(() => window['narrationProbe'].unmountFirst())
  await page.waitForFunction(() =>
    window['narrationProbe'].events.includes('unmount:stop'),
  )
  assert.deepEqual((await events()).slice(5), ['rejected:stop', 'unmount:stop'])
})

test('first WAV bytes trigger exactly one lookahead across chunks and steps', async (t) => {
  const page = await fixturePage(t)
  const texts: string[] = []
  const responses: ServerResponse[] = []
  const http = createServer(async (req, res) => {
    if (req.url === '/api/voice/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ available: true, model: 'kitten' }))
    } else if (req.url === '/api/review/test/speech') {
      let body = ''
      for await (const part of req) body += part
      const { text } = JSON.parse(body)
      texts.push(text)
      responses.push(res)
      if (text === 'Unavailable.') {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Generation failed' }))
      } else if (text === 'Invalid.') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{}')
      } else {
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'X-Content-Type-Options': 'nosniff',
        })
        res.flushHeaders()
      }
    } else if (req.url === '/probe.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' })
      res.end(script)
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<div id="root"></div><script src="/probe.js"></script>')
    }
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    http.closeAllConnections()
    http.close()
  })
  await page.addInitScript(() => {
    const headers = (window['speechHeaders'] = [] as string[])
    const fetch = window.fetch
    window.fetch = async (...args) => {
      const response = await fetch(...args)
      if (String(args[0]).endsWith('/speech'))
        headers.push(JSON.parse(String(args[1].body)).text)
      return response
    }
  })
  await page.goto('http://127.0.0.1:' + (http.address() as AddressInfo).port)
  await page.waitForFunction(
    () => window['narrationProbe']?.readers.a?.available,
  )
  const start = (steps: string[]) =>
    page.evaluate((steps) => {
      const { events, readers } = window['narrationProbe']
      events.length = 0
      readers.a.startSequence(steps, {
        onStep: (index: number) => events.push('step:' + index),
        onStop: () => events.push('stop'),
        onEnd: () => events.push('end'),
      })
    }, steps)
  const events = () => page.evaluate(() => window['narrationProbe'].events)
  const headers = (count: number) =>
    page.waitForFunction(
      (count) => window['speechHeaders'].length >= count,
      count,
    )
  const attempts = (count: number) =>
    page.waitForFunction(
      (count) => window['audioFixture'].attempts === count,
      count,
    )
  const end = () => page.evaluate(() => window['audioFixture'].last.end())
  const step =
    'Architecture '.repeat(19).trim() +
    '. ' +
    'Deployment '.repeat(20).trim() +
    '.'
  const [a, b] = speechChunks(step)
  assert.equal(speechChunks(step).length, 2)
  assert.deepEqual(texts, [])
  await start([step, 'Observe.', 'Unavailable.', 'Unrequested.'])
  await headers(1)
  assert.deepEqual(texts, [a])
  assert.deepEqual(await events(), ['step:0'])
  // One payload byte, with the remainder of the first response still held.
  const buffered = page.waitForResponse(
    (r) => r.url().endsWith('/speech') && r.request().postDataJSON().text === b,
  )
  responses[0].write(Buffer.from('R'))
  await headers(2)
  responses[1].end(Buffer.from('RIFF'))
  await (await buffered).finished()
  await attempts(0)
  assert.deepEqual(texts, [a, b])
  assert.deepEqual(await events(), ['step:0'])
  await page.evaluate(() => {
    window['audioFixture'].block = true
  })
  responses[0].end(Buffer.from('IFF'))
  await page.waitForFunction(() =>
    window['narrationProbe'].readers.a.message?.includes('Resume'),
  )
  assert.deepEqual(texts, [a, b])
  await page.evaluate(() => {
    window['audioFixture'].block = false
    window['narrationProbe'].readers.a.resume()
  })
  await attempts(2)
  await end()
  await headers(3)
  await attempts(3)
  assert.deepEqual(texts, [a, b, 'Observe.'])
  assert.deepEqual(await events(), ['step:0'])
  responses[2].end(Buffer.from('RIFF'))
  await page.evaluate(() => {
    window['narrationProbe'].readers.a.pause()
    window['audioFixture'].last.end()
  })
  assert.deepEqual(await events(), ['step:0'])
  await page.evaluate(() => window['narrationProbe'].readers.a.resume())
  await headers(4)
  await attempts(4)
  assert.deepEqual(await events(), ['step:0', 'step:1'])
  assert.deepEqual(texts, [a, b, 'Observe.', 'Unavailable.'])
  await end()
  await page.waitForFunction(
    () => window['narrationProbe'].readers.a.phase === 'error',
  )
  assert.equal(
    await page.evaluate(() => window['narrationProbe'].readers.a.message),
    'Generation failed',
  )
  assert.deepEqual(await events(), ['step:0', 'step:1', 'step:2', 'stop'])
  assert.equal(texts.length, 4)

  await start(['Before stop.', 'Ahead.', 'Unrequested.'])
  await headers(5)
  responses[4].write(Buffer.from('R'))
  await headers(6)
  const closed = Promise.all(
    responses
      .slice(4)
      .map((res) => new Promise<void>((resolve) => res.once('close', resolve))),
  )
  await page.evaluate(() => window['narrationProbe'].readers.a.stop())
  await closed
  assert.deepEqual(await events(), ['step:0', 'stop'])
  assert.equal(texts.length, 6)

  await start(['Invalid.', 'Unrequested.'])
  await page.waitForFunction(
    () => window['narrationProbe'].readers.a.phase === 'error',
  )
  assert.equal(texts.length, 7)
  assert.deepEqual(await events(), ['step:0', 'stop'])
})
