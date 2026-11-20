import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'

// Long enough that Chromium will only finish the fixture clip when the test seeks it.
function clip() {
  const rate = 8000,
    samples = rate * 30,
    wav = Buffer.alloc(44 + 2 * samples)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(2 * rate, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(2 * samples, 40)
  return wav
}

test('diagram narration follows complete audio, keeps paused steps, and stops on review interactions', async (t) => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-diagram-audio-'))
  const server = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'diagram-audio', version: '1' })
  const ready = Promise.withResolvers<void>()
  t.after(async () => {
    ready.resolve()
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true, force: true })
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
  )
  const opened = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Architecture',
      items: [
        {
          kind: 'diagram',
          title: 'Delivery path',
          spec: 'flowchart LR\nA[Gateway] --> B[Queue]',
          walkthrough: [
            {
              label: 'Receive',
              description: 'The gateway checks the note.',
              targets: ['node:A'],
            },
            {
              label: 'Deliver',
              description: 'The queue accepts the note.',
              targets: ['node:B'],
            },
            {
              label: 'Acknowledge',
              description: 'The gateway confirms delivery.',
              targets: ['node:A'],
            },
          ],
          variants: [
            {
              id: 'retry',
              label: 'Retry route',
              spec: 'flowchart LR\nR[Retry queue]',
              walkthrough: [
                {
                  label: 'Retry',
                  description: 'Wait for delivery.',
                  targets: ['node:R'],
                },
              ],
            },
          ],
        },
        {
          kind: 'proposal',
          title: 'Delivery policy',
          sections: [
            {
              id: 'receipts',
              label: 'Receipts',
              body: 'Keep the delivery receipt.',
            },
          ],
        },
      ],
    },
  })
  assert(!opened.isError, JSON.stringify(opened.content))
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(() => {
    const native = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      window['diagramClip'] = this
      if (window['denyDiagramClip']) {
        window['denyDiagramClip'] = false
        return Promise.reject(
          new DOMException('Use a gesture', 'NotAllowedError'),
        )
      }
      return native.call(this)
    }
  })
  let available = true,
    fail = false,
    failAhead = false
  const texts: string[] = []
  const wav = clip()
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({ json: { available, model: available ? 'kitten' : null } }),
  )
  await page.route('**/speech', async (route) => {
    texts.push(route.request().postDataJSON().text)
    if (texts.length === 1) await ready.promise
    if (
      fail ||
      (failAhead && route.request().postDataJSON().text.startsWith('Deliver\n'))
    )
      return route.fulfill({
        status: 503,
        json: { error: 'Local synthesis failed.' },
      })
    await route.fulfill({ contentType: 'audio/wav', body: wav })
  })
  await page.goto((opened.structuredContent as { url: string }).url)
  const walk = page.getByRole('region', { name: 'Diagram walkthrough' })
  const button = (name: string) =>
    walk.getByRole('button', { name, exact: true })
  const options = button('Playback options'),
    pause = button('Pause narrated walkthrough'),
    resume = button('Resume narrated walkthrough')
  async function audioAction(name = 'Play with audio') {
    await options.click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  const moving = page.locator('.graph-surface[data-walkthrough-playing]')
  const finish = () =>
    page.evaluate(() => {
      const a = window['diagramClip']
      a.currentTime = a.duration - 0.04
    })
  const voiceChanged = () =>
    page.evaluate(() =>
      window.dispatchEvent(new Event('janotate:voice-change')),
    )
  await options.waitFor()
  await button('Play walkthrough').waitFor()
  assert.equal(await button('Play with audio').count(), 0)
  assert.deepEqual(texts, [])
  await options.focus()
  await page.keyboard.press('Enter')
  const audioChoice = page.getByRole('menuitem', {
    name: 'Play with audio',
    exact: true,
  })
  await audioChoice.focus()
  await page.keyboard.press('Enter')
  await walk.getByText('Preparing audio…').waitFor()
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      'Pause narrated walkthrough',
  )
  await pause.click()
  await resume.waitFor()
  const firstResponse = page.waitForResponse((r) => r.url().endsWith('/speech'))
  const secondRequest = page.waitForRequest(
    (r) =>
      r.url().endsWith('/speech') &&
      r.postDataJSON().text.startsWith('Deliver\n'),
  )
  ready.resolve()
  await firstResponse
  await secondRequest
  await walk.getByText('Step 1 of 3').waitFor()
  assert(!(await page.evaluate(() => !!window['diagramClip'])))
  await resume.click()
  await moving.waitFor()
  await pause.click()
  await moving.waitFor({ state: 'hidden' })
  assert(await page.evaluate(() => window['diagramClip'].paused))
  await resume.click()
  await moving.waitFor()
  // The silent player would change steps after 4s; hearing this clip keeps its own clock.
  await page.waitForTimeout(4150)
  await walk.getByText('Step 1 of 3').waitFor()
  assert.deepEqual(
    texts,
    [
      'Receive\n\nThe gateway checks the note.',
      'Deliver\n\nThe queue accepts the note.',
    ],
    'Only one future caption is synthesized while the first is audible',
  )
  assert.equal(
    await walk
      .getByRole('button', { name: 'Listen to Walkthrough caption' })
      .count(),
    0,
  )
  await page.evaluate(() => {
    window['denyDiagramClip'] = true
  })
  await finish()
  await walk.getByText('Step 2 of 3').waitFor()
  await resume.waitFor()
  await walk
    .getByRole('status')
    .filter({ hasText: /Resume/ })
    .waitFor()
  await resume.click()
  await moving.waitFor()
  await finish()
  await walk.getByText('Step 3 of 3').waitFor()
  await moving.waitFor()
  assert.equal(await options.count(), 0)
  assert.equal(texts.at(-1), 'Acknowledge\n\nThe gateway confirms delivery.')
  await finish()
  await options.waitFor()
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') === 'Playback options',
  )
  failAhead = true
  const queuedFailure = page.waitForResponse(
    (r) =>
      r.url().endsWith('/speech') &&
      r.request().postDataJSON().text.startsWith('Deliver\n') &&
      r.status() === 503,
  )
  await audioAction('Replay with audio')
  await walk.getByText('Step 1 of 3').waitFor()
  await queuedFailure
  await moving.waitFor()
  assert.equal(await walk.getByText('Local synthesis failed.').count(), 0)
  await button('Next walkthrough step').click()
  await options.waitFor()
  failAhead = false
  assert.equal(await walk.getByText('Local synthesis failed.').count(), 0)
  assert(await page.evaluate(() => window['diagramClip'].paused))
  await audioAction()
  await moving.waitFor()
  await page
    .getByRole('group', { name: 'Diagram nodes' })
    .getByRole('button', { name: 'Gateway' })
    .click()
  await options.waitFor()
  await audioAction()
  await moving.waitFor()
  await page.getByRole('button', { name: 'Retry route' }).click()
  await walk.getByText('Step 1 of 1').waitFor()
  await options.waitFor()
  assert(await page.evaluate(() => window['diagramClip'].paused))
  const beforeSilent = texts.length
  await button('Play walkthrough').click()
  await button('Pause walkthrough').click()
  assert.equal(texts.length, beforeSilent)
  fail = true
  await audioAction()
  await walk.getByText('Local synthesis failed.').waitFor()
  fail = false
  await audioAction()
  await moving.waitFor()
  await finish()
  await options.waitFor()
  assert.equal(texts.at(-1), 'Retry\n\nWait for delivery.')
  await audioAction('Replay with audio')
  await moving.waitFor()
  await page
    .getByRole('button', { name: 'Listen to Receipts', exact: true })
    .click()
  await options.waitFor()
  await page
    .getByRole('button', { name: 'Stop reading Receipts', exact: true })
    .click()
  await audioAction()
  await moving.waitFor()
  await page.getByRole('button', { name: /^Threads/ }).click()
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await options.waitFor()
  assert(await page.evaluate(() => window['diagramClip'].paused))
  await audioAction()
  await moving.waitFor()
  available = false
  await voiceChanged()
  await options.waitFor()
  await options.click()
  const setup = page.getByRole('menuitem', {
    name: 'Set up audio',
    exact: true,
  })
  await setup.waitFor()
  assert.equal(await moving.count(), 0)
  const speechBeforeSetup = texts.length
  await setup.click()
  const voiceSettings = page.getByRole('dialog', { name: 'Read-aloud voice' })
  await voiceSettings.waitFor()
  await page.keyboard.press('Escape')
  await voiceSettings.waitFor({ state: 'hidden' })
  assert(await options.evaluate((el) => el === document.activeElement))
  assert.equal(texts.length, speechBeforeSetup)
  assert.deepEqual(pageErrors, [])
})
