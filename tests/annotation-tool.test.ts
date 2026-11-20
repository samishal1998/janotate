import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'

test('annotation cursor targets options and selected passages, supports touch and exits with Escape', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-cursor-'))
  const server = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'annotation', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const opened = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Delivery',
        items: [
          {
            kind: 'decision',
            title: 'Storage',
            options: [
              {
                id: 'local',
                label: 'Keep locally',
                tradeoffs: 'Works offline',
              },
            ],
          },
          {
            kind: 'proposal',
            title: 'Sync proposal',
            sections: [
              {
                id: 'sync',
                label: 'Offline sync',
                body: 'Store notes locally until sync finishes.',
              },
            ],
          },
        ],
      },
    })
    assert(!opened.isError, JSON.stringify(opened.content))
    const review = opened.structuredContent as {
      url: string
      review_id: string
    }
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })
    await page.goto(review.url)
    const tool = page.getByRole('button', { name: 'Annotate', exact: true })
    await tool.click()
    assert.equal(await tool.getAttribute('aria-pressed'), 'true')
    const choice = page.locator('.option label')
    const cursor = await choice.evaluate((el) => getComputedStyle(el).cursor)
    assert.match(cursor, /annotate\.svg/)
    const asset = await page.request.get(
      new URL('/cursors/annotate.svg', review.url).href,
    )
    assert.equal(asset.status(), 200)
    assert.match(asset.headers()['content-type'], /image\/svg\+xml/)
    await choice.click()
    const choiceComment = page.getByRole('textbox', {
      name: 'Comment on option:local',
    })
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        'Comment on option:local',
    )
    assert.equal(await page.getByRole('radio').isChecked(), false)
    await choiceComment.fill('Confirm the storage footprint.')
    const proposal = page.locator('.kind-proposal')
    const passage = proposal.locator('.prose-body')
    await passage.scrollIntoViewIfNeeded()
    const box = await passage.evaluate((el) => {
      const range = document.createRange()
      const text = el.firstChild
      range.setStart(text, 6)
      range.setEnd(text, 19)
      const b = range.getBoundingClientRect()
      return { x: b.x, y: b.y + b.height / 2, right: b.right }
    })
    await page.mouse.move(box.x + 0.1, box.y)
    await page.mouse.down()
    await page.mouse.move(box.right - 0.1, box.y, { steps: 12 })
    await page.mouse.up()
    const quoted = proposal.getByRole('textbox', {
      name: 'Comment on notes locally',
    })
    await quoted.fill('Keep this wording.')
    await proposal.getByRole('button', { name: 'Add comment' }).click()
    await proposal.getByText('Keep this wording.', { exact: true }).waitFor()
    await choiceComment.focus()
    await page.keyboard.press('Escape')
    assert.equal(await tool.getAttribute('aria-pressed'), 'false')
    assert.equal(
      await choiceComment.inputValue(),
      'Confirm the storage footprint.',
    )
    await page.getByRole('radio').check()
    assert.equal(await page.getByRole('radio').isChecked(), true)
    const touch = await browser.newPage({
      viewport: { width: 320, height: 700 },
      isMobile: true,
      hasTouch: true,
    })
    await touch.goto(review.url)
    await touch.getByRole('button', { name: 'Annotate', exact: true }).tap()
    const mobileChoice = touch.locator('.option label')
    assert.doesNotMatch(
      await mobileChoice.evaluate((el) => getComputedStyle(el).cursor),
      /annotate\.svg/,
    )
    await mobileChoice.tap()
    await touch
      .getByRole('textbox', { name: 'Comment on option:local' })
      .waitFor()
    assert(
      await touch.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true })
  }
})
