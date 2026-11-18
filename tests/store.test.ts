import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openStore } from '../packages/core/src/store.ts'
test('submission is atomic, survives reopening SQLite, and closes the review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'janotate-test-')),
    file = join(dir, 'test.sqlite')
  let store = openStore(file)
  try {
    const item = {
      kind: 'decision' as const,
      title: 'Format?',
      options: [
        {
          id: 'json',
          label: 'JSON',
          tradeoffs: 'Machine readable',
          recommended: true,
        },
      ],
    }
    const {
      review_id: id,
      item_ids: [a, b],
    } = store.open('Export', [item, item], 'workspace')
    assert.throws(
      () =>
        store.submit(id, {
          [a]: { option: 'json' },
          [b]: { option: 'missing' },
        }),
      /invalid_items/,
    )
    assert.equal(store.get(id).items[0].status, 'asked')
    const result = store.submit(id, { [a]: { other: 'Markdown' } })
    assert.deepEqual(result.result?.skipped, [b])
    assert.equal(result.result?.answers[0].status, 'corrected')
    store.close()
    store = openStore(file)
    assert.deepEqual(store.result(id), result)
    assert.throws(() => store.submit(id, {}), /review_closed/)
  } finally {
    store.close()
    rmSync(dir, { recursive: true })
  }
})
test('changed workspace rulings supersede searchable answers and preserve both review results', () => {
  const store = openStore(':memory:')
  try {
    const item = {
      kind: 'decision',
      title: 'Export format?',
      options: [{ id: 'md', label: 'Markdown', tradeoffs: 'Readable' }],
    }
    function decide(value, mode) {
      const {
        review_id: id,
        item_ids: [key],
      } = store.open('Export', [item], mode)
      store.submit(id, { [key]: { other: value } })
      return id
    }
    const first = decide('Text', 'workspace')
    decide('Markdown', 'workspace')
    decide('JSON', 'session')
    const matches = store.query({ text: 'export format' })
    assert.equal(matches.length, 1)
    assert.equal(matches[0].answer, 'Markdown')
    assert.equal(store.result(first).result.answers[0].value, 'Text')
  } finally {
    store.close()
  }
})
