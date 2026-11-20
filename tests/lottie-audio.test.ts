import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
import { itemSchema } from '../packages/core/src/schema.ts'

const guide = readFileSync(
  new URL(
    '../packages/docs/src/content/docs/interfaces/lottie.md',
    import.meta.url,
  ),
  'utf8',
)
const scene = JSON.parse(guide.match(/```json\n([\s\S]+?)\n```/)[1]).arguments
  .items[0].animation
const title = 'Delivery timing',
  caption = 'The tablet keeps the note until a receipt arrives.'
const item = { kind: 'lottie', title, animation: scene, caption }

function wav(seconds: number) {
  const frames = Math.round(8000 * seconds),
    buffer = Buffer.alloc(44 + frames * 2)
  buffer.write('RIFF')
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * 2, 40)
  return buffer
}
test('Lottie supports an optional, bounded review caption', () => {
  assert.equal(
    itemSchema.safeParse({ ...item, caption: 'x'.repeat(2000) }).success,
    true,
  )
  assert.equal(
    itemSchema.safeParse({ ...item, caption: 'x'.repeat(2001) }).success,
    false,
  )
  assert.equal(
    itemSchema.safeParse({ ...item, caption: undefined }).success,
    true,
  )
})

test('captioned motion waits for audible playback, pauses both tracks and allows either to finish first', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'janotate-lottie-audio-'))
  const server = await start(directory, 0, true, resolve('dist')),
    browser = await chromium.launch(),
    client = new Client({ name: 'lottie-audio', version: '1' })
  t.after(async () => {
    await client.close()
    await browser.close()
    server.close()
    rmSync(directory, { recursive: true, force: true })
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
  )
  const opened = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Playback',
      items: [
        item,
        {
          ...item,
          title: 'Named composition',
          caption: undefined,
          animation: { ...scene, nm: 'The note reaches the server.' },
        },
        {
          ...item,
          title: 'Untitled composition',
          caption: undefined,
          animation: {
            ...scene,
            nm: undefined,
            markers: [{ tm: 3, dr: 0, cm: 'Internal marker' }],
          },
        },
      ],
    },
  })
  assert(!opened.isError)
  const page = await browser.newPage()
  page.setDefaultTimeout(7000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Delay the actual media play event. Fetch completion alone must never
  // advance the visual clock. The rest of this test uses real WAV playback.
  await page.addInitScript(() => {
    const gate = Promise.withResolvers<void>()
    const probe = (window['motionProbe'] = {
      release: gate.resolve,
      media: null as HTMLMediaElement | null,
      ended: 0,
    })
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (probe.media !== this)
        this.addEventListener('ended', () => probe.ended++)
      probe.media = this
      return gate.promise.then(() => play.call(this))
    }
  })
  let available = true
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({ json: { available, model: available ? 'kitten' : null } }),
  )
  const requested: string[] = []
  let seconds = 7,
    fail = false
  await page.route('**/api/review/*/speech', (route) => {
    requested.push(route.request().postDataJSON().text)
    return fail
      ? route.fulfill({
          status: 503,
          json: { error: 'Voice temporarily unavailable.' },
        })
      : route.fulfill({ contentType: 'audio/wav', body: wav(seconds) })
  })
  await page.goto(String(opened.structuredContent.url) + '?view=focus')
  const motion = page.locator('.motion-review:visible'),
    slider = motion.getByRole('slider')
  const button = (name: string) =>
    motion.getByRole('button', { name, exact: true })
  const options = button('Playback options')
  const waitForOptionsFocus = () =>
    page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        'Playback options',
    )
  const audioItem = page.getByRole('menuitem', {
    name: /^(?:Replay|Play) with audio$/,
  })
  async function startAudio() {
    await options.click()
    await audioItem.click()
  }
  const frameValue = async () => Number(await slider.inputValue())
  const waitForFrame = (n: number) =>
    page.waitForFunction(
      (n) =>
        Number(
          document.querySelector<HTMLInputElement>(
            '.kind-lottie:not([hidden]) .motion-review input[type=range]',
          )?.value,
        ) >= n,
      n,
    )
  await motion.getByText(caption, { exact: true }).waitFor()
  assert.equal(await page.getByRole('menuitem').count(), 0)
  assert.equal(
    await motion.getByRole('button', { name: 'Play with audio' }).count(),
    0,
  )
  await options.focus()
  await options.press('ArrowDown')
  await audioItem.waitFor()
  assert.deepEqual(requested, [])
  await page.keyboard.press('Escape')
  await waitForOptionsFocus()
  await options.press('ArrowDown')
  await audioItem.waitFor()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !!window['motionProbe'].media)
  assert.equal(await frameValue(), 0)
  assert.deepEqual(requested, [caption])
  assert(await button('Pause').evaluate((el) => el === document.activeElement))
  await page.evaluate(() => window['motionProbe'].release())
  await waitForFrame(2)
  await button('Pause').click()
  await button('Resume').waitFor()
  const paused = await frameValue()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  await page.waitForTimeout(140)
  assert.equal(await frameValue(), paused)
  await button('Resume').click()
  await waitForFrame(scene.op - 1)
  await button('Stop').waitFor()
  assert(await page.evaluate(() => !window['motionProbe'].media.ended))
  await page.evaluate(() => {
    const media = window['motionProbe'].media
    media.currentTime = media.duration - 0.03
  })
  await options.waitFor()
  await waitForOptionsFocus()

  seconds = 0.15
  await options.click()
  await page
    .getByRole('menuitem', { name: 'Replay with audio', exact: true })
    .click()
  await page.waitForFunction(() => window['motionProbe'].ended >= 2)
  assert((await frameValue()) < scene.op - 1)
  await button('Pause').waitFor()
  await options.waitFor()
  assert.equal(await frameValue(), scene.op - 1)

  seconds = 7
  await startAudio()
  await waitForFrame(2)
  await button('Stop').click()
  await waitForOptionsFocus()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  await startAudio()
  await waitForFrame(2)
  await button('Next frame').click()
  await options.waitFor()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  await startAudio()
  await waitForFrame(2)
  await page.evaluate(() =>
    window.dispatchEvent(new Event('janotate:voice-change')),
  )
  await options.waitFor()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  await startAudio()
  await waitForFrame(2)
  await button('Mark range start').click()
  await options.waitFor()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  fail = true
  await startAudio()
  await motion
    .getByRole('status')
    .filter({ hasText: 'Voice temporarily unavailable.' })
    .waitFor()
  const count = requested.length
  await button('Play').click()
  await waitForFrame(2)
  assert.equal(requested.length, count)
  fail = false
  await startAudio()
  await waitForFrame(2)
  await page.getByLabel('Next review item').click()
  await motion
    .getByText('The note reaches the server.', { exact: true })
    .waitFor()
  assert(await page.evaluate(() => window['motionProbe'].media.paused))
  await startAudio()
  await page.waitForFunction(() => !window['motionProbe'].media.paused)
  assert.equal(requested.at(-1), 'The note reaches the server.')
  await page.getByLabel('Next review item').click()
  await button('Play').waitFor()
  assert.equal(await options.count(), 0)
  assert.equal(await motion.getByText('Internal marker').count(), 0)
  available = false
  const refreshed = page.waitForResponse('**/api/voice/status')
  await page.evaluate(() =>
    window.dispatchEvent(new Event('janotate:voice-change')),
  )
  await refreshed
  await page.getByLabel('Previous review item').click()
  await options.click()
  const beforeSetup = requested.length
  await page
    .getByRole('menuitem', { name: 'Set up audio', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Read-aloud voice' })
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await waitForOptionsFocus()
  assert.equal(requested.length, beforeSetup)
  assert.deepEqual(errors, [])
})
