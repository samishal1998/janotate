import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'

test('review dropdowns fit a narrow header, support the keyboard and align with table actions', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-dropdowns-'))
  const server = await start(data, 0, true, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'dropdown-layout', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const result = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Table review',
        items: [
          {
            kind: 'dbml',
            title: 'Notes',
            source_text: 'Table notes {\n  id int [pk]\n}',
          },
        ],
      },
    })
    assert(!result.isError, JSON.stringify(result.content))
    const page = await browser.newPage({
      viewport: { width: 320, height: 740 },
      colorScheme: 'light',
    })
    page.setDefaultTimeout(6500)
    await page.goto(result.structuredContent.url)
    const inspector = page.getByRole('combobox', { name: 'Inspect table' })
    await inspector.waitFor()
    const header = page.locator('header.topbar')
    const appearance = header.getByRole('combobox', { name: 'Appearance' })
    await appearance.waitFor()
    assert.equal(await appearance.inputValue(), 'system')
    assert.equal(
      await appearance.locator('option:checked').textContent(),
      'System',
    )
    assert(await header.evaluate((el) => el.scrollWidth <= el.clientWidth))
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    const fits = await appearance.evaluate((el: HTMLSelectElement) => {
      const style = getComputedStyle(el)
      const context = document.createElement('canvas').getContext('2d')
      context.font = [style.fontWeight, style.fontSize, style.fontFamily].join(
        ' ',
      )
      const textWidth = context.measureText(el.selectedOptions[0].text).width
      const room =
        el.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      const rect = el.getBoundingClientRect()
      return { textWidth, room, left: rect.left, right: rect.right }
    })
    assert(
      fits.room + 1 >= fits.textWidth,
      'The selected appearance label is clipped',
    )
    assert(
      fits.left >= 0 && fits.right <= 320,
      'The appearance field is outside the header viewport',
    )
    await appearance.press('Space')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
    )
    assert.equal(await appearance.inputValue(), 'dark')

    await page.setViewportSize({ width: 1280, height: 800 })
    const discuss = page.getByRole('button', { name: 'Discuss table' })
    const field = await inspector.boundingBox()
    const action = await discuss.boundingBox()
    assert(field && action)
    const centerDelta = Math.abs(
      field.y + field.height / 2 - (action.y + action.height / 2),
    )
    assert(
      centerDelta <= 1,
      `The table selector and Discuss table differ by ${centerDelta}px vertically`,
    )
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true })
  }
})

test('guided stage annotations, threaded replies, diagram variants and exact edited code', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-stages-')),
    s = await start(data, 0, true, resolve('dist'))
  const browser = await chromium.launch(),
    client = new Client({ name: 'journey', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', s.origin)),
    )
    const items = ['plan', 'diagram', 'code', 'diff'].map(
      (kind) =>
        JSON.parse(
          readFileSync(
            'packages/docs/src/content/docs/interfaces/' + kind + '.md',
            'utf8',
          ).match(/```json\n([\s\S]*?)\n```/)[1],
        ).arguments.items[0],
    )
    const result = await client.callTool({
      name: 'review_open',
      arguments: { title: 'Pilot review', items },
    })
    assert(!result.isError)
    const { url, review_id } = result.structuredContent
    const page = await browser.newPage()
    await page.goto(url)
    const plan = page.locator('.kind-plan'),
      diagram = page.locator('.kind-diagram')
    await page.getByRole('button', { name: 'Start guide' }).click()
    await page.getByRole('button', { name: 'Next stop' }).click()
    await plan
      .getByRole('textbox', { name: 'Comment on node:write' })
      .fill('Check restart before upload.')
    await plan.getByRole('button', { name: 'Add comment' }).click()
    await plan.getByRole('button', { name: 'Reply', exact: true }).click()
    await plan.getByRole('textbox').fill('Test the queue as well.')
    await plan.getByRole('button', { name: 'Send reply' }).click()
    await plan.getByText('Test the queue as well.', { exact: true }).waitFor()
    await plan.getByRole('button', { name: /Reconnect safely/ }).click()
    assert.equal(
      await plan.getByText('Test the queue as well.', { exact: true }).count(),
      0,
    )
    await page
      .getByRole('combobox', { name: 'Guide route' })
      .selectOption('discussion')
    await plan.getByText('Test the queue as well.', { exact: true }).waitFor()
    await diagram.getByRole('button', { name: 'Lost receipt' }).click()
    await diagram
      .getByRole('button', { name: 'Look up receipt', exact: true })
      .click()
    await diagram
      .getByRole('textbox')
      .fill('Keep the receipt after acknowledgement.')
    await diagram.getByRole('button', { name: 'Add comment' }).click()
    await diagram
      .getByText('Keep the receipt after acknowledgement.', { exact: true })
      .waitFor()
    const code = '  const attempts = 4;\n'
    const editor = page.locator('.cm-content[contenteditable=true]')
    await editor.fill(code)
    await page
      .locator('.kind-code')
      .getByRole('button', { name: 'Save answer' })
      .click()
    const diff = page.locator('.kind-diff')
    await diff.getByText('split', { exact: true }).click()
    await diff.locator('summary').click()
    await diff.locator('.diff-split .token.keyword').first().waitFor()
    await page.getByRole('button', { name: 'Submit review' }).click()
    await page.getByText('Review submitted').waitFor()
    const { structuredContent: r } = await client.callTool({
      name: 'review_get',
      arguments: { review_id },
    })
    assert.equal(
      r.result.answers.find(
        (a) => a.item_id === result.structuredContent.item_ids[2],
      ).value,
      code,
    )
    const [first, reply, variant] = r.result.comments
    assert.equal(first.anchor.path, 'node:write')
    assert.equal(reply.parent_id, first.id)
    assert.deepEqual(reply.anchor, first.anchor)
    assert.equal(variant.anchor.path, 'variant:retry/node:Lookup')
    await diagram.getByRole('button', { name: 'Concurrent edit' }).click()
    await diagram
      .getByRole('button', { name: 'Keep both edits', exact: true })
      .waitFor()
  } finally {
    await client.close()
    await browser.close()
    s.close()
    rmSync(data, { recursive: true })
  }
})
