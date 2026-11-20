import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'
import { speechChunks } from '../packages/ui/src/speech-chunks.ts'

test('speech chunks preserve words and Unicode within the synthesis limit', () => {
  const longWord = '🪁'.repeat(500)
  const text = [
    'First paragraph.',
    'Second sentence! '.repeat(50),
    longWord,
    '界'.repeat(1903),
    'Done.',
  ].join('\n\n')
  const chunks = speechChunks(text)
  assert.equal(chunks.join('').replace(/\s/gu, ''), text.replace(/\s/gu, ''))
  assert(chunks.some((chunk) => chunk.trimEnd() === longWord))
  assert(chunks.every((c) => c.length > 0 && Array.from(c).length <= 800))
  assert.deepEqual(speechChunks(' \t '), [])
  assert.deepEqual(speechChunks('a'.repeat(315) + '\r\n\r\nNext line.'), [
    'a'.repeat(315) + '\n\n',
    'Next line.',
  ])
  assert.deepEqual(speechChunks('z'.repeat(800)), ['z'.repeat(800)])
  const honorific = speechChunks(
    'a'.repeat(310) + ' Dr. Hernandez continues reading. Next sentence.',
  )
  assert(honorific.some((chunk) => chunk.includes('Dr. Hernandez')))
})

function silentWav(samples: number) {
  const rate = 8000
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  return wav
}

test('local read aloud is opt-in and cancels audio and pending speech when navigating', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'janotate-listen-'))
  const server = await start(dir, 0, true, resolve('dist'))
  const browser = await chromium.launch({
    args: ['--autoplay-policy=document-user-activation-required'],
  })
  const client = new Client({ name: 'speech-test', version: '1' })
  const release = Promise.withResolvers<void>()
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const longText = 'Confirm that every device receives the update. '
      .repeat(17)
      .trim()
    const opened = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Release proposal',
        items: [
          {
            kind: 'proposal',
            title: 'Release plan',
            sections: [
              {
                id: 'launch',
                label: 'Launch',
                body: 'Ship the update after sign-off.',
              },
              { id: 'measure', label: 'Measure', body: longText },
            ],
          },
          {
            kind: 'diagram',
            title: 'Delivery',
            spec: 'flowchart LR\nA[Store] --> B[Notify]',
            walkthrough: [
              {
                label: 'Store events',
                description: 'Record the event first.',
                targets: ['node:A'],
              },
              {
                label: 'Notify clients',
                description: 'Send the delivery notice.',
                targets: ['node:B'],
              },
            ],
          },
        ],
      },
    })
    assert(!opened.isError, JSON.stringify(opened.content))
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      const nativeFetch = window.fetch
      window.fetch = function (input, init) {
        if (String(input).endsWith('/speech')) {
          init?.signal?.addEventListener(
            'abort',
            () => {
              document.documentElement.dataset.speechAborted = 'true'
            },
            { once: true },
          )
        }
        return nativeFetch.call(this, input, init)
      }
    })
    page.setDefaultTimeout(6500)
    let installed = false
    let response: 'audio' | 'held' | 'unavailable' | 'short' = 'audio'
    const requested: string[] = []
    await page.route('**/api/voice/status', (route) =>
      route.fulfill({
        json: { available: installed, model: installed ? 'kitten' : null },
      }),
    )
    await page.route('**/api/review/*/speech', async (route) => {
      requested.push(route.request().postDataJSON().text)
      if (response === 'unavailable') {
        await route.fulfill({
          status: 503,
          json: { error: 'Local voice is unavailable.' },
        })
      } else {
        if (response === 'held') await release.promise
        await route.fulfill({
          contentType: 'audio/wav',
          body: silentWav(response === 'short' ? 800 : 48000),
        })
      }
    })
    const status = page.waitForResponse('**/api/voice/status')
    await page.goto((opened.structuredContent as { url: string }).url)
    await status
    await page.getByRole('heading', { name: 'Launch' }).waitFor()
    assert.equal(
      await page.getByRole('button', { name: /^Listen to / }).count(),
      0,
    )
    installed = true
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const launch = page.getByRole('group', { name: 'Read aloud · Launch' })
    const measure = page.getByRole('group', { name: 'Read aloud · Measure' })
    const caption = page.getByRole('group', {
      name: 'Read aloud · Walkthrough caption',
    })
    const journey = page.getByRole('group', {
      name: 'Read aloud · Journey stop',
    })
    const button = (group, name) =>
      group.getByRole('button', { name: new RegExp('^' + name + ' ') })
    await button(launch, 'Listen').waitFor()
    const comment = page.getByRole('button', {
      name: 'Comment on section Launch',
    })
    await comment.hover()
    await page
      .getByRole('tooltip', { name: 'Comment on section Launch' })
      .waitFor()
    await page.keyboard.press('Escape')
    await comment.press('Enter')
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        'Comment on section:launch',
    )
    assert.deepEqual(requested, [])
    await button(launch, 'Listen').press('Enter')
    await button(launch, 'Pause').click()
    await button(launch, 'Resume').press('Enter')
    await button(launch, 'Pause').waitFor()
    assert.deepEqual(requested, ['Launch\n\nShip the update after sign-off.'])
    await button(caption, 'Listen').click()
    await button(caption, 'Pause').waitFor()
    await button(launch, 'Listen').waitFor()
    assert.equal(requested.at(-1), 'Store events\n\nRecord the event first.')
    await page.getByRole('button', { name: 'Next walkthrough step' }).click()
    await button(caption, 'Listen').waitFor()
    await page.getByRole('button', { name: 'Start guide' }).click()
    response = 'held'
    await page.evaluate(
      () => delete document.documentElement.dataset.speechAborted,
    )
    await button(journey, 'Listen').click()
    await button(journey, 'Preparing').waitFor()
    await page.getByRole('button', { name: 'Next stop' }).click()
    await page.waitForFunction(
      () => document.documentElement.dataset.speechAborted === 'true',
    )
    release.resolve()
    await button(journey, 'Listen').waitFor()
    response = 'unavailable'
    await button(journey, 'Listen').click()
    await page
      .getByText('Local voice is unavailable.', { exact: true })
      .waitFor()
    response = 'short'
    const before = requested.length
    const lastChunk = speechChunks('Measure\n\n' + longText).at(-1)
    const finishedRequest = page.waitForRequest(
      (r) => r.url().endsWith('/speech') && r.postDataJSON().text === lastChunk,
    )
    await button(measure, 'Listen').click()
    await finishedRequest
    await button(measure, 'Listen').waitFor()
    assert.deepEqual(
      requested.slice(before),
      speechChunks('Measure\n\n' + longText),
    )
    response = 'audio'
    await button(launch, 'Listen').click()
    await button(launch, 'Stop').click()
    assert(
      await button(launch, 'Listen').evaluate(
        (el) => el === document.activeElement,
      ),
    )
    await button(launch, 'Listen').click()
    await button(launch, 'Pause').waitFor()
    await page.getByRole('button', { name: /^Threads/ }).click()
    await page.getByRole('button', { name: 'Items', exact: true }).click()
    await button(launch, 'Listen').waitFor()
    await button(launch, 'Listen').click()
    await button(launch, 'Pause').waitFor()
    installed = false
    await page.evaluate(() =>
      window.dispatchEvent(new Event('janotate:voice-change')),
    )
    await launch.waitFor({ state: 'detached' })
    assert(await comment.isVisible())

    const mobile = await browser.newPage({
      viewport: { width: 320, height: 740 },
      hasTouch: true,
      isMobile: true,
    })
    await mobile.route('**/api/voice/status', (route) =>
      route.fulfill({ json: { available: true, model: 'kitten' } }),
    )
    await mobile.goto((opened.structuredContent as { url: string }).url)
    const phoneListen = mobile.getByRole('button', {
      name: 'Listen to Launch',
      exact: true,
    })
    const phoneComment = mobile.getByRole('button', {
      name: 'Comment on section Launch',
      exact: true,
    })
    await phoneListen.waitFor()
    const title = await mobile
      .getByRole('heading', { name: 'Launch', exact: true })
      .boundingBox()
    const sound = await phoneListen.boundingBox(),
      note = await phoneComment.boundingBox()
    assert(
      sound.width >= 44 &&
        sound.height >= 44 &&
        note.width >= 44 &&
        note.height >= 44,
    )
    assert(Math.abs(sound.y - note.y) <= 1 && sound.x + sound.width <= note.x)
    assert(
      title.x + title.width <= sound.x + 1 &&
        title.y < sound.y + sound.height &&
        note.x + note.width <= 320,
    )
    await phoneComment.tap()
    await mobile.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        'Comment on section:launch',
    )
    const captionTitle = mobile.getByText('Store events', { exact: true })
    const captionSpeaker = mobile.getByRole('button', {
      name: 'Listen to Walkthrough caption',
    })
    const captionBox = await captionTitle.boundingBox()
    const captionButton = await captionSpeaker.boundingBox()
    assert(
      captionBox.x + captionBox.width <= captionButton.x + 1 &&
        captionBox.y < captionButton.y + captionButton.height,
    )
    const phoneGuide = mobile.getByRole('navigation', {
      name: 'Guided review',
    })
    await phoneGuide.getByRole('button', { name: 'Expand guide' }).tap()
    await phoneGuide.getByRole('button', { name: 'Start guide' }).tap()
    const stopTitle = await phoneGuide
      .getByText('Launch', { exact: true })
      .boundingBox()
    const guideButton = await phoneGuide
      .getByRole('button', { name: 'Listen to Journey stop' })
      .boundingBox()
    assert(
      stopTitle.x + stopTitle.width <= guideButton.x + 1 &&
        stopTitle.y < guideButton.y + guideButton.height,
    )
    assert(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await mobile.close()

    // Start a clip from script in a fresh document: Chromium requires a real
    // user gesture before its first audible playback in this context.
    const blocked = await browser.newPage()
    blocked.setDefaultTimeout(5000)
    let clips = 0
    await blocked.route('**/api/voice/status', (route) =>
      route.fulfill({ json: { available: true, model: 'kitten' } }),
    )
    await blocked.route('**/api/review/*/speech', (route) => {
      clips++
      return route.fulfill({
        contentType: 'audio/wav',
        body: silentWav(48000),
      })
    })
    await blocked.addInitScript(() => {
      const nativePlay = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        const result = nativePlay.call(this)
        result.catch((error) =>
          console.debug('native media policy: ' + error.name),
        )
        return result
      }
      const changes = new MutationObserver(() => {
        const listen = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Listen to Launch"]',
        )
        if (listen) {
          changes.disconnect()
          listen.click()
        }
      })
      changes.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
      })
    })
    // An early Playwright DOM query can activate the document. Wait for the
    // browser's own rejection before crossing that boundary.
    const denied = blocked.waitForEvent(
      'console',
      (msg) => msg.text() === 'native media policy: NotAllowedError',
    )
    await blocked.goto((opened.structuredContent as { url: string }).url)
    await denied
    await blocked.getByText('Audio is ready. Press Resume to play.').waitFor()
    await blocked
      .getByRole('button', { name: 'Resume reading Launch', exact: true })
      .click()
    await blocked
      .getByRole('button', { name: 'Pause reading Launch', exact: true })
      .waitFor()
    assert.equal(clips, 1)
    await blocked.close()
  } finally {
    release.resolve()
    await client.close()
    await browser.close()
    server.close()
    rmSync(dir, { recursive: true })
  }
})

test('read aloud prepares one clip ahead before playback and defers its errors until the boundary', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'janotate-voice-buffer-'))
  const server = await start(dir, 0, true, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'voice-buffer', version: '1' })
  const held = Promise.withResolvers<void>()
  t.after(async () => {
    held.resolve()
    await client.close()
    await browser.close()
    server.close()
    rmSync(dir, { recursive: true })
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
  )
  const body = Array.from(
    { length: 42 },
    (_, i) => `Review item ${i + 1} before releasing this patch.`,
  ).join(' ')
  const chunks = speechChunks('Rollout\n\n' + body)
  assert(chunks.length >= 4)
  const opened = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Shipping',
      items: [
        {
          kind: 'proposal',
          title: 'Rollout plan',
          sections: [{ id: 'rollout', label: 'Rollout', body }],
        },
      ],
    },
  })
  assert(!opened.isError, JSON.stringify(opened.content))
  const page = await browser.newPage()
  page.setDefaultTimeout(6500)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const gate = Promise.withResolvers<void>()
    const state = (window['voiceProbe'] = {
      allowPlay: gate.resolve,
      attempted: false,
      media: null as HTMLMediaElement | null,
      signals: [] as AbortSignal[],
      urls: new Set<string>(),
    })
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      state.attempted = true
      state.media = this
      return gate.promise.then(() => play.call(this))
    }
    const fetch = window.fetch
    window.fetch = function (input, init) {
      if (String(input).endsWith('/speech')) state.signals.push(init.signal)
      return fetch.call(this, input, init)
    }
    const create = URL.createObjectURL
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      state.urls.add(url)
      return url
    }
    const revoke = URL.revokeObjectURL
    URL.revokeObjectURL = (url) => {
      state.urls.delete(url)
      revoke(url)
    }
  })
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({ json: { available: true, model: 'kitten' } }),
  )
  const requests: string[] = []
  let second: 'ok' | 'held' | 'failure' = 'ok'
  await page.route('**/api/review/*/speech', async (route) => {
    const text = route.request().postDataJSON().text
    requests.push(text)
    if (text === chunks[1] && second === 'failure') {
      await route.fulfill({
        status: 503,
        json: { error: 'Next clip could not be generated.' },
      })
      return
    }
    if (text === chunks[1] && second === 'held') await held.promise
    await route.fulfill({ contentType: 'audio/wav', body: silentWav(240000) })
  })
  await page.goto((opened.structuredContent as { url: string }).url)
  const reader = page.getByRole('group', { name: 'Read aloud · Rollout' })
  const button = (name: string) =>
    reader.getByRole('button', { name: new RegExp('^' + name + ' ') })
  const clipResponse = (index: number) =>
    page.waitForResponse(
      (res) =>
        res.url().endsWith('/speech') &&
        res.request().postDataJSON().text === chunks[index],
    )
  const finishClip = () =>
    page.evaluate(() => {
      const media = window['voiceProbe'].media
      media.currentTime = media.duration - 0.025
    })
  const buffered = clipResponse(1)
  await button('Listen').click()
  await (await buffered).finished()
  await page.waitForFunction(() => window['voiceProbe'].attempted)
  assert.deepEqual(requests, chunks.slice(0, 2))
  await page.evaluate(() => window['voiceProbe'].allowPlay())
  await button('Pause').click()
  await button('Resume').click()
  await button('Pause').waitFor()
  assert.deepEqual(requests, chunks.slice(0, 2))
  assert(
    await page.evaluate(
      () =>
        !window['voiceProbe'].media.ended &&
        window['voiceProbe'].urls.size === 1,
    ),
  )
  const third = clipResponse(2)
  await finishClip()
  await (await third).finished()
  assert.deepEqual(requests, chunks.slice(0, 3))
  await button('Stop').click()
  assert.equal(await page.evaluate(() => window['voiceProbe'].urls.size), 0)

  second = 'failure'
  const failure = clipResponse(1)
  await button('Listen').click()
  await (await failure).finished()
  await button('Pause').waitFor()
  assert.equal(
    await page
      .getByText('Next clip could not be generated.', { exact: true })
      .count(),
    0,
  )
  assert(await page.evaluate(() => !window['voiceProbe'].media.paused))
  await finishClip()
  await page
    .getByText('Next clip could not be generated.', { exact: true })
    .waitFor()

  second = 'held'
  const waiting = page.waitForRequest(
    (req) =>
      req.url().endsWith('/speech') && req.postDataJSON().text === chunks[1],
  )
  await button('Listen').click()
  await waiting
  await page.getByRole('button', { name: /^Threads/ }).click()
  await page.waitForFunction(() => window['voiceProbe'].signals.at(-1).aborted)
  assert(
    await page.evaluate(
      () =>
        window['voiceProbe'].media.paused &&
        window['voiceProbe'].urls.size === 0,
    ),
  )
  held.resolve()
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await button('Listen').waitFor()
  assert.deepEqual(errors, [])
})
