import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
import {
  supportsVoiceInstallation,
  voicePackStatus,
  voiceRuntimeVersion,
  type VoicePackId,
} from '../packages/server/src/voice-packs.ts'
import { setProjectVoice } from '../packages/server/src/voice-settings.ts'
import { elevenLabsDefaults } from '../packages/server/src/elevenlabs.ts'

function provideFixture(cache: string, id: VoicePackId) {
  const platform =
    (process.platform === 'win32' ? 'win' : process.platform) +
    '-' +
    process.arch
  const modules = join(
    cache,
    'sherpa-' + voiceRuntimeVersion + '-' + platform,
    'node_modules',
  )
  const dir = voicePackStatus(id).directory
  const paths = [
    join(modules, 'sherpa-onnx-node', 'sherpa-onnx.js'),
    join(modules, 'sherpa-onnx-' + platform, 'sherpa-onnx.node'),
    ...[
      'model.int8.onnx',
      'voices.bin',
      'tokens.txt',
      'espeak-ng-data/phontab',
      'espeak-ng-data/phondata',
      'espeak-ng-data/phonindex',
      'espeak-ng-data/intonations',
    ].map((file) => join(dir, file)),
  ]
  if (id === 'kokoro') paths.push(join(dir, 'lexicon-us-en.txt'))
  for (const path of paths) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'fixture')
  }
}

test('voice settings expose safe metadata and persist explicit, same-origin choices', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'janotate-project-voice-')),
    cache = join(temp, 'test-cache'),
    data = join(temp, 'data')
  mkdirSync(data)
  const old = process.env.JANOTATE_VOICE_DIR
  process.env.JANOTATE_VOICE_DIR = cache
  const server = await start(data, 0, false, resolve('dist'))
  try {
    const { origin } = server,
      endpoint = origin + '/api/voice/settings'
    const put = (input: unknown, extra: Record<string, string> = {}) =>
      fetch(endpoint, {
        method: 'PUT',
        headers: { origin, 'content-type': 'application/json', ...extra },
        body: JSON.stringify(input),
      })
    const get = () => fetch(endpoint).then((r) => r.json())
    const expected = {
      model: null,
      elevenlabs: {
        ...elevenLabsDefaults,
        canConfigure: true,
        configured: false,
        hasKey: false,
      },
      packs: [
        {
          id: 'kitten',
          name: 'Kitten Nano 0.8',
          installed: false,
          downloadBytes: 31220690,
        },
        {
          id: 'kokoro',
          name: 'Kokoro 82M v1.0',
          installed: false,
          downloadBytes: 132353410,
        },
      ],
      canInstall: supportsVoiceInstallation(),
    }
    assert.deepEqual(await get(), expected)
    assert.equal((await put({ model: 'kitten' })).status, 409)
    assert.equal((await put({ model: null }, { origin: 'null' })).status, 403)
    assert.equal((await put({ model: null }, { origin: '' })).status, 403)
    assert.equal(
      (await put({ model: null }, { 'content-type': 'text/plain' })).status,
      415,
    )
    assert.equal(
      (await put({ model: null, padding: 'x'.repeat(1200) })).status,
      413,
    )
    for (const invalid of [
      null,
      [],
      {},
      { model: 'other' },
      { model: null, install: true },
      { model: 'kitten', install: 'yes' },
      { model: 'kitten', url: 'https://outside.invalid' },
    ])
      assert.equal((await put(invalid)).status, 400)
    assert.equal(existsSync(cache), false)
    provideFixture(cache, 'kitten')
    const selected = await put({ model: 'kitten' })
    assert.equal(selected.status, 200)
    assert.equal((await selected.json()).model, 'kitten')
    assert.deepEqual(
      await fetch(origin + '/api/voice/status').then((r) => r.json()),
      { model: 'kitten', available: true },
    )
    const originalFetch = globalThis.fetch
    let attempts = 0
    t.mock.method(globalThis, 'fetch', (input, ...args) => {
      if (!String(input).startsWith(origin + '/')) {
        attempts++
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return originalFetch(input, ...args)
    })
    if (expected.canInstall) {
      assert.equal((await put({ model: 'kokoro', install: true })).status, 503)
      assert.equal(attempts, 1)
      assert.equal((await get()).model, 'kitten')
    }
    const installing = Promise.withResolvers<void>()
    const earlier = setProjectVoice(data, 'kokoro', async () => {
      await installing.promise
      provideFixture(cache, 'kokoro')
    })
    const off = await put({ model: null })
    assert.equal(off.status, 200)
    installing.resolve()
    assert.equal(await earlier, null)
    assert.equal((await get()).model, null)
    assert.equal(voicePackStatus('kitten').installed, true)
    const changed = await put({ model: 'kokoro' })
    assert.equal((await changed.json()).model, 'kokoro')
  } finally {
    server.close()
    if (old === undefined) delete process.env.JANOTATE_VOICE_DIR
    else process.env.JANOTATE_VOICE_DIR = old
    rmSync(temp, { recursive: true, force: true })
  }
})

test('voice setup is explicit per project and speech uses reviewer access', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'janotate-voice-api-'))
  const data = join(tmp, 'project')
  const cache = join(tmp, 'voices')
  const previousCache = process.env.JANOTATE_VOICE_DIR
  process.env.JANOTATE_VOICE_DIR = cache
  const cli = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [resolve('bin/janotate.mjs'), 'voice', ...args, '--data', data],
      {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, JANOTATE_VOICE_DIR: cache },
      },
    )
  const client = new Client({ name: 'test', version: '1' })
  let server: Awaited<ReturnType<typeof start>>
  try {
    assert.match(cli('status'), /Project voice: off/)
    assert.throws(() => cli('use', 'kitten'), /voice install kitten/)
    assert.throws(() => cli('install', 'unknown'), /Choose a voice pack/)
    cli('off')
    assert.equal(existsSync(cache), false)
    assert.equal(existsSync(join(data, 'server.json')), false)
    server = await start(data, 0, true, resolve('dist'), {
      host: '127.0.0.1',
      uiToken: 'reviewer',
      mcpToken: 'agent',
    })
    const { origin } = server
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', origin), {
        requestInit: { headers: { authorization: 'Bearer agent' } },
      }),
    )
    const result = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Narration',
        items: [
          {
            kind: 'proposal',
            title: 'Read this proposal',
            sections: [
              { id: 'intro', label: 'Intro', body: 'Review the next step.' },
            ],
          },
        ],
      },
    })
    assert(!result.isError, JSON.stringify(result.content))
    const id = result.structuredContent.review_id
    const headers = { origin, 'content-type': 'application/json' }
    const speech = (
      id: unknown,
      extra: Record<string, string> = {},
      text = 'Listen',
    ) =>
      fetch(origin + '/api/review/' + id + '/speech', {
        method: 'POST',
        headers: { ...headers, ...extra },
        body: JSON.stringify({ text }),
      })
    assert.equal((await fetch(origin + '/api/voice/status')).status, 401)
    assert.equal(
      (await speech(id, { authorization: 'Bearer agent' })).status,
      401,
    )
    const auth = await fetch(origin + '/?token=reviewer', {
      redirect: 'manual',
    })
    const cookie = auth.headers.get('set-cookie').split(';')[0]
    const status = await fetch(origin + '/api/voice/status', {
      headers: { cookie },
    })
    assert.deepEqual(await status.json(), { available: false, model: null })
    const endpoint = origin + '/api/voice/settings'
    assert.equal((await fetch(endpoint)).status, 401)
    assert.equal(
      (await fetch(endpoint, { headers: { authorization: 'Bearer agent' } }))
        .status,
      401,
    )
    assert.equal(
      (await fetch(endpoint, { headers: { cookie } }).then((r) => r.json()))
        .canInstall,
      false,
    )
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'PUT',
          headers: { cookie, ...headers },
          body: JSON.stringify({ model: 'kokoro', install: true }),
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'PUT',
          headers: { cookie, ...headers },
          body: JSON.stringify({ model: null }),
        })
      ).status,
      200,
    )
    assert.equal((await speech(id, { cookie, origin: 'null' })).status, 403)
    assert.equal((await speech(id, { cookie, origin: '' })).status, 403)
    assert.equal((await speech(id, { cookie })).status, 503)
    assert.equal((await speech('missing', { cookie })).status, 404)
    assert.equal(
      (await speech(id, { cookie, 'content-type': 'text/plain' })).status,
      415,
    )
    assert.equal((await speech(id, { cookie }, 'a'.repeat(14000))).status, 413)
    provideFixture(cache, 'kitten')
    const hostedSelect = await fetch(endpoint, {
      method: 'PUT',
      headers: { cookie, ...headers },
      body: JSON.stringify({ model: 'kitten' }),
    })
    assert.equal(hostedSelect.status, 200)
    assert.equal((await hostedSelect.json()).model, 'kitten')
  } finally {
    await client.close()
    server?.close()
    if (previousCache === undefined) delete process.env.JANOTATE_VOICE_DIR
    else process.env.JANOTATE_VOICE_DIR = previousCache
    rmSync(tmp, { recursive: true, force: true })
  }
})
