import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'
import {
  supportsVoiceInstallation,
  voicePackStatus,
  voiceRuntimeVersion,
} from '../packages/server/src/voice-packs.ts'

test('the provider form saves a write-only key and speaks through the Janotate origin', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'janotate-provider-ui-'))
  let requests = 0
  // Silent MPEG-1 Layer III frames, 128 kbps and 44.1 kHz, generated for this test.
  const frame = Buffer.alloc(417)
  frame.writeUInt32BE(0xfffb9000)
  const mp3 = Buffer.concat(Array(100).fill(frame))
  const upstream = createServer((req, res) => {
    requests++
    req.resume()
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(mp3)
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const endpoint =
    'http://127.0.0.1:' + (upstream.address() as AddressInfo).port + '/v1'
  const app = await start(temp, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'provider-ui', version: '1' })
  t.after(async () => {
    await browser.close()
    await client.close()
    app.close()
    upstream.closeAllConnections()
    upstream.close()
    rmSync(temp, { recursive: true, force: true })
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', app.origin)),
  )
  const review = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Provider test',
      items: [
        {
          kind: 'proposal',
          title: 'Release',
          sections: [
            {
              id: 'intro',
              label: 'Introduction',
              body: 'Read the release notes.',
            },
          ],
        },
      ],
    },
  })
  assert(!review.isError)
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
  page.setDefaultTimeout(5000)
  const origins = new Set<string>()
  page.on('request', (req) => {
    if (req.url().startsWith('http')) origins.add(new URL(req.url()).origin)
  })
  await page.goto(review.structuredContent.url as string)
  const voice = page.getByRole('button', { name: 'Voice', exact: true })
  await voice.click()
  const dialog = page.getByRole('dialog', { name: 'Read-aloud voice' })
  await dialog.getByRole('radio', { name: 'ElevenLabs-compatible' }).check()
  await dialog.getByLabel('API base URL').fill(endpoint)
  await dialog.getByLabel('Model ID', { exact: true }).fill('my-model')
  await dialog.getByLabel('Voice ID', { exact: true }).fill('my-voice')
  await dialog.getByLabel('API key', { exact: true }).fill('fixture-ui-key')
  const saved = page.waitForResponse((r) =>
    r.url().endsWith('/api/voice/elevenlabs'),
  )
  await dialog.getByRole('button', { name: 'Save and use provider' }).click()
  assert(!(await (await saved).text()).includes('fixture-ui-key'))
  await dialog.getByRole('button', { name: 'Done' }).click()
  assert.equal(requests, 0)
  await voice.click()
  assert.equal(
    await dialog.getByLabel('API key', { exact: true }).inputValue(),
    '',
  )
  assert.match(
    await dialog
      .getByLabel('API key', { exact: true })
      .getAttribute('placeholder'),
    /Saved key/,
  )
  assert.equal(
    await dialog.getByLabel('Model ID', { exact: true }).inputValue(),
    'my-model',
  )
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page
    .getByRole('button', { name: 'Listen to Introduction', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Pause reading Introduction', exact: true })
    .waitFor()
  await page
    .getByRole('button', { name: 'Stop reading Introduction', exact: true })
    .click()
  assert.equal(requests, 1)
  assert.deepEqual([...origins], [app.origin])
  await voice.click()
  await dialog.getByRole('button', { name: 'Forget connection' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()
  assert.equal(
    await page
      .getByRole('button', { name: 'Listen to Introduction', exact: true })
      .count(),
    0,
  )
})

// Stand-ins for the downloaded model/runtime in this test's private cache.
// The browser never asks this server to synthesize sound.
function seedKitten(root: string) {
  const { directory } = voicePackStatus('kitten')
  const platform =
    (process.platform === 'win32' ? 'win' : process.platform) +
    '-' +
    process.arch
  const runtime = join(
    root,
    'sherpa-' + voiceRuntimeVersion + '-' + platform,
    'node_modules',
  )
  for (const path of [
    ...[
      'model.int8.onnx',
      'voices.bin',
      'tokens.txt',
      'espeak-ng-data/phontab',
      'espeak-ng-data/phondata',
      'espeak-ng-data/phonindex',
      'espeak-ng-data/intonations',
    ].map((p) => join(directory, p)),
    join(runtime, 'sherpa-onnx-node', 'sherpa-onnx.js'),
    join(runtime, 'sherpa-onnx-' + platform, 'sherpa-onnx.node'),
  ]) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'fixture')
  }
  assert(voicePackStatus('kitten').installed)
}

test('reviewers explicitly install, switch or disable a project voice; hosted settings use installed packs', async (t) => {
  if (!supportsVoiceInstallation())
    return t.skip('Local installer unavailable on this platform')
  const temp = mkdtempSync(join(tmpdir(), 'janotate-voice-dialog-'))
  const cache = join(temp, 'cache')
  const previous = process.env.JANOTATE_VOICE_DIR
  process.env.JANOTATE_VOICE_DIR = cache
  const services: Awaited<ReturnType<typeof start>>[] = []
  const browser = await chromium.launch()
  try {
    mkdirSync(join(temp, 'local'))
    mkdirSync(join(temp, 'hosted'))
    const local = await start(join(temp, 'local'), 0, false, resolve('dist'))
    services.push(local)
    const page = await browser.newPage()
    const writes: { model: string | null; install?: boolean }[] = []
    const pending = Promise.withResolvers<void>()
    let firstDownload = true
    await page.route('**/api/voice/settings', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      const body = route.request().postDataJSON()
      writes.push(body)
      if (body.install && firstDownload) {
        firstDownload = false
        await pending.promise
        return route.fulfill({
          status: 503,
          json: { error: 'Download interrupted. Try again.' },
        })
      }
      if (body.install) {
        seedKitten(cache)
        // Download is complete. Test the actual settings writer with the installed pack.
        return route.continue({
          postData: JSON.stringify({ model: body.model }),
        })
      }
      return route.continue()
    })
    await page.addInitScript(() => {
      let changes = 0
      window.addEventListener('janotate:voice-change', () => {
        document.documentElement.dataset.voiceChanges = String(++changes)
      })
    })
    await page.goto(local.origin)
    const trigger = page.getByRole('button', { name: 'Voice', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Read-aloud voice' })
    const kitten = dialog.getByRole('radio', { name: /Kitten Nano/ })
    await kitten.waitFor()
    assert(
      await dialog.getByRole('radio', { name: 'Off', exact: true }).isChecked(),
    )
    await kitten.check()
    await dialog.getByText(/shared speech runtime/).waitFor()
    await dialog.getByText(/31[.,]2 MB model download/).waitFor()
    assert.deepEqual(writes, [])
    await dialog.getByRole('button', { name: 'Install and use' }).click()
    await dialog
      .getByRole('status')
      .filter({ hasText: /Installing Kitten/ })
      .waitFor()
    await page.keyboard.press('Escape')
    assert(await trigger.evaluate((el) => el === document.activeElement))
    await trigger.click()
    await dialog.getByText(/Installing Kitten/).waitFor()
    pending.resolve()
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Download interrupted' })
      .waitFor()
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.voiceChanges),
      undefined,
    )
    await dialog.getByRole('button', { name: 'Install and use' }).click()
    await dialog.getByText('Installed', { exact: true }).waitFor()
    await page.waitForFunction(
      () => document.documentElement.dataset.voiceChanges === '1',
    )
    await dialog.getByRole('radio', { name: 'Off', exact: true }).check()
    await dialog.getByRole('button', { name: 'Turn voice off' }).click()
    await page.waitForFunction(
      () => document.documentElement.dataset.voiceChanges === '2',
    )
    await kitten.check()
    await dialog.getByRole('button', { name: 'Use voice' }).click()
    await page.waitForFunction(
      () => document.documentElement.dataset.voiceChanges === '3',
    )
    assert.deepEqual(writes, [
      { model: 'kitten', install: true },
      { model: 'kitten', install: true },
      { model: null },
      { model: 'kitten' },
    ])
    assert.equal(
      (
        await (
          await page.request.get(local.origin + '/api/voice/settings')
        ).json()
      ).model,
      'kitten',
    )

    const hosted = await start(
      join(temp, 'hosted'),
      0,
      false,
      resolve('dist'),
      { host: '127.0.0.1', uiToken: 'reviewer', mcpToken: 'agent' },
    )
    services.push(hosted)
    await page.setViewportSize({ width: 320, height: 620 })
    await page.goto(hosted.origin + '/?token=reviewer')
    await trigger.click()
    await dialog.getByText(/server operator/).waitFor()
    assert(await dialog.getByRole('radio', { name: /Kokoro/ }).isDisabled())
    await kitten.check()
    await dialog.getByRole('button', { name: 'Use voice' }).click()
    await page.waitForFunction(
      () => document.documentElement.dataset.voiceChanges === '1',
    )
    const box = await dialog.boundingBox()
    assert(box && box.x >= 0 && box.x + box.width <= 320)
    await dialog.getByRole('button', { name: 'Done' }).click()
    assert(await trigger.evaluate((el) => el === document.activeElement))
  } finally {
    await browser.close()
    for (const service of services) service.close()
    if (previous === undefined) delete process.env.JANOTATE_VOICE_DIR
    else process.env.JANOTATE_VOICE_DIR = previous
    rmSync(temp, { recursive: true, force: true })
  }
})
