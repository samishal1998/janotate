import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'

test('the journey can dock, float, move and collapse without losing its stop', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-guide-'))
  const server = await start(data, 0, true, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'journey-dock', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const review = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Delivery review',
        items: [
          {
            kind: 'plan',
            title: 'Release plan',
            nodes: [
              { id: 'test', label: 'Test the queue' },
              { id: 'ship', label: 'Send the receipt' },
            ],
          },
        ],
      },
    })
    assert(!review.isError, JSON.stringify(review.content))
    const url = (review.structuredContent as { url: string }).url
    const desktop = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    })
    desktop.setDefaultTimeout(6500)
    await desktop.goto(url)
    const guide = desktop.getByRole('navigation', { name: 'Guided review' })
    const float = guide.getByRole('button', { name: 'Float guide' })
    const dock = guide.getByRole('button', { name: 'Dock guide' })
    const grip = guide.getByRole('button', { name: 'Move guide' })
    await desktop.setViewportSize({ width: 768, height: 800 })
    await float.waitFor()
    assert(await guide.evaluate((el) => el.scrollWidth <= el.clientWidth))
    const disclosure = guide.getByRole('button', { name: 'Collapse guide' })
    assert.equal(
      (await grip.boundingBox()).y,
      (await disclosure.boundingBox()).y,
    )
    await desktop.setViewportSize({ width: 1280, height: 800 })
    await guide.getByRole('button', { name: 'Start guide' }).click()
    await guide.getByRole('button', { name: 'Next stop' }).click()
    await float.press('Enter')
    assert.equal(
      await guide.evaluate((el) => getComputedStyle(el).position),
      'fixed',
    )
    assert(await dock.evaluate((el) => el === document.activeElement))
    await guide.getByRole('button', { name: 'Collapse guide' }).click()
    await dock.press('Space')
    assert(await float.evaluate((el) => el === document.activeElement))
    assert.equal(await guide.getByRole('combobox').count(), 0)
    await guide.getByRole('button', { name: 'Expand guide' }).press('Enter')
    await guide.getByText('Send the receipt').waitFor()
    const docked = await guide.boundingBox()
    await grip.press('ArrowRight')
    assert((await guide.boundingBox()).x > docked.x)
    await grip.press('Home')
    await float.waitFor()
    assert.equal((await guide.boundingBox()).x, docked.x)

    await float.click()
    await dock.press('Escape')
    assert(await float.evaluate((el) => el === document.activeElement))
    await float.click()
    const handle = await grip.boundingBox()
    await desktop.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    )
    await desktop.mouse.down()
    await desktop.mouse.move(600, 250, { steps: 5 })
    const target = desktop.getByText('Drop to dock', { exact: true })
    await target.waitFor()
    const box = await target.boundingBox()
    await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 5,
    })
    await desktop.mouse.up()
    await float.waitFor()
    await target.waitFor({ state: 'detached' })
    await guide.getByText('Send the receipt').waitFor()

    const mobile = await browser.newPage({
      viewport: { width: 320, height: 680 },
      isMobile: true,
      hasTouch: true,
    })
    mobile.setDefaultTimeout(6500)
    await mobile.goto(url)
    const compact = mobile.getByRole('navigation', { name: 'Guided review' })
    await compact.getByRole('button', { name: 'Expand guide' }).waitFor()
    await compact.getByRole('button', { name: 'Float guide' }).tap()
    await compact.getByRole('button', { name: 'Dock guide' }).tap()
    assert.equal(
      await compact.evaluate((el) => getComputedStyle(el).position),
      'relative',
    )
    await compact.getByRole('button', { name: 'Float guide' }).tap()
    await compact.getByRole('button', { name: 'Expand guide' }).tap()
    const handleOnPhone = await compact
      .getByRole('button', { name: 'Move guide' })
      .boundingBox()
    const touch = await mobile.context().newCDPSession(mobile)
    const x = handleOnPhone.x + handleOnPhone.width / 2
    const y = handleOnPhone.y + handleOnPhone.height / 2
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: 250 }],
    })
    const mobileTarget = mobile.getByText('Drop to dock', { exact: true })
    await mobileTarget.waitFor()
    assert((await compact.boundingBox()).y < 250)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await compact.getByRole('button', { name: 'Dock guide' }).tap()
    await compact.getByRole('button', { name: 'Float guide' }).waitFor()
    assert.equal(
      await compact.evaluate((el) => getComputedStyle(el).position),
      'relative',
    )
    assert(
      await mobile.evaluate(
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
