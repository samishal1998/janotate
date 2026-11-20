import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { applyPatch } from 'diff'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
import { parseDbml, compareSchema } from '../packages/ui/src/dbml-model.ts'
import { dbmlPatch, dbmlText } from '../packages/core/src/dbml-patch.ts'
import { openStore } from '../packages/core/src/store.ts'

test('DBML patches preserve exact line endings, missing final newlines and large rewrites', () => {
  const windows = 'Table notes {\r\n  id uuid [pk]\r\n  title text\r\n}'
  const large = Array.from({ length: 1200 }, (_, i) => '// old ' + i).join('\n')
  for (const [before, after] of [
    [windows, windows.replace('title text', 'title varchar')],
    ['', windows],
    [windows, ''],
    [large, large.replaceAll('old', 'new')],
  ]) {
    const item = { filename: 'db/pilot.dbml', source_text: before, revision: 3 }
    const patch = dbmlPatch(item, after)
    assert.equal(patch.base_revision, 3)
    assert.match(
      patch.patch,
      /^--- a\/db\/pilot\.dbml\n\+\+\+ b\/db\/pilot\.dbml\n@@ /,
    )
    assert.equal(
      applyPatch(before, patch.patch, { autoConvertLineEndings: false }),
      after,
    )
    assert.equal(dbmlText(item, patch), after)
  }
})

test('DBML answers reject stale and malformed patches and can confirm without changes', () => {
  const store = openStore(':memory:')
  try {
    const proposal = {
      kind: 'dbml' as const,
      title: 'Notes',
      source_text: 'Table notes {\n  id uuid\n}',
    }
    const {
      review_id: id,
      item_ids: [key],
    } = store.open('DBML', [proposal], 'session')
    const first = store.get(id).items[0]
    const edited = proposal.source_text.replace('uuid', 'int')
    // Existing clients can still reopen saved full-text answers.
    store.save(id, key, { code: edited })
    assert.equal(store.get(id).items[0].value, edited)
    const patch = dbmlPatch(first, edited)
    assert.throws(
      () => store.save(id, key, { ...patch, patch: 'garbage' }),
      /header/,
    )
    store.update(
      id,
      key,
      { filename: 'notes.dbml' },
      'Use this filename.',
      null,
    )
    assert.throws(() => store.save(id, key, patch), /revision/)
    const second = store.get(id).items[0]
    const result = store.submit(id, {
      [key]: dbmlPatch(second, second.source_text),
    }).result
    assert.equal(result.answers[0].status, 'confirmed')
    assert.deepEqual(result.answers[0].value, {
      format: 'unified_diff',
      base_revision: 2,
      patch: '',
    })
  } finally {
    store.close()
  }
})
test('submitting a legacy DBML draft returns only the reviewer’s changes', () => {
  const store = openStore(':memory:')
  try {
    const item = {
      kind: 'dbml' as const,
      title: 'Notes',
      filename: 'données.dbml',
      source_text: 'Table notes {\r\n  id uuid\n}',
    }
    const {
      review_id: id,
      item_ids: [saved, direct],
    } = store.open('DBML', [item, item], 'session')
    const edited = item.source_text.replace('uuid', 'int')
    store.save(id, saved, { code: edited })
    const result = store.submit(id, { [direct]: { code: edited } }).result
    for (const a of result.answers) {
      assert.deepEqual(a.value, dbmlPatch({ ...item, revision: 1 }, edited))
      assert.equal(dbmlText({ ...item, revision: 1 }, a.value), edited)
    }
  } finally {
    store.close()
  }
})

test('official DBML compiler accepts named schemas, quoted identifiers and composite keys', () => {
  const model = parseDbml(
    'Table team."shift lead" {\n crew int\n shift int\n indexes {\n (crew,shift) [pk]\n }\n}\nTable team.logs {\n crew int\n shift int\n}\nRef: team.logs.(crew,shift) > team."shift lead".(crew,shift)',
  )
  assert.equal(model.tables.length, 2)
  assert.equal(model.relations.length, 1)
  assert.equal(compareSchema(model, model).length, 0)
  const plain = 'Table notes {\n receipt uuid\n',
    indexed = parseDbml(
      plain + ' indexes {\n receipt [unique, name: "receipt_key"]\n }\n}',
    )
  assert.equal(
    compareSchema(parseDbml(plain + '}'), indexed)[0].path,
    'index:notes.receipt_key',
  )
  assert.throws(() => parseDbml('Table crew {\n id\n}'), /Line 2/)
})
test('offline graph and DBML editing, scoped discussion, focus navigation and exact MCP result', async () => {
  const data = mkdtempSync(join(tmpdir(), 'janotate-erd-')),
    s = await start(data, 0, false, resolve('dist'))
  const browser = await chromium.launch(),
    client = new Client({ name: 'schema-review', version: '1' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', s.origin)),
    )
    const sample = (name) =>
      JSON.parse(
        readFileSync(
          'packages/docs/src/content/docs/' + name + '.md',
          'utf8',
        ).match(/```json\n([\s\S]*?)\n```/)[1],
      ).arguments.items[0]
    const item = sample('interfaces/dbml')
    item.source_text = item.source_text.replaceAll('\n', '\r\n')
    const r = (
      await client.callTool({
        name: 'review_open',
        arguments: {
          title: 'Delivery',
          items: [item, sample('guides/infrastructure')],
        },
      })
    ).structuredContent as any
    const p = await browser.newPage({
      viewport: { width: 1340, height: 870 },
      colorScheme: 'dark',
    })
    p.setDefaultTimeout(6500)
    const away = []
    await p.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === s.origin)
        return route.continue()
      away.push(route.request().url())
      return route.abort()
    })
    await p.goto(r.url + '?view=focus')
    await p
      .getByRole('button', {
        name: 'Select column notes.client_key',
        exact: true,
      })
      .click()
    await p
      .getByRole('textbox', { name: 'Comment on field:notes.client_key' })
      .fill('Keep this unique across retries.')
    await p.getByRole('button', { name: 'Add comment' }).click()
    await p
      .getByText('Keep this unique across retries.', { exact: true })
      .waitFor()
    await p.getByRole('button', { name: /^Changes/ }).click()
    const changed = p
      .locator('.schema-changes button')
      .filter({ hasText: 'notes.body' })
    assert.match(await changed.innerText(), /not null/)
    await changed.click()
    await p.getByRole('button', { name: 'DBML', exact: true }).click()
    const editor = p.locator('.cm-content').first()
    assert.equal(await editor.getAttribute('contenteditable'), 'false')
    await p.getByRole('button', { name: 'Edit DBML' }).click()
    await editor.fill('Table incomplete {\n id\n}')
    await p.getByText('Diagram preview unavailable').waitFor()
    const updated =
      item.source_text.replace(
        '  client_key uuid [unique]',
        '  client_key uuid [unique]\r\n  observed_at timestamp',
      ) + '\r\n'
    await editor.fill(updated.replaceAll('\r\n', '\n'))
    await p
      .getByRole('button', {
        name: 'Select column notes.observed_at',
        exact: true,
      })
      .waitFor()
    await p.getByRole('button', { name: 'Preview patch' }).click()
    const raw = await p
      .getByLabel('Outgoing schema patch')
      .locator('pre')
      .textContent()
    assert.match(raw, /\+  observed_at timestamp/)
    assert.doesNotMatch(raw, /^\+Table receipts/m)
    const onSave = p.waitForRequest(
      (req) => req.url().endsWith('/answer') && req.method() === 'POST',
    )
    await p.getByRole('button', { name: 'Save patch' }).click()
    const saved = (await onSave).postDataJSON()
    assert.deepEqual(saved, {
      format: 'unified_diff',
      base_revision: 1,
      patch: raw,
    })
    assert.equal(
      applyPatch(item.source_text, saved.patch, {
        autoConvertLineEndings: false,
      }),
      updated,
    )
    await p
      .locator('.kind-dbml .item-state')
      .filter({ hasText: 'corrected' })
      .waitFor()
    await p.reload()
    await p
      .getByRole('button', {
        name: 'Select column notes.observed_at',
        exact: true,
      })
      .waitFor()
    await p
      .getByRole('group', { name: 'Review views' })
      .getByRole('button', { name: /Threads/ })
      .click()
    await p.locator('.thread-inbox button').first().click()
    assert.equal(
      await p
        .getByRole('button', {
          name: 'Select column notes.client_key',
          exact: true,
        })
        .getAttribute('aria-pressed'),
      'true',
    )
    await p.getByRole('button', { name: 'Edit DBML' }).click()
    const final = updated.replace(
      'observed_at timestamp',
      'observed_at timestamp [not null]',
    )
    await editor.fill(final.replaceAll('\r\n', '\n'))
    await p.getByLabel('Next review item').click()
    const graph = p.locator('.kind-diagram')
    await graph
      .getByRole('button', { name: 'GitHub Actions', exact: true })
      .click()
    await graph
      .getByRole('button', { name: 'Preview deploy', exact: true })
      .click()
    await graph.getByText('Holds the preview', { exact: false }).waitFor()
    const viewport = graph.locator('.react-flow__viewport')
    const initial = await viewport.getAttribute('style')
    await graph.getByLabel('Zoom in').click()
    assert.notEqual(await viewport.getAttribute('style'), initial)
    await p.getByRole('button', { name: 'Submit review' }).click()
    await p.getByText('Review submitted').waitFor()
    const result = (
      await client.callTool({
        name: 'review_get',
        arguments: { review_id: r.review_id },
      })
    ).structuredContent as any
    const value = result.result.answers[0].value
    assert.deepEqual(Object.keys(value).sort(), [
      'base_revision',
      'format',
      'patch',
    ])
    assert.equal(value.format, 'unified_diff')
    assert.equal(value.base_revision, 1)
    assert.equal(
      applyPatch(item.source_text, value.patch, {
        autoConvertLineEndings: false,
      }),
      final,
    )
    const waited = (
      await client.callTool({
        name: 'review_wait',
        arguments: { review_id: r.review_id, wait_seconds: 1 },
      })
    ).structuredContent as any
    assert.deepEqual(waited.result.answers[0].value, value)
    const retry = await fetch(s.origin + '/api/review/' + r.review_id, {
      method: 'POST',
      headers: { origin: s.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ [r.item_ids[0]]: value }),
    })
    assert.equal(retry.status, 200)
    const legacyRetry = await fetch(s.origin + '/api/review/' + r.review_id, {
      method: 'POST',
      headers: { origin: s.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ [r.item_ids[0]]: { code: final } }),
    })
    assert.equal(legacyRetry.status, 200)
    assert.equal(
      result.result.comments[0].anchor.path,
      'field:notes.client_key',
    )
    assert.deepEqual(away, [])
    await p.setViewportSize({ width: 320, height: 700 })
    await p.reload()
    await p.getByRole('button', { name: 'DBML', exact: true }).click()
    await p.locator('.cm-content[contenteditable=false]').waitFor()
    assert(
      await p.evaluate(
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
