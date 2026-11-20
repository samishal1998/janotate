import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { lottieAnimation } from '../packages/core/src/lottie.ts'
import { start } from '../packages/server/src/http.ts'

const doc = readFileSync(
  new URL(
    '../packages/docs/src/content/docs/interfaces/lottie.md',
    import.meta.url,
  ),
  'utf8',
)
const example = JSON.parse(doc.match(/```json\n([\s\S]+?)\n```/)[1])
const scene = example.arguments.items[0].animation

test('motion item accepts inline vector data and rejects external assets, expressions and oversized scenes', () => {
  assert(lottieAnimation.safeParse(scene).success)
  const expression = structuredClone(scene)
  expression.layers[0].ks.p.x = 'time'
  for (const animation of [
    expression,
    { ...scene, assets: [{ p: 'external.png' }] },
    { ...scene, segments: [{ time: 0 }] },
    { ...scene, fonts: { list: [] } },
    { ...scene, op: 10000 },
    { ...scene, w: 10000 },
    { ...scene, layers: [{ ...scene.layers[0], ty: 2 }] },
  ])
    assert.equal(lottieAnimation.safeParse(animation).success, false)
})

test('motion review renders offline and returns frame and range discussion through MCP', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-motion-'))
  const server = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'motion', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const opened = await client.callTool(example)
    assert(!opened.isError, JSON.stringify(opened.content))
    const review = opened.structuredContent as {
      url: string
      review_id: string
    }
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    const external: string[] = []
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === server.origin)
        return route.continue()
      external.push(route.request().url())
      return route.abort()
    })
    await page.goto(review.url)
    const slider = page.getByRole('slider', { name: 'Animation frame' })
    const play = page.getByRole('button', { name: 'Play', exact: true })
    await page.waitForFunction(
      () =>
        document.querySelector('.motion-stage path') &&
        !document.querySelector<HTMLInputElement>(
          '.motion-review input[type=range]',
        )?.disabled,
    )
    assert.equal(await slider.inputValue(), '0')
    const markerX = () =>
      page.locator('.motion-stage path').evaluateAll((paths) => {
        const boxes = paths
          .map((p) => p.getBoundingClientRect())
          .filter((box) => box.width > 0)
        return boxes.sort((a, b) => a.width - b.width)[0]?.x
      })
    const firstX = await markerX()
    await page.getByRole('button', { name: 'Next frame' }).click()
    await page
      .getByRole('button', { name: 'Comment on frame 1', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Comment on frame:1' })
      .fill('Hold this opening pose.')
    await page.getByRole('button', { name: 'Add comment' }).click()
    await page.getByText('Hold this opening pose.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Mark range start' }).click()
    await slider.focus()
    for (let i = 1; i < 24; i++) await slider.press('ArrowRight')
    const midX = await markerX()
    await slider.press('End')
    const finalX = await markerX()
    assert(
      firstX < midX && midX < finalX,
      'The marker should travel between three rendered positions',
    )
    await page.getByRole('button', { name: 'Comment on frames 1–47' }).click()
    await page
      .getByRole('textbox', { name: 'Comment on frames:1-47' })
      .fill('Shorten this travel.')
    await page.getByRole('button', { name: 'Add comment' }).click()
    await page.getByText('Shorten this travel.', { exact: true }).waitFor()
    await slider.press('End')
    await page.getByRole('button', { name: 'Frames 1–47', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>(
          '.motion-review input[type=range]',
        )?.value === '1',
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await play.click()
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector<HTMLInputElement>(
            '.motion-review input[type=range]',
          )?.value,
        ) > 2,
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await play.waitFor()
    await page.getByRole('checkbox', { name: 'Reviewed' }).check()
    await page.getByRole('button', { name: 'Submit review' }).click()
    await page.getByText('Review submitted').waitFor()
    const result = (
      await client.callTool({
        name: 'review_get',
        arguments: { review_id: review.review_id },
      })
    ).structuredContent as any
    assert.deepEqual(result.result.answers[0].value, { review: 'reviewed' })
    assert.deepEqual(
      result.result.comments.map((c) => c.anchor.path),
      ['frame:1', 'frames:1-47'],
    )
    assert.deepEqual(external, [])
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true })
  }
})

test('leaving a playing animation pauses at the current frame until playback is requested again', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-playback-'))
  const server = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'motion-navigation', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const opened = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Motion and copy review',
        items: [
          {
            ...example.arguments.items[0],
            animation: {
              ...scene,
              op: 720,
              layers: scene.layers.map((layer) => ({ ...layer, op: 720 })),
            },
          },
          {
            kind: 'proposal',
            title: 'Delivery copy',
            sections: [
              {
                id: 'status',
                label: 'Status',
                body: 'A queued note is ready to send.',
              },
            ],
          },
        ],
      },
    })
    assert(!opened.isError, JSON.stringify(opened.content))
    const page = await browser.newPage()
    const url = new URL(String(opened.structuredContent.url))
    url.searchParams.set('view', 'focus')
    await page.goto(url.href)
    const player = page.locator('.motion-review')
    const play = player.getByRole('button', { name: 'Play', exact: true })
    const next = page.getByRole('button', { name: 'Next review item' })
    const previous = page.getByRole('button', { name: 'Previous review item' })
    const slider = player.locator('input[type="range"]')
    async function begin() {
      const from = await slider.inputValue()
      await play.click()
      await page.waitForFunction(
        (value) =>
          document.querySelector<HTMLInputElement>(
            '.motion-review input[type=range]',
          ).value !== value,
        from,
      )
    }
    async function pausedFrame() {
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.motion-controls button')).some(
            (button) => button.textContent === 'Play',
          ),
        undefined,
        { timeout: 5000 },
      )
      return slider.inputValue()
    }
    await begin()
    await next.click()
    await page.getByRole('heading', { name: 'Delivery copy' }).waitFor()
    const itemFrame = await pausedFrame()
    await previous.click()
    await play.waitFor()
    assert.equal(await slider.inputValue(), itemFrame)

    await begin()
    await page.getByRole('button', { name: /^Threads/ }).click()
    await page.getByRole('heading', { name: 'Review discussion' }).waitFor()
    const threadFrame = await pausedFrame()
    await page.getByRole('button', { name: 'Items', exact: true }).click()
    await play.waitFor()
    assert.equal(await slider.inputValue(), threadFrame)

    await begin()
    // Chromium headless keeps tabs visible. Dispatch the browser visibility transition.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const tabFrame = await pausedFrame()
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await play.waitFor()
    assert.equal(await slider.inputValue(), tabFrame)
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true })
  }
})
