import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { start } from '../packages/server/src/http.ts'

test('workspace home links to real reviews and ending a review preserves the saved record', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-home-'))
  const server = await start(data, 0, true, resolve('dist'))
  const client = new Client({ name: 'home-test', version: '1' })
  const browser = await chromium.launch()
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const page = await browser.newPage({
      viewport: { width: 320, height: 740 },
    })
    page.setDefaultTimeout(6000)
    await page.goto(server.origin)
    await page.getByRole('heading', { name: 'No open reviews yet' }).waitFor()
    await page.goto(
      server.origin + '/review/00000000-0000-4000-8000-000000000000',
    )
    await page.getByRole('heading', { name: 'Review unavailable' }).waitFor()
    await page.getByRole('link', { name: 'View open reviews' }).click()
    await page
      .locator('summary')
      .filter({ hasText: 'Connect your agent' })
      .press('Enter')
    const endpoint = page.getByRole('textbox', { name: 'MCP endpoint' })
    assert.equal(await endpoint.inputValue(), server.origin + '/mcp')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      server.origin + '/mcp',
    )
    await page.getByRole('link', { name: 'Agent setup guide' }).click()
    await page
      .getByRole('heading', { name: 'Connect your coding agent' })
      .waitFor()
    await page.goBack()
    await page.getByRole('link', { name: 'Get started' }).click()
    await page.getByRole('heading', { name: 'Quick start' }).waitFor()
    const result = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Choose a storage engine',
        items: [
          {
            title: 'Where should we keep the data?',
            kind: 'decision',
            options: [
              { id: 'local', label: 'SQLite', tradeoffs: 'Local storage' },
              { id: 'remote', label: 'Postgres', tradeoffs: 'Hosted storage' },
            ],
          },
        ],
      },
    })
    assert(!result.isError)
    const id = result.structuredContent.review_id
    await page.goto(server.origin)
    const resume = page.getByRole('link', { name: 'Resume latest review' })
    await resume.waitFor()
    assert.equal(
      await resume.getAttribute('href'),
      '/review/' + id + '?view=focus',
    )
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'home width ' + width,
      )
    }
    await page.getByRole('link', { name: 'Decision log' }).click()
    await page
      .getByRole('heading', { name: 'Decision log', level: 1 })
      .waitFor()
    await page.reload()
    await page.getByRole('searchbox', { name: 'Search decisions' }).waitFor()
    await page.getByRole('link', { name: 'Janotate home' }).click()
    await resume.click()
    await page.getByRole('radio', { name: /SQLite/ }).check()
    await page.getByRole('button', { name: 'Save answer' }).click()
    await page.getByText('1 of 1 reviewed').waitFor()
    await page
      .getByPlaceholder('Write another answer')
      .fill('An unsaved alternative')
    const menu = page.getByRole('button', { name: 'More review actions' })
    const dialog = page.getByRole('dialog', {
      name: 'End this review without submitting?',
    })
    async function ask() {
      await menu.focus()
      await menu.press('ArrowDown')
      await page
        .getByRole('menuitem', { name: 'End without submitting…' })
        .press('Enter')
      await dialog.waitFor()
      assert(
        await dialog
          .getByRole('button', { name: 'Keep reviewing' })
          .evaluate((e) => e === document.activeElement),
      )
    }
    await ask()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert(await menu.evaluate((e) => e === document.activeElement))
    await ask()
    await dialog
      .getByRole('button', { name: 'End review', exact: true })
      .click()
    await page.getByText('Ended without submission').waitFor()
    assert(await page.getByRole('radio', { name: /SQLite/ }).isChecked())
    const ended = await client.callTool({
      name: 'review_get',
      arguments: { review_id: id },
    })
    assert.deepEqual(ended.structuredContent, {
      state: 'cancelled',
      result: null,
    })
    await page.goto(server.origin)
    await page.getByRole('heading', { name: 'No open reviews yet' }).waitFor()
  } finally {
    await browser.close()
    await client.close()
    server.close()
    rmSync(data, { recursive: true, force: true })
  }
})
