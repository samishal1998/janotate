import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
import { prPassage } from '../packages/core/src/pr-passage.ts'
import { quoteOffset } from '../packages/core/src/quote.ts'
import { start } from '../packages/server/src/http.ts'

const report = JSON.parse(
  readFileSync(
    new URL(
      '../packages/docs/public/examples/receipt-review.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
test('PR passages resolve within the supplied field and ambiguous quotes stay detached', () => {
  assert.equal(
    prPassage(report, 'pr:summary:after')?.text,
    report.summary.behaviorAfter,
  )
  assert.equal(
    prPassage(report, 'pr:group:reuse-receipt:story:1')?.text,
    report.groups[1].story[1].say,
  )
  assert.equal(
    prPassage(report, 'pr:finding:two-writes:direction')?.text,
    report.findings[0].suggestedDirection,
  )
  for (const path of [
    'pr:summary:after:1',
    'pr:summary:scope:09',
    'pr:group:reuse-receipt:story:-1',
    'pr:finding:two-writes:header',
    'pr:file:f002',
  ])
    assert.equal(prPassage(report, path), undefined)
  assert.equal(quoteOffset('ab aba', { exact: 'ab' }), -1)
  assert.equal(quoteOffset('ab aba', { exact: 'ab', suffix: 'a' }), 3)
  assert.equal(quoteOffset('changed', { exact: 'removed', start: 0 }), -1)
  assert.equal(
    quoteOffset(
      'ready with a receipt',
      { exact: 'receipt', prefix: 'before ', suffix: '' },
      true,
    ),
    -1,
  )
})

test('reviewers can annotate PR narrative and files, restore a quote across tabs, and inspect a historical discussion', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-pr-passages-'))
  const server = await start(data, 0, true, resolve('dist'))
  const browser = await chromium.launch()
  const client = new Client({ name: 'passage-test', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', server.origin)),
    )
    const call = async (name: string, args: any) => {
      const result = await client.callTool({ name, arguments: args })
      assert(!result.isError, JSON.stringify(result.content))
      return result.structuredContent as any
    }
    const item = { kind: 'pr_review', title: 'Review receipt retries', report }
    const review = await call('review_open', {
      title: 'Discuss the report',
      items: [item],
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(6500)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(review.url)
    const card = page.locator('.kind-pr_review')
    const location = (path: string) =>
      card.locator('[data-pr-location="' + path + '"]')
    const composer = card.getByRole('textbox')
    async function save(body: string) {
      await page.waitForFunction(
        () => document.activeElement?.tagName === 'TEXTAREA',
      )
      await composer.fill(body)
      await card.getByRole('button', { name: 'Add comment' }).click()
      await card.locator('.bubble').filter({ hasText: body }).waitFor()
    }
    await page.getByRole('button', { name: 'Annotate', exact: true }).click()
    await location('pr:summary:before').click()
    await save('Do previous uploads ever use the same key?')
    await location('pr:group:send-key:story:0')
      .locator('..')
      .getByRole('button', { name: /Comment on/ })
      .press('Enter')
    await save('Keep the draft ID on retries.')
    await card.getByRole('button', { name: /^Findings/ }).click()
    const exact = 'receipt write fails'
    const explanation = location('pr:finding:two-writes:explanation')
    await explanation.scrollIntoViewIfNeeded()
    const drag = await explanation.evaluate((node, text) => {
      const content = node.firstChild
      const start = content.textContent.indexOf(text)
      const range = document.createRange()
      range.setStart(content, start)
      range.setEnd(content, start + text.length)
      const boxes = range.getClientRects(),
        first = boxes[0],
        last = boxes[boxes.length - 1]
      return {
        start,
        from: { x: first.left + 0.5, y: first.top + first.height / 2 },
        to: { x: last.right - 0.5, y: last.top + last.height / 2 },
      }
    }, exact)
    await page.mouse.move(drag.from.x, drag.from.y)
    await page.mouse.down()
    await page.mouse.move(drag.to.x, drag.to.y, { steps: 8 })
    await page.mouse.up()
    await save('Which writes can be retried?')

    await card.getByRole('button', { name: /^Coverage/ }).click()
    await location('pr:file:f003').press('Enter')
    await save('Cover the interrupted receipt write.')
    await card
      .getByText('Trace a retry across the change', { exact: true })
      .click()
    await card.locator('.react-flow__node[data-id="g_send-key"]').press('Enter')
    await save('Which client owns this group?')
    await card
      .getByText('Trace a retry across the change', { exact: true })
      .click()
    await page.getByRole('button', { name: 'Annotate', exact: true }).click()
    await location('pr:summary:after').evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await card
      .getByRole('button', { name: 'Comment on passage', exact: true })
      .waitFor()
    await page.keyboard.press('Alt+Shift+M')
    await save('Show when the draft key is generated.')
    const snapshot = (await call('review_get', { review_id: review.review_id }))
      .review
    const [summary, story, quote, file] = snapshot.comments
    assert.deepEqual(
      [
        summary.anchor.path,
        story.anchor.section_id,
        quote.anchor.section_id,
        file.anchor.path,
      ],
      [
        'pr:summary:before',
        'pr:group:send-key:story:0',
        'pr:finding:two-writes:explanation',
        'pr:file:f003',
      ],
    )
    assert.equal(story.anchor.exact, report.groups[0].story[0].say)
    assert(
      snapshot.comments.every((c) => c.anchor.ledger_id === report.ledgerId),
    )
    assert.equal(quote.anchor.exact, exact)
    assert.equal(quote.anchor.start, drag.start)
    assert(quote.anchor.prefix && quote.anchor.suffix)
    assert.equal(snapshot.comments[4].anchor.path, 'pr:group:send-key')
    assert.equal(
      snapshot.comments[5].anchor.exact,
      report.summary.behaviorAfter,
    )
    await page.reload()
    const threadFor = (id: string) =>
      card
        .locator('.thread')
        .filter({ has: page.locator('[id="thread-' + id + '"]') })
    await threadFor(quote.id).locator('.thread-location').click()
    await explanation
      .locator('mark[data-current="true"]')
      .getByText(exact, { exact: true })
      .waitFor()
    await explanation.locator('mark').press('Enter')
    await page.waitForFunction(
      (id) => document.activeElement?.id === 'thread-' + id,
      quote.id,
    )
    await threadFor(file.id).locator('.thread-location').click()
    await card
      .locator('details[open] > [data-pr-location="pr:file:f003"]')
      .waitFor()
    await card
      .getByRole('button', { name: /Open discussion.*Cover the interrupted/ })
      .click()
    await page.waitForFunction(
      (id) => document.activeElement?.id === 'thread-' + id,
      file.id,
    )
    const revised = structuredClone(report)
    revised.findings[0].explanation =
      'Other clients can recover when the receipt write fails later.'
    await call('item_update', {
      review_id: review.review_id,
      item_id: review.item_ids[0],
      patch: { report: revised },
      reply: 'Reword the finding but retain the diff.',
    })
    await page.reload()
    await threadFor(quote.id).locator('.thread-location').click()
    await card.locator('[data-pr-stale]').waitFor()
    assert.equal(await explanation.locator('mark').count(), 0)
    await composer.fill('Keep the original evidence in scope.')
    assert(await card.getByRole('button', { name: 'Add comment' }).isDisabled())
    await threadFor(quote.id)
      .getByRole('button', { name: 'Reply', exact: true })
      .first()
      .click()
    await composer.fill('Keep the original evidence in scope.')
    await card.getByRole('button', { name: 'Send reply' }).click()
    const reply = threadFor(quote.id).getByText(
      'Keep the original evidence in scope.',
      { exact: true },
    )
    await reply.waitFor()
    assert.deepEqual(errors, [])
  } finally {
    await client.close()
    await browser.close()
    server.close()
    rmSync(data, { recursive: true, force: true })
  }
})
