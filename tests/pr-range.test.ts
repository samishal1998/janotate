import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
import { openStore } from '../packages/core/src/store.ts'
import {
  prLinePath,
  prLineRange,
  prLocation,
} from '../packages/core/src/pr-review.ts'

const fixture = () =>
  JSON.parse(
    readFileSync('packages/docs/public/examples/receipt-review.json', 'utf8'),
  )

test('PR range endpoints must exist in one visible hunk, on one side, in the current ledger', () => {
  const report = fixture(),
    store = openStore(':memory:')
  try {
    const {
      review_id: id,
      item_ids: [key],
    } = store.open(
      'Notes',
      [{ kind: 'pr_review', title: 'Retry', report }],
      'session',
    )
    const valid = 'pr:lines:h001:new:22-24',
      anchor = { type: 'node', path: valid }
    assert.deepEqual(prLineRange(valid), {
      id: 'h001',
      side: 'new',
      first: 22,
      last: 24,
    })
    assert.equal(prLinePath(prLineRange(valid)), valid)
    assert.equal(prLocation(report, valid), 'api/notes.ts · new lines 22–24')
    assert.equal(
      prLocation(report, 'pr:lines:h001:old:18-20'),
      'api/notes.ts · old lines 18–20',
    )
    report.hunks[0].lines.pop()
    assert.equal(
      prLocation(report, 'pr:lines:h001:new:23-27'),
      undefined,
      'omitted end no longer exists',
    )
    for (const path of [
      'pr:lines:h001:new:24-22',
      'pr:lines:h001:new:22-22',
      'pr:lines:h001:old:19-23',
      'pr:lines:h001:new:0-2',
      'pr:lines:h001:new:022-24',
      'pr:line:h001:new:22-24',
      'pr:lines:h001:new:22-old:24',
      'pr:lines:h999:new:1-2',
      'pr:lines:h001:new:22-24:extra',
    ]) {
      assert.throws(
        () =>
          store.addComment(id, key, {
            anchor: { type: 'node', path },
            body: 'Invalid location.',
          }),
        /current PR report/,
        path,
      )
    }
    store.addComment(id, key, { anchor, body: 'Make the two writes atomic.' })
    const first = store.get(id).comments[0]
    assert.deepEqual(first.anchor, { ...anchor, ledger_id: report.ledgerId })
    const replacement = { ...fixture(), ledgerId: '111111111111' }
    store.update(
      id,
      key,
      { report: replacement },
      'A new patch is ready.',
      first.id,
    )
    store.reply(
      id,
      key,
      first.id,
      'The original range is still on the first patch.',
    )
    assert(
      store
        .get(id)
        .comments.every(
          (c) =>
            c.anchor.path === valid && c.anchor.ledger_id === report.ledgerId,
        ),
    )
    assert.throws(
      () =>
        store.addComment(id, key, {
          anchor: first.anchor,
          body: 'Wrong ledger.',
        }),
      /current PR report/,
    )
  } finally {
    store.close()
  }
})

test('keyboard endpoints, annotate clicks, Shift ranges and saved thread markers work across diff pages', async () => {
  const report = fixture(),
    extra = 60,
    h = report.hunks[0]
  for (let n = 0; n < extra; n++) h.lines.push('+// Retry fixture ' + n)
  h.newLines += extra
  h.additions += extra
  report.groups.find((g) => g.id === h.groupId).stats.additions += extra
  report.files[0].additions += extra
  const data = mkdtempSync(join(tmpdir(), 'janotate-pr-range-')),
    service = await start(
      data,
      0,
      true,
      resolve(process.env.JANOTATE_TEST_DIST ?? 'dist'),
    )
  const browser = await chromium.launch(),
    client = new Client({ name: 'annotation-tests', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', service.origin)),
    )
    const result = await client.callTool({
      name: 'review_open',
      arguments: {
        title: 'Receipt review',
        items: [{ kind: 'pr_review', title: 'Receipt retries', report }],
      },
    })
    assert(!result.isError, JSON.stringify(result.content))
    const { url, review_id } = result.structuredContent
    const page = await browser.newPage(),
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(url)
    const card = page.locator('.kind-pr_review'),
      button = (name: string) =>
        card.getByRole('button', { name, exact: true }),
      gutter = (side: string, line: number) =>
        button('Comment on ' + side + ' line ' + line)
    const evidence = card.getByRole('region', { name: 'Diff evidence' })
    async function save(body: string) {
      await card.getByRole('textbox').fill(body)
      await button('Add comment').click()
      await card.locator('.bubble').filter({ hasText: body }).waitFor()
    }
    await button('Next change group').click()
    await button('Select lines').press('Enter')
    await gutter('new', 24).press('Enter')
    await gutter('old', 19).press('Enter')
    await card.getByText('Choose a new line to finish this range.').waitFor()
    await gutter('new', 22).press('Enter')
    const range = 'pr:lines:h001:new:22-24'
    await card.getByRole('textbox', { name: 'Comment on ' + range }).waitFor()
    assert.equal(await evidence.locator('[data-pr-selected]').count(), 3)
    await save('Keep this write atomic.')
    assert.equal(await evidence.locator('[data-threaded]').count(), 3)
    await button('Open discussion on new lines 22–24').click()
    await page.locator('.message:focus').waitFor()
    await button('Select lines').click()
    await gutter('old', 18).click()
    await gutter('old', 19).press('Escape')
    assert.equal(
      await button('Select lines').getAttribute('aria-pressed'),
      'false',
    )

    await page.getByRole('button', { name: /^Annotate(?:\s|$)/ }).click()
    await button('Annotate code on new line 23').click()
    assert(
      await card
        .getByRole('textbox', { name: 'Comment on pr:line:h001:new:23' })
        .evaluate((el) => el === document.activeElement),
    )
    await save('This write returns the receipt.')
    await gutter('new', 23).click()
    await button('Next lines').click()
    await gutter('new', 80).click({ modifiers: ['Shift'] })
    await card
      .getByRole('textbox', { name: 'Comment on pr:lines:h001:new:23-80' })
      .waitFor()
    await save('Check this whole batch after a reconnect.')
    await button('Previous change group').click()
    await evidence.getByText('mobile/upload.ts', { exact: true }).waitFor()
    await button('api/notes.ts · new lines 23–80').click()
    await evidence.getByText('api/notes.ts', { exact: true }).waitFor()
    await evidence
      .locator('[data-pr-anchor="pr:lines:h001:new:23-80"]:focus')
      .waitFor()
    await button('Next lines').click()
    assert((await evidence.locator('[data-pr-selected]').count()) > 0)
    await button('api/notes.ts · new lines 23–80').click()
    await evidence
      .locator('[data-pr-anchor="pr:lines:h001:new:23-80"]:focus')
      .waitFor()
    await page.reload()
    await button('api/notes.ts · new lines 22–24').click()
    await button('Open discussion on new lines 22–24').waitFor()
    assert((await evidence.locator('[data-pr-selected]').count()) === 3)
    const revised = await client.callTool({
      name: 'item_update',
      arguments: {
        review_id,
        item_id: result.structuredContent.item_ids[0],
        patch: { report: { ...report, ledgerId: '222222222222' } },
        reply: 'The source diff changed.',
      },
    })
    assert(!revised.isError, JSON.stringify(revised.content))
    await button('Earlier diff · ' + range).click()
    await card.locator('[data-pr-stale]:focus').waitFor()
    assert.equal(
      await evidence.locator('[data-threaded],[data-pr-selected]').count(),
      0,
    )
    await evidence.getByText('mobile/upload.ts', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Submit review' }).click()
    await page.getByText('Review submitted').waitFor()
    const done = (
      await client.callTool({ name: 'review_get', arguments: { review_id } })
    ).structuredContent
    assert.deepEqual(
      done.result.comments
        .filter((c) => c.author === 'user')
        .map((c) => c.anchor.path),
      [range, 'pr:line:h001:new:23', 'pr:lines:h001:new:23-80'],
    )
    assert(
      done.result.comments.every((c) => c.anchor.ledger_id === report.ledgerId),
    )
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await client.close()
    service.close()
    rmSync(data, { recursive: true, force: true })
  }
})
