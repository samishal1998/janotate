import { decisionLog } from './log.ts'
import { prLocation } from './pr-review.ts'
import { prQuoteOffset } from './pr-passage.ts'
import { payloads, catalogAnswer } from './catalog.ts'
import { itemSchema, commentInput, type ItemInput } from './schema.ts'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { dbmlText, dbmlPatch, type DbmlPatch } from './dbml-patch.ts'

export function openStore(path: string, exportFolder?: string) {
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS review(id TEXT PRIMARY KEY,title TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('workspace','session')),state TEXT NOT NULL CHECK(state IN ('open','done','expired','cancelled')),created_at TEXT NOT NULL,expires_at TEXT,submitted_at TEXT);
    CREATE TABLE IF NOT EXISTS item(id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES review(id),kind TEXT NOT NULL,title TEXT NOT NULL,body_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('asked','defaulted','confirmed','corrected','superseded')),source_by TEXT NOT NULL CHECK(source_by IN ('user','agent')),source_basis TEXT CHECK(source_basis IN ('stated','inferred','unverified')),value_json TEXT,revision INTEGER NOT NULL DEFAULT 1,superseded_by TEXT REFERENCES item(id));`)
  db.exec(
    `CREATE TABLE IF NOT EXISTS comment(id TEXT PRIMARY KEY,item_id TEXT REFERENCES item(id),parent_id TEXT REFERENCES comment(id),author TEXT,anchor_json TEXT,body TEXT,created_at TEXT,previous_body TEXT)`,
  )
  // Migrate stores created by the first slice without replacing review history.
  const columns = (table: string) =>
    db
      .prepare('PRAGMA table_info(' + table + ')')
      .all()
      .map((c) => c.name)
  if (!columns('review').includes('last_activity'))
    db.exec('ALTER TABLE review ADD COLUMN last_activity TEXT')
  if (!columns('item').includes('skipped'))
    db.exec('ALTER TABLE item ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0')
  db.exec(`CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES item(id),label TEXT NOT NULL,url TEXT);
  CREATE TRIGGER IF NOT EXISTS activity_item AFTER UPDATE ON item BEGIN UPDATE review SET last_activity=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.review_id; END;
  CREATE TRIGGER IF NOT EXISTS activity_comment AFTER INSERT ON comment BEGIN UPDATE review SET last_activity=NEW.created_at WHERE id=(SELECT review_id FROM item WHERE id=NEW.item_id); END;`)
  if (!columns('review').includes('version'))
    db.exec('ALTER TABLE review ADD COLUMN version INTEGER NOT NULL DEFAULT 0')
  db.exec(`CREATE TRIGGER IF NOT EXISTS review_version AFTER UPDATE OF last_activity,state ON review
    BEGIN UPDATE review SET version=version+1 WHERE id=NEW.id; END;`)
  const listeners = new Map<string, Set<() => void>>()
  function announce(id: string) {
    for (const wake of listeners.get(id) ?? []) wake()
  }
  function waitForChange(
    id: string,
    milliseconds: number,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted()
    return new Promise<void>((resolve, reject) => {
      const group = listeners.get(id) ?? new Set()
      listeners.set(id, group)
      function finish() {
        clearTimeout(timer)
        group.delete(finish)
        if (!group.size) listeners.delete(id)
        signal?.removeEventListener('abort', finish)
        if (signal?.aborted) reject(signal.reason)
        else resolve()
      }
      const timer = setTimeout(finish, milliseconds)
      group.add(finish)
      signal?.addEventListener('abort', finish, { once: true })
    })
  }
  const log = decisionLog(db, exportFolder)
  function comments(id: string, after = 0, reviewerOnly = false) {
    return db
      .prepare(
        "SELECT c.rowid AS cursor,c.* FROM comment c JOIN item i ON i.id=c.item_id WHERE i.review_id=? AND c.rowid>? AND (?=0 OR c.author='user') ORDER BY c.rowid",
      )
      .all(id, after, Number(reviewerOnly))
      .map(({ anchor_json, ...row }) => ({
        ...row,
        id: String(row.id),
        cursor: Number(row.cursor),
        item_id: String(row.item_id),
        anchor: JSON.parse(String(anchor_json)),
      }))
  }
  function atomic<T>(fn: () => T) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      db.exec('COMMIT')
      return value
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  function rowFor(id: string) {
    const now = new Date().toISOString()
    db.prepare(
      "UPDATE review SET state='expired' WHERE id=? AND state='open' AND expires_at<=?",
    ).run(id, now)
    const row = db.prepare('SELECT * FROM review WHERE id=?').get(id)
    if (!row) throw Error('not_found: review_id')
    return row
  }
  function get(id: string) {
    const row = rowFor(id)
    const items = db
      .prepare('SELECT * FROM item WHERE review_id=? ORDER BY rowid')
      .all(id)
      .map((i) => ({
        ...JSON.parse(String(i.body_json)),
        id: String(i.id),
        source: { by: i.source_by, basis: i.source_basis },
        skipped: Boolean(i.skipped),
        revision: i.revision,
        status: i.status,
        value:
          i.value_json === null ? undefined : JSON.parse(String(i.value_json)),
      }))
    return {
      ...row,
      id,
      last_activity: row.last_activity ?? row.created_at,
      created_at: row.created_at,
      state: row.state,
      submitted_at: row.submitted_at,
      comments: comments(id),
      items,
    }
  }
  function result(id: string) {
    const review = get(id)
    return {
      state: review.state,
      result:
        review.state === 'done'
          ? {
              review_id: id,
              submitted_at: review.submitted_at,
              answers: review.items
                .filter((i) => i.value !== undefined)
                .map((i) => ({
                  item_id: i.id,
                  status: i.status,
                  value: i.value,
                })),
              comments: review.comments,
              skipped: review.items
                .filter((i) => i.value === undefined)
                .map((i) => i.id),
            }
          : null,
    }
  }
  function current(id, key) {
    const review = get(id)
    if (review.state !== 'open') throw Error('review_closed')
    const item = review.items.find((i) => i.id === key)
    if (!item) throw Error('not_found: item_id')
    return item
  }
  function addComment(id, key, input, author = 'user', previous = null) {
    const item = current(id, key)
    const c = commentInput.parse(input)
    if (item.kind === 'html' && c.anchor.type !== 'item')
      throw Error('invalid_items: HTML requires an item anchor')
    const parent =
      c.parent_id &&
      db
        .prepare('SELECT anchor_json FROM comment WHERE item_id=? AND id=?')
        .get(key, c.parent_id)
    if (c.parent_id && !parent) throw Error('not_found: parent_id')
    if (item.kind === 'pr_review') {
      if (parent) c.anchor = JSON.parse(String(parent.anchor_json))
      else if (c.anchor.type !== 'item') {
        if (
          (c.anchor.ledger_id && c.anchor.ledger_id !== item.report.ledgerId) ||
          (c.anchor.type === 'node' && !prLocation(item.report, c.anchor.path))
        )
          throw Error(
            'invalid_items: choose evidence from the current PR report',
          )
        if (c.anchor.type === 'text') {
          const offset = prQuoteOffset(item.report, c.anchor)
          if (offset < 0)
            throw Error(
              'invalid_items: choose a passage from the current PR report',
            )
          c.anchor.start = offset
        }
        c.anchor.ledger_id = item.report.ledgerId
      }
    }
    db.prepare('INSERT INTO comment VALUES(?,?,?,?,?,?,?,?)').run(
      randomUUID(),
      key,
      c.parent_id ?? null,
      author,
      JSON.stringify(c.anchor),
      c.body,
      new Date().toISOString(),
      previous,
    )
  }
  function save(id, key, answer) {
    const item = current(id, key)
    if (answer === null) {
      db.prepare(
        "UPDATE item SET status='asked',skipped=1,value_json=NULL WHERE id=?",
      ).run(key)
      return
    }
    let value,
      status = 'confirmed'
    if (item.kind === 'decision') {
      const recommended = item.options.find((o) => o.recommended)
      const custom = 'other' in answer
      if (
        custom
          ? item.allow_other === false || !answer.other.trim()
          : !item.options.some((o) => o.id === answer.option)
      )
        throw Error('invalid_items: answer')
      value = custom ? answer.other : answer.option
      if (recommended && (custom || recommended.id !== value))
        status = 'corrected'
    } else if (item.kind === 'dbml' && answer.format === 'unified_diff') {
      const edited = dbmlText(item, answer)
      value = dbmlPatch(item, edited)
      if (value.patch !== answer.patch)
        throw Error('Invalid DBML patch for this revision')
      if (value.patch) status = 'corrected'
    } else if (item.kind === 'code' || item.kind === 'dbml') {
      if (typeof answer.code !== 'string' || answer.code.length > 100000)
        throw Error('invalid_items: code')
      value = answer.code
      if (value !== (item.kind === 'dbml' ? item.source_text : item.code))
        status = 'corrected'
    } else if (Object.hasOwn(payloads, item.kind)) {
      value = answer.values
      if (!value || !catalogAnswer(item, value))
        throw Error('invalid_items: values')
    } else if (item.kind === 'html') {
      throw Error('invalid_items: use the item form')
    } else {
      value = answer.values
      const entries = item.kind === 'claim' ? item.claims : item.defaults
      if (
        !value ||
        entries.some((e) => !value[e.id]) ||
        Object.keys(value).length !== entries.length
      )
        throw Error('invalid_items: values')
      if (
        item.kind === 'claim' &&
        Object.values(value).some(
          (v) => !['verified', 'wrong', 'research'].includes(String(v)),
        )
      )
        throw Error('invalid_items: claim state')
      if (
        item.kind === 'defaults' &&
        entries.some((e) => value[e.id] !== e.value)
      )
        status = 'corrected'
    }
    db.prepare(
      "UPDATE item SET skipped=0,value_json=?,status=?,source_by='user',source_basis='stated' WHERE id=?",
    ).run(JSON.stringify(value), status, key)
  }
  function acceptHtml(id, key, revision, value) {
    const item = current(id, key)
    if (item.kind !== 'html' || item.revision !== revision)
      throw Error('invalid_items: revision')
    db.prepare(
      "UPDATE item SET skipped=0,value_json=?,status='confirmed',source_by='user',source_basis='stated' WHERE id=?",
    ).run(JSON.stringify(value), key)
  }
  return {
    waitForChange,
    recentOpenReviews(limit: number, now: string) {
      return db
        .prepare(
          `
        SELECT r.id, r.title, r.state, r.mode,
               coalesce(r.last_activity, r.created_at) AS updated_at,
               (SELECT count(*) FROM item i WHERE i.review_id=r.id) AS item_count
          FROM review r
         WHERE r.state='open' AND (r.expires_at IS NULL OR r.expires_at>?)
         ORDER BY updated_at DESC, r.id ASC LIMIT ?
      `,
        )
        .all(now, limit)
        .map((row) => ({
          ...row,
          id: String(row.id),
          updated_at: String(row.updated_at),
        }))
    },
    reviewerComments: (id: string, after: number) => comments(id, after, true),
    version: (id: string) => Number(rowFor(id).version),
    has: (id: string) =>
      Boolean(db.prepare('SELECT 1 FROM review WHERE id=?').get(id)),
    state: (id: string) => rowFor(id).state,
    cancel(id: string) {
      if (rowFor(id).state !== 'open') throw Error('review_closed')
      db.prepare(
        "UPDATE review SET state='cancelled',last_activity=? WHERE id=?",
      ).run(new Date().toISOString(), id)
      announce(id)
      return get(id)
    },
    query: log.query,
    flush: log.flush,
    get,
    result,
    save(id, key, answer) {
      save(id, key, answer)
      announce(id)
    },
    acceptHtml(id, key, revision, value) {
      acceptHtml(id, key, revision, value)
      announce(id)
    },
    addComment(id, key, input) {
      addComment(id, key, input)
      announce(id)
    },
    reply(id, key, parent, body) {
      const thread = comments(id).find(
        (c) => c.item_id === key && c.id === parent,
      )
      if (!thread) throw Error('not_found: parent_id')
      addComment(
        id,
        key,
        { body, anchor: thread.anchor, parent_id: parent },
        'agent',
      )
      announce(id)
      return { parent_id: parent, item_id: key }
    },
    update(id, key, patch, reply, parent) {
      const updated = atomic(() => {
        const old = current(id, key)
        const body = db
          .prepare('SELECT body_json FROM item WHERE id=?')
          .get(key).body_json
        const parsed = itemSchema.safeParse({
          ...JSON.parse(String(body)),
          ...patch,
          kind: old.kind,
        })
        if (!parsed.success)
          throw Error('invalid_items: patch ' + parsed.error.message)
        const revised = parsed.data
        const thread = parent
          ? comments(id).find((c) => c.item_id === key && c.id === parent)
          : comments(id)
              .filter((c) => c.item_id === key)
              .at(-1)
        if (parent && !thread) throw Error('not_found: parent_id')
        addComment(
          id,
          key,
          {
            body: reply,
            anchor: thread?.anchor ?? { type: 'item' },
            parent_id: thread?.id,
          },
          'agent',
          body,
        )
        db.prepare(
          "UPDATE item SET title=?,body_json=?,revision=revision+1,skipped=0,value_json=NULL,status='asked',source_by='agent' WHERE id=?",
        ).run(revised.title, JSON.stringify(revised), key)
        return current(id, key)
      })
      announce(id)
      return updated
    },
    close: () => {
      for (const id of listeners.keys()) announce(id)
      db.close()
    },
    open(title: string, items: ItemInput[], mode: string, ttl?: number) {
      return atomic(() => {
        db.prepare(
          "UPDATE review SET state='expired' WHERE state='open' AND expires_at<=?",
        ).run(new Date().toISOString())
        if (
          Number(
            db
              .prepare("SELECT count(*) AS n FROM review WHERE state='open'")
              .get().n,
          ) >= 100
        )
          throw Error('quota: finish an open review')
        const id = randomUUID(),
          now = Date.now()
        db.prepare(
          "INSERT INTO review(id,title,mode,state,created_at,expires_at,submitted_at) VALUES(?,?,?,'open',?,?,NULL)",
        ).run(
          id,
          title,
          mode,
          new Date(now).toISOString(),
          ttl ? new Date(now + ttl * 3600000).toISOString() : null,
        )
        const insert = db.prepare(
          'INSERT INTO item(id,review_id,kind,title,body_json,status,source_by,source_basis) VALUES(?,?,?,?,?,?,?,?)',
        )
        return {
          review_id: id,
          item_ids: items.map((item) => {
            const key = randomUUID()
            insert.run(
              key,
              id,
              item.kind,
              item.title,
              JSON.stringify(item),
              ('status' in item ? item.status : null) ?? 'asked',
              item.source?.by ?? 'agent',
              item.source?.basis ?? null,
            )
            for (const e of item.evidence ?? [])
              db.prepare('INSERT INTO evidence VALUES(?,?,?,?)').run(
                randomUUID(),
                key,
                e.label,
                e.url ?? null,
              )
            return key
          }),
        }
      })
    },
    submit(
      id: string,
      answers: Record<
        string,
        | { option: string }
        | { other: string }
        | { code: string }
        | DbmlPatch
        | { values: Record<string, string> }
      >,
    ) {
      const submitted = atomic(() => {
        const review = get(id)
        if (review.state !== 'open') throw Error('review_closed')
        for (const [key, answer] of Object.entries(answers))
          save(id, key, answer)
        // Older browsers saved DBML drafts as text. Finalize those drafts
        // against their original revision when the review first closes.
        for (const item of review.items) {
          if (item.kind !== 'dbml') continue
          const incoming = answers[item.id]
          const text = incoming
            ? 'code' in incoming
              ? incoming.code
              : null
            : item.value
          if (typeof text === 'string') {
            db.prepare('UPDATE item SET value_json=? WHERE id=?').run(
              JSON.stringify(dbmlPatch(item, text)),
              item.id,
            )
          }
        }
        db.prepare(
          "UPDATE review SET state='done',submitted_at=? WHERE id=?",
        ).run(new Date().toISOString(), id)
        log.record(get(id))
        return result(id)
      })
      announce(id)
      return submitted
    },
  }
}

export type ReviewStore = ReturnType<typeof openStore>
