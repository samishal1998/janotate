import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'

function example(path) {
  return JSON.parse(
    readFileSync(
      'packages/docs/src/content/docs/' + path + '.md',
      'utf8',
    ).match(/```json\n([\s\S]*?)\n```/)[1],
  )
}
test('live annotated proposal, guided window, saved appearance, ranking, ranges and infrastructure', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-live-test-')),
    s = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch(),
    client = new Client({ name: 'discussion-agent', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', s.origin)),
    )
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args })
      assert(!r.isError, JSON.stringify(r.content))
      return r.structuredContent as any
    }
    const items = [
      'interfaces/proposal',
      'interfaces/ranking',
      'interfaces/range',
      'guides/infrastructure',
      'interfaces/scope_board',
    ].map((path) => example(path).arguments.items[0])
    const r = await call('review_open', { title: 'Pilot readiness', items })
    const page = await browser.newPage({ colorScheme: 'dark' })
    page.setDefaultTimeout(6500)
    await page.goto(r.url)
    await page.getByLabel('Appearance').selectOption('light')
    await page.reload()
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'light',
    )
    const guide = page.getByRole('navigation', { name: 'Guided review' })
    const initial = await guide.boundingBox()
    await guide.getByLabel('Move guide').press('ArrowRight')
    assert((await guide.boundingBox()).x > initial.x)
    await guide.getByLabel('Collapse guide').click()
    assert.equal(await guide.getByLabel('Guide route').count(), 0)
    await guide.getByLabel('Expand guide').click()
    await guide.getByText('Start guide').click()
    await guide.getByText('Next stop').click()
    assert.match(await guide.innerText(), /Who can pause the pilot/)
    await guide.getByLabel('Collapse guide').click()
    const proposal = page.locator('.kind-proposal')
    await proposal.getByRole('checkbox').check()
    await proposal.getByRole('button', { name: 'Save answer' }).click()
    const read = async () =>
      (await call('review_get', { review_id: r.review_id })).review
    await page.waitForFunction(
      () =>
        document.querySelector('.kind-proposal .item-state')?.textContent ===
        'confirmed',
    )
    const waiting = call('review_wait', {
      review_id: r.review_id,
      after_comment: 0,
      wait_seconds: 15,
    })
    const passage = proposal.locator('[data-section="release"]')
    await passage.evaluate((el) => {
      const text = el.firstChild,
        at = text.textContent.indexOf('local receipt'),
        range = document.createRange()
      range.setStart(text, at)
      range.setEnd(text, at + 13)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await proposal.getByText('Comment on passage').click()
    await proposal
      .getByRole('textbox')
      .fill('Does the receipt survive a retry?')
    await proposal.getByRole('button', { name: 'Add comment' }).click()
    const event = await waiting
    assert.equal(event.state, 'discussion')
    const [comment] = event.comments
    assert.equal(comment.anchor.exact, 'local receipt')
    assert.equal(comment.anchor.section_id, 'release')
    let drop = true
    await page.route('**/api/review/*?since=*', async (route) => {
      if (drop) {
        drop = false
        await route.abort('connectionreset')
      } else await route.continue()
    })
    await page.reload()
    await page.getByText('Reconnecting…', { exact: true }).waitFor()
    await proposal.getByRole('textbox').fill('Unsent follow-up')
    const reply = example('reference/discussion_reply')
    await call(reply.name, {
      ...reply.arguments,
      review_id: r.review_id,
      item_id: r.item_ids[0],
      parent_id: comment.id,
    })
    await proposal.getByText(reply.arguments.reply).waitFor()
    assert.equal(
      await proposal.getByRole('textbox').inputValue(),
      'Unsent follow-up',
    )
    await page.getByText('Connected', { exact: true }).waitFor()
    await page.getByRole('button', { name: /^Threads/ }).click()
    const thread = page
      .locator('.thread-inbox')
      .getByRole('button', { name: /Does the receipt survive a retry/ })
    assert.match(await thread.innerText(), /1 reply/)
    assert.match(await thread.innerText(), /Coding agent/)
    assert((await thread.innerText()).includes(reply.arguments.reply))
    await thread.click()
    await page.waitForFunction(() =>
      document.activeElement?.id.startsWith('thread-'),
    )
    assert.equal(
      await proposal
        .getByRole('textbox', { name: 'Comment on local receipt' })
        .inputValue(),
      '',
    )
    const reviewed = (await read()).items[0]
    assert.equal(reviewed.status, 'confirmed')
    assert.equal(reviewed.revision, 1)
    assert.equal(
      (
        await call('review_wait', {
          review_id: r.review_id,
          after_comment: event.cursor,
          wait_seconds: 1,
        })
      ).state,
      'pending',
    )
    await page.reload()
    assert.equal(
      await passage.locator('mark').first().innerText(),
      'local receipt',
    )
    await passage.locator('mark').first().click()
    await page.waitForFunction(() =>
      document.activeElement?.id.startsWith('thread-'),
    )
    const ranking = page.locator('.kind-ranking'),
      rows = ranking.locator('ol>li')
    await rows.nth(2).dragTo(rows.nth(0))
    assert.match(await rows.first().innerText(), /Rehearse shift handoff/)
    await ranking
      .getByRole('button', { name: 'Move Rehearse shift handoff down' })
      .click()
    await ranking.getByRole('button', { name: 'Save answer' }).click()
    const ranges = page.locator('.kind-range')
    await ranges
      .getByRole('slider', { name: 'Offline retention' })
      .press('ArrowRight')
    await ranges.getByRole('button', { name: 'Save answer' }).click()
    const diagram = page.locator('.kind-diagram')
    await diagram
      .getByRole('button', { name: 'Notes API', exact: true })
      .click()
    await diagram
      .getByText('Provides one stable endpoint', { exact: false })
      .waitFor()
    await diagram.getByRole('button', { name: 'GitHub Actions' }).click()
    await diagram
      .getByRole('button', { name: 'Preview deploy', exact: true })
      .click()
    await diagram.getByText('Holds the preview', { exact: false }).waitFor()
    const board = page.locator('.kind-scope_board')
    await board
      .locator('article')
      .filter({ hasText: 'Overnight alerts' })
      .dragTo(board.getByRole('region', { name: 'in scope', exact: true }))
    assert.equal(
      await board
        .getByRole('combobox', { name: 'Overnight alerts' })
        .inputValue(),
      'in scope',
    )
    await board.getByRole('button', { name: 'Save answer' }).click()
    await board
      .locator('.item-state')
      .filter({ hasText: 'confirmed' })
      .waitFor()
    const saved = await read()
    assert.equal(saved.items[4].value.alerts, 'in scope')
    assert.deepEqual(saved.items[1].value, {
      receipts: '1',
      handoff: '2',
      conflicts: '3',
    })
    assert.equal(saved.items[2].value.hold, '8')
    const bad = async (index, values) =>
      fetch(
        s.origin +
          '/api/review/' +
          r.review_id +
          '/items/' +
          r.item_ids[index] +
          '/answer',
        {
          method: 'POST',
          headers: { origin: s.origin, 'content-type': 'application/json' },
          body: JSON.stringify({ values }),
        },
      )
    assert.equal(
      (await bad(1, { receipts: '1', conflicts: '1', handoff: '2' })).status,
      400,
    )
    assert.equal((await bad(2, { crew: '3', hold: '99' })).status, 400)
    await page.setViewportSize({ width: 320, height: 650 })
    await page.reload()
    await page.getByLabel('Expand guide').waitFor()
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
  } finally {
    await client.close()
    await browser.close()
    s.close()
    rmSync(data, { recursive: true })
  }
})
