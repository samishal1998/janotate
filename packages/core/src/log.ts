import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
export function decisionLog(db: DatabaseSync, folder?: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS decision(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES item(id),question TEXT NOT NULL,answer_json TEXT NOT NULL,tags TEXT NOT NULL,decided_at TEXT NOT NULL,superseded_by TEXT REFERENCES decision(id),exported INTEGER DEFAULT 0);
 CREATE VIRTUAL TABLE IF NOT EXISTS decision_search USING fts5(question,tags);`)
  function record(review) {
    if (review.mode !== 'workspace') return
    for (const item of review.items) {
      if (item.kind !== 'decision' || item.value === undefined) continue
      const id = randomUUID(),
        tags = JSON.stringify(item.tags ?? [])
      const old = db
        .prepare(
          'SELECT id FROM decision WHERE question=? COLLATE NOCASE AND superseded_by IS NULL',
        )
        .all(item.title)
      const row = db
        .prepare(
          'INSERT INTO decision(id,item_id,question,answer_json,tags,decided_at) VALUES(?,?,?,?,?,?)',
        )
        .run(
          id,
          item.id,
          item.title,
          JSON.stringify(item.value),
          tags,
          review.submitted_at,
        )
      db.prepare(
        'INSERT INTO decision_search(rowid,question,tags) VALUES(?,?,?)',
      ).run(row.lastInsertRowid, item.title, tags)
      for (const previous of old)
        db.prepare(
          'UPDATE decision SET superseded_by=?,exported=0 WHERE id=?',
        ).run(id, previous.id)
    }
  }
  function flush() {
    if (!folder) return
    for (const row of db
      .prepare('SELECT * FROM decision WHERE exported=0')
      .all()) {
      mkdirSync(folder, { recursive: true })
      const path = join(folder, row.id + '.md'),
        temp = path + '.tmp'
      writeFileSync(
        temp,
        '# ' +
          row.question +
          '\n\n' +
          JSON.parse(String(row.answer_json)) +
          '\n\nDecided ' +
          row.decided_at +
          ' by the reviewer.\n\nSource item: ' +
          row.item_id +
          '\n' +
          (row.superseded_by
            ? '\nSuperseded by ' + row.superseded_by + '\n'
            : ''),
        { mode: 0o600 },
      )
      renameSync(temp, path)
      db.prepare('UPDATE decision SET exported=1 WHERE id=?').run(row.id)
    }
  }
  function query({ text = '', tags = [], kinds = [], limit = 20 }) {
    const args = [],
      where = ['d.superseded_by IS NULL']
    if (kinds.length && !kinds.includes('decision')) return []
    const words = text.match(/[\p{L}\p{N}_]+/gu) ?? []
    if (text.trim() && !words.length) return []
    if (words.length) {
      where.push(
        'd.rowid IN (SELECT rowid FROM decision_search WHERE decision_search MATCH ?)',
      )
      args.push(words.map((w) => '"' + w + '"').join(' AND '))
    }
    for (const tag of tags) {
      where.push('EXISTS (SELECT 1 FROM json_each(d.tags) WHERE value=?)')
      args.push(tag)
    }
    return db
      .prepare(
        'SELECT d.*,i.review_id FROM decision d JOIN item i ON i.id=d.item_id WHERE ' +
          where.join(' AND ') +
          ' ORDER BY decided_at DESC LIMIT ?',
      )
      .all(...args, limit)
      .map((row) => ({
        id: row.id,
        review_id: row.review_id,
        item_id: row.item_id,
        kind: 'decision',
        question: row.question,
        answer: JSON.parse(String(row.answer_json)),
        tags: JSON.parse(String(row.tags)),
        source: { by: 'user', basis: 'stated' },
        decided_at: row.decided_at,
      }))
  }
  flush()
  return { record, flush, query }
}
