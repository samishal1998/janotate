import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'
import { itemStops } from '../packages/ui/src/guide-stops.ts'

function example(slug: string) {
  const file = new URL(
    '../packages/docs/src/content/docs/' + slug + '.md',
    import.meta.url,
  )
  const json = readFileSync(file, 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]
  return JSON.parse(json).arguments.items[0]
}

test('the guide retains stable stop identities and ignores drafts from replaced revisions', () => {
  const item = {
    id: 'decision',
    title: 'Storage',
    kind: 'decision',
    revision: 3,
    status: 'confirmed',
    value: 'a',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  }
  const saved = itemStops(item, { revision: 2, value: { option: 'b' } })
  assert.deepEqual(
    saved.map((s) => s.status),
    ['Selected', 'Available'],
  )
  const draft = itemStops(item, { revision: 3, value: { option: 'b' } })
  assert.deepEqual(
    saved.map((s) => s.id),
    draft.map((s) => s.id),
  )
  assert.equal(draft[1].status, 'Selected · draft')
  assert.equal(
    itemStops(
      { ...item, value: undefined, status: 'defaulted', default: 'b' },
      null,
    )[1].status,
    'Default',
  )
  const claim = {
    id: 'claim',
    revision: 1,
    kind: 'claim',
    claims: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    value: { a: 'verified', b: 'wrong' },
  }
  assert.deepEqual(
    itemStops(claim, {
      revision: 1,
      value: { values: { a: 'verified', b: 'research' } },
    }).map((s) => s.status),
    ['verified', 'research · draft'],
  )
  const timeline = example('interfaces/lottie')
  timeline.animation.markers = [
    { tm: 0, cm: 'Arrival', dr: 24 },
    { tm: 24, cm: 'Settle', dr: 24 },
  ]
  assert.deepEqual(
    itemStops(timeline, null).map((s) => s.anchor.path),
    ['frames:0-23', 'frames:24-47'],
  )
  const report = {
    kind: 'pr_review',
    id: 'report',
    report: {
      groups: [{ id: 'format', title: 'Format replies' }],
      findings: [{ id: 'retry', title: 'Retry ordering', type: 'risk' }],
    },
    value: { verdict: 'request_changes' },
  }
  assert.deepEqual(
    itemStops(report, null).map((s) => [s.anchor.path, s.status]),
    [
      ['pr:group:format', 'request changes'],
      ['pr:finding:retry', 'risk'],
    ],
  )
})

test('the guide navigates exact choices, media, schema and code and reflects live reviewer state', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'janotate-advanced-guide-'))
  const server = await start(directory, 0, true, resolve('dist'))
  const client = new Client({ name: 'advanced-guide', version: '1' })
  const browser = await chromium.launch()
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const motion = example('interfaces/lottie')
    motion.animation.markers = [
      { tm: 0, cm: 'Departure', dr: 12 },
      { tm: 24, cm: 'Arrival', dr: 24 },
    ]
    const result = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Release review',
        items: [
          {
            kind: 'decision',
            title: 'Storage',
            options: [
              { id: 'file', label: 'File', tradeoffs: 'Persists on disk' },
              { id: 'memory', label: 'Memory', tradeoffs: 'Temporary' },
            ],
          },
          example('guides/infrastructure'),
          motion,
          example('interfaces/range'),
          example('interfaces/dbml'),
          example('interfaces/function_overview'),
          {
            kind: 'pr_review',
            title: 'Review receipt retries',
            report: JSON.parse(
              readFileSync(
                new URL(
                  '../packages/docs/public/examples/receipt-review.json',
                  import.meta.url,
                ),
                'utf8',
              ),
            ),
          },
        ],
      },
    })
    assert(!result.isError, JSON.stringify(result.content))
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    page.setDefaultTimeout(7500)
    await page.goto(
      (result.structuredContent as { url: string }).url + '?view=focus',
    )
    const guide = page.getByRole('navigation', { name: 'Guided review' })
    const state = (value: string) =>
      guide
        .locator('.guide-stop-state > span')
        .getByText(value, { exact: true })
    const jump = async (label: RegExp) => {
      await guide.getByRole('button', { name: 'Browse stops' }).click()
      await guide
        .getByRole('group', { name: 'Guide stops' })
        .getByRole('button', { name: label })
        .click()
    }
    await guide.getByRole('button', { name: 'Start guide' }).click()
    await guide
      .locator('.guide-stop')
      .getByText('File', { exact: true })
      .waitFor()
    const file = page
      .locator('.kind-decision')
      .getByRole('radio', { name: /^File/ })
    assert(!(await file.isChecked()))
    await file.check()
    await state('Selected').waitFor()
    await guide.getByRole('button', { name: 'Next stop' }).click()
    await state('Available').waitFor()
    assert(await file.isChecked())

    await jump(/GitHub Actions · Open the pull request/)
    const diagram = page.locator('.kind-diagram')
    assert.equal(
      await diagram
        .getByRole('button', { name: 'GitHub Actions', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    )
    const walk = diagram.getByRole('region', { name: 'Diagram walkthrough' })
    await guide.getByRole('button', { name: 'Play guide media' }).click()
    await state('Playing').waitFor()
    await walk.getByRole('button', { name: 'Pause walkthrough' }).click()
    await state('Paused').waitFor()
    await guide.getByRole('button', { name: 'Resume guide media' }).click()
    await guide
      .locator('.guide-stop')
      .getByText('GitHub Actions · Run checks in parallel', { exact: true })
      .waitFor()
    await state('Playing').waitFor()
    await guide.getByRole('button', { name: 'Pause guide media' }).click()
    await state('Paused').waitFor()
    await walk.getByRole('button', { name: 'Play walkthrough' }).click()
    await state('Playing').waitFor()
    await guide.getByRole('button', { name: 'Browse stops' }).click()
    await guide
      .getByRole('group', { name: 'Guide stops' })
      .getByRole('button', { name: /Run checks in parallel Playing/ })
      .waitFor()
    await guide.getByRole('button', { name: 'Hide stops' }).click()
    await page.getByRole('button', { name: /^Threads/ }).click()
    await guide.getByRole('button', { name: 'Open stop' }).waitFor()
    assert.equal(
      await guide.getByRole('button', { name: 'Play guide media' }).count(),
      0,
    )
    await guide.getByRole('button', { name: 'Open stop' }).click()
    await state('Ready to play').waitFor()

    await jump(/^Arrival/)
    const animation = page.locator('.kind-lottie')
    await animation.getByText('Frame 24', { exact: true }).waitFor()
    await animation
      .getByRole('slider', { name: 'Animation frame' })
      .press('ArrowLeft')
    await state('Paused · Between markers').waitFor()
    await guide.getByRole('button', { name: 'Play guide media' }).click()
    await state('Finished').waitFor()
    await jump(/^Offline retention/)
    const slider = page
      .locator('.kind-range')
      .getByRole('slider', { name: 'Offline retention' })
    await slider.press('ArrowRight')
    assert.match(
      await guide.locator('.guide-stop-state').innerText(),
      /8.*draft/,
    )
    await jump(/^notes\.client_key/)
    await page
      .locator(
        '.kind-dbml [data-guide-current][data-guide-path="field:notes.client_key"]',
      )
      .waitFor()
    await jump(/^Page title/)
    await page
      .locator('.kind-function_overview details[open][data-guide-current]')
      .waitFor()
    assert(
      await guide
        .getByRole('button', { name: 'Browse stops' })
        .evaluate((el) => el === document.activeElement),
    )
    await page.setViewportSize({ width: 1360, height: 880 })
    const finding = 'A failed receipt write leaves a duplicate on retry'
    await jump(new RegExp(finding))
    await page
      .getByRole('region', { name: 'Review finding' })
      .getByRole('heading', { name: finding })
      .waitFor()
    assert(
      await guide
        .locator('.guide-stop')
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      'entire finding title should wrap inside the guide',
    )
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
