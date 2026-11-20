import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer, type ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
import { voiceCommand } from '../packages/server/src/voice-settings.ts'

test('the operator CLI configures, selects and forgets the provider with a write-only key', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'janotate-provider-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const module = new URL('../packages/server/src/cli.ts', import.meta.url).href
  const secret = 'fixture-cli-key'
  const run = (...args: string[]) => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        'import {main} from ' + JSON.stringify(module) + '; await main()',
        'voice',
        ...args,
        '--data',
        dir,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          JANOTATE_ELEVENLABS_ENDPOINT: 'http://127.0.0.1:1/v1',
          JANOTATE_ELEVENLABS_API_KEY: secret,
          JANOTATE_ELEVENLABS_MODEL_ID: 'operator-model',
          JANOTATE_ELEVENLABS_VOICE_ID: 'operator-voice',
        },
      },
    )
    assert(!output.includes(secret))
    return output
  }
  assert.match(run('status'), /Project voice: off/)
  run('configure-elevenlabs')
  assert.match(run('status'), /Project voice: ElevenLabs-compatible/)
  run('off')
  run('use', 'elevenlabs')
  const saved = JSON.parse(readFileSync(join(dir, 'voice.json'), 'utf8'))
  assert.equal(saved.elevenlabs.modelId, 'operator-model')
  assert.equal(saved.elevenlabs.apiKey, secret)
  run('forget-elevenlabs')
  assert.match(run('status'), /Project voice: off/)
  assert(!readFileSync(join(dir, 'voice.json'), 'utf8').includes(secret))
})

test('project speech streams from the selected provider, protects its key and restricts hosted configuration', async (t) => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-provider-'))
  const calls: {
    url: string
    key?: string
    body: { text: string; model_id: string }
  }[] = []
  const held = Promise.withResolvers<ServerResponse>()
  const upstream = createServer(async (req, res) => {
    let body = ''
    for await (const bytes of req) body += bytes
    const input = JSON.parse(body)
    calls.push({
      url: req.url,
      key: req.headers['xi-api-key'] as string,
      body: input,
    })
    if (input.text === 'Redirect')
      return res.writeHead(307, { Location: '/trap' }).end()
    if (input.text === 'Rejected')
      return res.writeHead(401).end('fixture-server-key echoed by upstream')
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
    res.write(Buffer.from([0xff, 0xfb]))
    if (input.text === 'Stream') held.resolve(res)
    else res.end()
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (upstream.address() as AddressInfo).port
  let app = await start(data, 0, false, resolve('dist'))
  const client = new Client({ name: 'tts', version: '1' })
  t.after(async () => {
    await client.close()
    app.close()
    upstream.closeAllConnections()
    upstream.close()
    rmSync(data, { recursive: true, force: true })
  })
  const update = (config: unknown, origin = app.origin, cookie = '') =>
    fetch(app.origin + '/api/voice/elevenlabs', {
      method: 'PUT',
      headers: { origin, cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
  const metadata = (cookie = '') =>
    fetch(app.origin + '/api/voice/settings', { headers: { cookie } }).then(
      (r) => r.json(),
    )
  const config = {
    endpoint: base + '/proxy/v1/',
    modelId: 'fixture-model',
    voiceId: 'voice_1',
    apiKey: 'fixture-server-key',
  }
  assert.equal((await update(config, 'https://other.invalid')).status, 403)
  for (const endpoint of [
    'file:///tmp',
    'http://outside.invalid/v1',
    'https://user:pw@outside.invalid',
    base + '/?key=in-url',
    base + '/#secret',
  ]) {
    assert.equal((await update({ ...config, endpoint })).status, 400)
  }
  const setup = await update(config)
  assert.equal(setup.status, 200)
  assert(!(await setup.text()).includes(config.apiKey))
  assert.equal((await metadata()).elevenlabs.hasKey, true)
  if (process.platform !== 'win32')
    assert.equal(statSync(join(data, 'voice.json')).mode & 0o777, 0o600)
  assert.equal(calls.length, 0)
  const { apiKey, ...publicConfig } = config
  assert.equal(
    (await update({ ...publicConfig, modelId: 'updated-model' })).status,
    200,
  )
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', app.origin)),
  )
  const review = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Cloud narration',
      mode: 'workspace',
      items: [
        {
          kind: 'proposal',
          title: 'Read this',
          sections: [
            { id: 'intro', label: 'Intro', body: 'Review the next step.' },
          ],
        },
      ],
    },
  })
  assert(!review.isError, JSON.stringify(review.content))
  const id = review.structuredContent.review_id
  const speech = (text: string, cookie = '', signal?: AbortSignal) =>
    fetch(app.origin + '/api/review/' + id + '/speech', {
      method: 'POST',
      headers: {
        origin: app.origin,
        cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal,
    })
  assert.equal((await speech('x'.repeat(801))).status, 400)
  const controller = new AbortController()
  const streamed = await speech('Stream', '', controller.signal)
  assert.equal(streamed.headers.get('content-type'), 'audio/mpeg')
  const first = await streamed.body.getReader().read()
  assert.deepEqual([...first.value], [0xff, 0xfb])
  assert.deepEqual(calls, [
    {
      url: '/proxy/v1/text-to-speech/voice_1/stream?output_format=mp3_44100_128',
      key: apiKey,
      body: { text: 'Stream', model_id: 'updated-model' },
    },
  ])
  const upstreamResponse = await held.promise
  const aborted = new Promise<void>((resolve) =>
    upstreamResponse.once('close', resolve),
  )
  controller.abort()
  await aborted
  for (const text of ['Rejected', 'Redirect']) {
    const result = await speech(text)
    assert.equal(result.status, 503)
    assert(!(await result.text()).includes(apiKey))
  }
  assert(!calls.some((call) => call.url === '/trap'))
  // A saved key cannot silently move when the operator changes the destination.
  assert.equal(
    (await update({ ...publicConfig, endpoint: base + '/another/v1' })).status,
    200,
  )
  assert.equal((await metadata()).elevenlabs.hasKey, false)
  await (await speech('Changed endpoint')).arrayBuffer()
  assert.equal(calls.at(-1).key, undefined)
  await client.close()
  app.close()
  app = await start(data, 0, false, resolve('dist'), {
    host: '127.0.0.1',
    uiToken: 'reviewer',
    mcpToken: 'agent',
  })
  assert.equal((await update(config)).status, 401)
  const auth = await fetch(app.origin + '/?token=reviewer', {
    redirect: 'manual',
  })
  const cookie = auth.headers.get('set-cookie').split(';')[0]
  assert.deepEqual((await metadata(cookie)).elevenlabs, {
    canConfigure: false,
    configured: true,
  })
  assert.equal((await update(config, app.origin, cookie)).status, 403)
  assert.equal(
    (
      await fetch(app.origin + '/api/voice/elevenlabs', {
        method: 'DELETE',
        headers: { origin: app.origin, cookie },
      })
    ).status,
    403,
  )
  assert.equal((await speech('Hosted narration', cookie)).status, 200)
  await voiceCommand(data, ['forget-elevenlabs'])
  assert.equal((await speech('Disabled', cookie)).status, 503)
  assert.equal(
    JSON.parse(readFileSync(join(data, 'voice.json'), 'utf8')).elevenlabs,
    undefined,
  )
})
