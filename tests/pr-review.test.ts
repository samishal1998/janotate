import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prReport, numberedLines } from '../packages/core/src/pr-review.ts'
import { openStore } from '../packages/core/src/store.ts'
import { start } from '../packages/server/src/http.ts'

const fixture = () =>
  JSON.parse(
    readFileSync('packages/docs/public/examples/receipt-review.json', 'utf8'),
  )

test('native PR review preserves the v2 report and rejects unsupported ownership and evidence', () => {
  const sample = fixture()
  assert.deepEqual(prReport.parse(sample), sample)
  const bad = [
    (r) => r.groups[0].hunks.push(r.groups[0].hunks[0]),
    (r) => r.groups[0].hunks.splice(0),
    (r) => (r.hunks[0].groupId = r.groups[0].id),
    (r) => (r.groups[0].story[0].show = ['h001']),
    (r) => (r.groups[0].story[0].show = ['h002:old:99-101']),
    (r) => (r.findings[0].anchor.line = 999),
    (r) => (r.findings[0].hunkIds = ['h999']),
    (r) => (r.files[0].hunkIds = ['h003']),
    (r) => r.coverage.classifiedHunks++,
    (r) => r.groups[0].stats.files++,
    (r) => (r.files[0].reviewed = false),
    (r) => (r.groups[0].dependsOn = ['reuse-receipt']),
    (r) =>
      r.unclassified.push({
        hunkId: 'h001',
        reason: 'Already assigned to another change.',
      }),
  ]
  for (const mutate of bad) {
    const changed = fixture()
    mutate(changed)
    assert.equal(prReport.safeParse(changed).success, false)
  }
  const rows = numberedLines(sample.hunks[0])
  assert.deepEqual(
    rows.find((r) => r.text.startsWith('-')),
    { text: '-  return notes.insert(note);', old: 19, new: null },
  )
  assert.equal(
    rows.find((r) => r.new === 23).text,
    '+  await receipts.put(note.clientKey, row.id);',
  )
})

test('revisions keep existing discussion anchored to the original diff', () => {
  const store = openStore(':memory:')
  try {
    const report = fixture(),
      item = { kind: 'pr_review', title: 'Receipt retries', report }
    const {
      review_id: id,
      item_ids: [key],
    } = store.open('Example', [item], 'session')
    const anchor = { type: 'node', path: 'pr:line:h001:new:23' }
    assert.throws(
      () =>
        store.addComment(id, key, {
          anchor: { type: 'node', path: 'pr:line:h001:new:70' },
          body: 'Missing evidence.',
        }),
      /choose evidence/,
    )
    store.addComment(id, key, {
      anchor,
      body: 'Can these writes commit together?',
    })
    const first = store.get(id).comments[0]
    assert.equal(first.anchor.ledger_id, report.ledgerId)
    const updated = store.update(
      id,
      key,
      { report: { ...report, ledgerId: '111111111111' } },
      'Review the revised diff.',
      first.id,
    )
    assert.deepEqual(updated.report, { ...report, ledgerId: '111111111111' })
    store.reply(id, key, first.id, 'Yes. The original discussion stays here.')
    assert(
      store
        .get(id)
        .comments.every((c) => c.anchor.ledger_id === report.ledgerId),
    )
    assert.throws(
      () =>
        store.addComment(id, key, {
          anchor: first.anchor,
          body: 'Stale target.',
        }),
      /choose evidence/,
    )
  } finally {
    store.close()
  }
})

test('file-level and omitted evidence stays visible in the ledger; unclassified hunks need a reason', () => {
  const r = fixture()
  r.files.push({
    id: 'f004',
    path: 'assets/map.png',
    status: 'renamed',
    additions: 0,
    deletions: 0,
    hunkIds: ['h004'],
    groupIds: [],
    reviewed: true,
  })
  r.hunks.push({
    id: 'h004',
    fileId: 'f004',
    kind: 'rename',
    additions: 0,
    deletions: 0,
    redacted: 0,
    groupId: null,
    lines: [],
    relatedGroupIds: [],
    truncated: false,
    omittedLines: 0,
  })
  r.unclassified.push({
    hunkId: 'h004',
    reason: 'The patch renames an unrelated sample map.',
  })
  Object.assign(r.coverage, {
    totalHunks: 4,
    unclassifiedHunks: 1,
    totalFiles: 4,
    reviewedFiles: 4,
    fileLevelHunks: 1,
  })
  assert.deepEqual(prReport.parse(r), r)
  r.hunks[0].lines.pop()
  r.hunks[0].truncated = true
  r.hunks[0].omittedLines = 1
  assert.equal(
    prReport.safeParse(r).success,
    false,
    'a finding cannot point to a line omitted from a report',
  )
  r.findings[1].anchor.line = 26
  assert.deepEqual(prReport.parse(r), r)
})

test('reviewers follow evidence, return to old and new lines from threads, and submit a verdict to MCP', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-pr-review-'))
  const service = await start(
    data,
    0,
    true,
    resolve(process.env.JANOTATE_TEST_DIST ?? 'dist'),
  )
  const client = new Client({ name: 'pr-review-test', version: '1' }),
    browser = await chromium.launch()
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', service.origin)),
    )
    const sample = fixture()
    const doc = readFileSync(
      'packages/docs/src/content/docs/interfaces/pr_review.md',
      'utf8',
    )
    const example = doc.match(/```js\n([\s\S]*?)\n```/)[1]
    const call = runInNewContext(example + '\nopenPullRequest(report)', {
      report: sample,
    })
    const opened = await client.callTool(call)
    assert(!opened.isError, JSON.stringify(opened.content))
    const { url, review_id, item_ids } = opened.structuredContent
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    const errors = [],
      outside = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== service.origin) {
        outside.push(route.request().url())
        return route.abort()
      }
      await route.continue()
    })
    await page.goto(url)
    const card = page.locator('.kind-pr_review')
    await card
      .getByRole('heading', { name: 'Give each draft a repeatable upload key' })
      .waitFor()
    await card
      .getByText('Trace a retry across the change', { exact: true })
      .click()
    await card
      .locator('.react-flow__node')
      .filter({ hasText: 'Receipt write fails' })
      .click()
    await card
      .getByRole('heading', {
        name: 'A failed receipt write leaves a duplicate on retry',
      })
      .waitFor()
    await card
      .getByText('Trace a retry across the change', { exact: true })
      .click()
    await card.getByRole('button', { name: /^Change groups/ }).click()
    await card.getByRole('button', { name: 'Next change group' }).click()
    await card.getByRole('button', { name: 'api/notes.ts · new 22–24' }).click()
    assert.equal(await card.locator('.pr-diff-row[data-match]').count(), 3)
    const insert = card
      .locator('.pr-diff-row code')
      .filter({ hasText: 'const row = await notes.insert(note);' })
      .first()
    assert.equal(
      await insert.textContent(),
      '+  const row = await notes.insert(note);',
    )
    assert.equal(
      await insert.locator('.token.keyword').first().textContent(),
      'const',
    )
    await page.setViewportSize({ width: 320, height: 760 })
    assert(
      await card.locator('.pr-review').evaluate((el) => {
        const box = el.getBoundingClientRect()
        return [
          ...el.querySelectorAll(
            '.pr-overview,.pr-tabs,.pr-detail,.pr-evidence,.pr-diff-scroll',
          ),
        ].every((panel) => {
          const rect = panel.getBoundingClientRect()
          return rect.left >= box.left - 1 && rect.right <= box.right + 1
        })
      }),
      'each PR panel must fit in the report at 320px',
    )
    assert(
      await card
        .locator('.pr-diff-scroll')
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      'long code should scroll within the evidence panel',
    )
    await page.setViewportSize({ width: 1280, height: 900 })
    async function comment(control, body) {
      await control.click()
      await card.getByRole('textbox').fill(body)
      await card.getByRole('button', { name: 'Add comment' }).click()
      await card.locator('.bubble').filter({ hasText: body }).waitFor()
    }
    await comment(
      card.getByRole('button', { name: 'Comment on old line 19' }),
      'Keep the old response stable.',
    )
    await card.getByRole('button', { name: /^Findings/ }).click()
    await card
      .getByRole('heading', {
        name: 'A failed receipt write leaves a duplicate on retry',
      })
      .waitFor()
    await comment(
      card.getByRole('button', { name: 'Discuss finding' }),
      'Block until these writes are atomic.',
    )
    await comment(
      card.getByRole('button', { name: 'Comment on new line 23' }),
      'Simulate failure at this write.',
    )
    const composer = card.getByRole('textbox')
    await composer.fill('A second thought on this line')
    await card.getByRole('button', { name: 'Comment on whole PR' }).click()
    assert.equal(await composer.inputValue(), '')
    await composer.fill('A separate general draft')
    await card
      .getByRole('button', { name: 'Comment on new line 23', exact: true })
      .click()
    await page.waitForFunction(
      () => document.activeElement?.tagName === 'TEXTAREA',
    )
    assert.equal(await composer.inputValue(), 'A second thought on this line')
    await card.getByRole('button', { name: /^This location/ }).click()
    assert.equal(await card.locator('.thread').count(), 1)
    assert.match(await card.locator('.thread').innerText(), /Simulate failure/)
    await card.getByRole('button', { name: /^All threads/ }).click()
    assert.equal(await card.locator('.thread').count(), 3)
    await card.getByRole('button', { name: 'View source' }).click()
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('data-pr-anchor') ===
        'pr:line:h001:new:23',
    )
    await card.getByRole('button', { name: /^Coverage/ }).click()
    await card
      .getByText('3 files · 3 of 3 hunks grouped · 0 unclassified')
      .waitFor()
    await card
      .locator('summary')
      .filter({ hasText: 'tests/notes.test.ts' })
      .click()
    await card
      .getByRole('button', { name: 'tests/notes.test.ts · h003' })
      .click()
    await card
      .getByRole('region', { name: 'Diff evidence' })
      .getByText('tests/notes.test.ts', { exact: true })
      .waitFor()
    await card
      .getByRole('button', { name: 'api/notes.ts · old line 19' })
      .click()
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('data-pr-anchor') ===
        'pr:line:h001:old:19',
    )
    await card
      .locator('.pr-diff-row[data-match]')
      .getByText('return notes.insert(note);', { exact: false })
      .waitFor()
    await card
      .getByRole('combobox', { name: 'Your review' })
      .selectOption('request_changes')
    await page.getByRole('button', { name: 'Submit review' }).click()
    await page.getByText('Review submitted').waitFor()
    const done = (
      await client.callTool({ name: 'review_get', arguments: { review_id } })
    ).structuredContent
    assert.deepEqual(done.result.answers[0].value, {
      verdict: 'request_changes',
    })
    assert.deepEqual(
      done.result.comments.map((c) => c.anchor.path),
      ['pr:line:h001:old:19', 'pr:finding:two-writes', 'pr:line:h001:new:23'],
    )
    assert(done.result.comments.every((c) => c.item_id === item_ids[0]))
    await page.reload()
    await card.getByRole('button', { name: /^Coverage/ }).click()
    assert(
      await card.getByRole('combobox', { name: 'Your review' }).isDisabled(),
    )
    assert.deepEqual(errors, [])
    assert.deepEqual(outside, [])
  } finally {
    await client.close()
    await browser.close()
    service.close()
    rmSync(data, { recursive: true, force: true })
  }
})
