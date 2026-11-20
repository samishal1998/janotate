import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { itemSchema } from '../packages/core/src/schema.ts'
import { start } from '../packages/server/src/http.ts'

const guide = readFileSync(
  'packages/docs/src/content/docs/guides/infrastructure.md',
  'utf8',
)
const example = JSON.parse(guide.match(/```json\n([\s\S]*?)\n```/)[1])

test('diagram walkthroughs accept only bounded steps targeting their own variant', () => {
  const diagram = example.arguments.items[0]
  assert.equal(itemSchema.safeParse(diagram).success, true)
  const wrong = {
    label: 'Incorrect variant',
    description: 'Select the CI trigger',
    targets: ['node:pr'],
  }
  const valid = diagram.walkthrough[0]
  for (const invalid of [
    { ...diagram, walkthrough: [wrong] },
    { ...diagram, walkthrough: [{ ...valid, targets: ['edge:pod->svc'] }] },
    {
      ...diagram,
      walkthrough: [{ ...valid, targets: ['node:entry', 'node:entry'] }],
    },
    { ...diagram, walkthrough: Array(33).fill(valid) },
    {
      ...diagram,
      variants: [{ ...diagram.variants[0], walkthrough: [valid] }],
    },
  ])
    assert.equal(itemSchema.safeParse(invalid).success, false)
  assert.equal(
    itemSchema.safeParse({
      ...diagram,
      walkthrough: undefined,
      variants: undefined,
    }).success,
    true,
  )
})

test('infrastructure walkthrough plays offline, keeps comment anchors and respects reduced motion', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-playback-'))
  const server = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'walkthrough-test', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const response = await client.callTool(example)
    assert.equal(response.isError ?? false, false)
    const { url, review_id } = response.structuredContent as any
    const page = await browser.newPage({ reducedMotion: 'no-preference' })
    const external: string[] = []
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === server.origin)
        return route.continue()
      external.push(route.request().url())
      return route.abort()
    })
    await page.goto(url)
    const diagram = page.locator('.kind-diagram'),
      walk = diagram.getByRole('region', { name: 'Diagram walkthrough' })
    const previous = walk.getByRole('button', {
        name: 'Previous walkthrough step',
      }),
      next = walk.getByRole('button', { name: 'Next walkthrough step' })
    await walk.getByText('Route the request', { exact: true }).waitFor()
    assert.equal(await previous.isDisabled(), true)
    await diagram
      .locator('.walkthrough-edge[data-id="edge:entry->svc"]')
      .waitFor({ state: 'attached' })
    const highlights = diagram.locator(
      '.graph-card[data-walkthrough-active] strong',
    )
    assert.deepEqual((await highlights.allTextContents()).sort(), [
      'Notes API',
      'Pilot ingress',
    ])

    await diagram
      .getByRole('button', { name: 'Pilot ingress', exact: true })
      .click()
    const comment = diagram.getByRole('textbox', {
      name: 'Comment on node:entry',
    })
    await comment.fill('Preserve this ingress rule.')
    await next.click()
    await walk.getByText('Choose a ready replica').waitFor()
    assert.equal(await comment.inputValue(), 'Preserve this ingress rule.')
    assert.deepEqual((await highlights.allTextContents()).sort(), [
      'API replicas',
      'Notes API',
    ])
    await diagram.getByRole('button', { name: 'Add comment' }).click()
    await diagram
      .getByText('Preserve this ingress rule.', { exact: true })
      .waitFor()
    await previous.click()
    await walk.getByRole('button', { name: 'Play walkthrough' }).click()
    const path = diagram
      .locator('.walkthrough-edge .react-flow__edge-path')
      .first()
    assert.equal(
      await path.evaluate((el) => getComputedStyle(el).animationName),
      'diagram-flow',
    )
    await walk.getByText('Choose a ready replica').waitFor({ timeout: 9000 })
    await walk.getByRole('button', { name: 'Pause walkthrough' }).click()
    assert.equal(
      await path.evaluate((el) => getComputedStyle(el).animationName),
      'none',
    )
    await next.click()
    assert.equal(await next.isDisabled(), true)
    await walk.getByRole('button', { name: 'Replay walkthrough' }).click()
    await walk.getByText('Route the request', { exact: true }).waitFor()
    await diagram
      .getByRole('button', { name: 'GitHub Actions', exact: true })
      .click()
    await walk.getByText('Open the pull request').waitFor()
    assert.equal(await previous.isDisabled(), true)
    await walk.getByRole('button', { name: 'Play walkthrough' }).waitFor()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await next.click()
    await walk.getByRole('button', { name: 'Play walkthrough' }).click()
    assert.equal(
      await path.evaluate((el) => getComputedStyle(el).animationName),
      'none',
    )
    await walk.getByText('Deploy the preview').waitFor({ timeout: 9000 })
    await walk.getByRole('button', { name: 'Replay walkthrough' }).waitFor()
    await page.getByRole('button', { name: 'Submit review' }).click()
    await page.getByText('Review submitted').waitFor()
    const result = await client.callTool({
      name: 'review_get',
      arguments: { review_id },
    })
    assert.equal(
      (result.structuredContent as any).result.comments[0].anchor.path,
      'node:entry',
    )
    assert.deepEqual(external, [])
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true })
  }
})
