import test from 'node:test'
import assert from 'node:assert/strict'
import { openStore } from '../packages/core/src/store.ts'
test('option thread revision reopens only its own answered item', () => {
  const s = openStore(':memory:')
  try {
    const item = {
      kind: 'decision',
      title: 'Format?',
      options: [{ id: 'md', label: 'Markdown', tradeoffs: 'Portable' }],
    }
    const {
      review_id: id,
      item_ids: [a, b],
    } = s.open('Review', [item, item], 'workspace')
    for (const key of [a, b]) s.save(id, key, { option: 'md' })
    const anchor = { type: 'node', path: 'option:md' }
    s.addComment(id, a, { body: 'Readable on mobile?', anchor })
    const revised = s.update(
      id,
      a,
      { title: 'Mobile format?' },
      'Yes, here is a revised question.',
    )
    assert.equal(revised.status, 'asked')
    assert.equal(revised.revision, 2)
    const r = s.get(id)
    assert.equal(r.items[1].status, 'confirmed')
    assert.equal(r.items[1].value, 'md')
    assert.equal(r.comments[1].parent_id, r.comments[0].id)
    assert.deepEqual(r.comments[1].anchor, anchor)
    assert.equal(JSON.parse(r.comments[1].previous_body).title, 'Format?')
  } finally {
    s.close()
  }
})
test('text anchors round trip including whitespace and quote context', () => {
  const s = openStore(':memory:')
  try {
    const {
      review_id: id,
      item_ids: [key],
    } = s.open(
      'Quotes',
      [
        {
          kind: 'decision',
          title: 'Format?',
          options: [
            { id: 'md', label: 'Markdown', tradeoffs: 'Readable text' },
          ],
        },
      ],
      'workspace',
    )
    const anchor = {
      type: 'text',
      prefix: 'Readable',
      exact: ' text',
      suffix: '',
    }
    s.addComment(id, key, { body: 'Keep this wording', anchor })
    assert.deepEqual(s.submit(id, {}).result.comments[0].anchor, anchor)
  } finally {
    s.close()
  }
})
