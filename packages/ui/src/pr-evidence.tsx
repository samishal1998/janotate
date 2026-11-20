import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  numberedLines,
  prLineRange,
  prLinePath,
  type DiffSide,
  type PrHunk,
  type PrLineRange,
  type PrReport,
} from '../../core/src/pr-review'
import { AnnotationMode } from './annotation-tool'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'
import { diffTokens, type DiffToken } from './diff-syntax'

export type Evidence = {
  id: string
  side?: DiffSide
  first?: number
  last?: number
}
type Thread = {
  id: string
  parent_id?: string | null
  body: string
  anchor: { type: string; path?: string; ledger_id?: string }
}
const pageSize = 48
const languages: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  css: 'css',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
}

function tokenSpans(tokens: DiffToken[]): React.ReactNode[] {
  return tokens.map((t, i) =>
    t.type === 'text' ? (
      t.value
    ) : (
      <span className={t.className} key={i}>
        {tokenSpans(t.children)}
      </span>
    ),
  )
}
const CodeLine = React.memo(function CodeLine({
  text,
  language,
}: {
  text: string
  language: string
}) {
  return (
    <code>
      <span className="pr-line-sign">{text[0]}</span>
      {tokenSpans(diffTokens(text.slice(1), language))}
    </code>
  )
})
const plural = (n: number, word: string) =>
  n + ' ' + word + (n === 1 ? '' : 's')
const covers = (
  range: PrLineRange,
  row: { old: number | null; new: number | null },
) =>
  row[range.side] !== null &&
  row[range.side] >= range.first &&
  row[range.side] <= range.last
const rangeLabel = (range: PrLineRange) =>
  range.side +
  ' ' +
  (range.first === range.last
    ? 'line ' + range.first
    : 'lines ' + range.first + '–' + range.last)

export function EvidenceView({
  hunk,
  file,
  evidence,
  requested,
  open,
  annotate,
  selected,
  threads,
  ledgerId,
  visitThread,
}: {
  hunk: PrHunk
  file: PrReport['files'][number]
  evidence: Evidence
  requested: Evidence | null
  open: boolean
  annotate: (path: string) => void
  selected?: string
  threads: Thread[]
  ledgerId: string
  visitThread: (thread: Thread) => void
}) {
  const annotating = useContext(AnnotationMode)
  const language = languages[file.path.split('.').at(-1)?.toLowerCase()] ?? ''
  const rows = useMemo(() => numberedLines(hunk), [hunk])
  const target = rows.findIndex(
    (row) => evidence.side && row[evidence.side] === evidence.first,
  )
  const desiredPage = Math.floor(Math.max(0, target) / pageSize)
  const [page, setPage] = useState(desiredPage)
  useEffect(
    () => setPage(desiredPage),
    [desiredPage, evidence.side, evidence.first, evidence.last, requested],
  )
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages - 1)
  // 'start' is waiting for the first end. A line object is waiting for the second.
  const [pending, setPending] = useState<
    'start' | { side: DiffSide; line: number } | null
  >(null)
  const [error, setError] = useState('')
  const cancelButton = useRef<HTMLButtonElement>(null)
  const selectedRange = prLineRange(selected ?? '')
  const active = selectedRange?.id === hunk.id ? selectedRange : null
  const hunkPath = 'pr:hunk:' + hunk.id
  const markers = useMemo(
    () =>
      threads
        .filter(
          (t) =>
            !t.parent_id &&
            t.anchor.type === 'node' &&
            (!t.anchor.ledger_id || t.anchor.ledger_id === ledgerId),
        )
        .map((thread) => ({
          thread,
          range: prLineRange(thread.anchor.path ?? ''),
        }))
        .filter(
          (m) => m.range?.id === hunk.id || m.thread.anchor.path === hunkPath,
        ),
    [threads, ledgerId, hunk.id, hunkPath],
  )
  const onHunk = markers.filter((m) => !m.range)
  useEffect(() => {
    setPending(null)
    setError('')
  }, [selected, open])
  function pick(side: DiffSide, line: number, shift: boolean) {
    if (!open) return
    if (pending === 'start') {
      setPending({ side, line })
      setError('')
      return
    }
    const start =
      pending ||
      (shift && active ? { side: active.side, line: active.first } : null)
    if (start && start.side !== side) {
      setError('Choose a ' + start.side + ' line to finish this range.')
      return
    }
    setPending(null)
    setError('')
    annotate(
      prLinePath({
        id: hunk.id,
        side,
        first: Math.min(line, start?.line ?? line),
        last: Math.max(line, start?.line ?? line),
      }),
    )
  }
  function gutter(side: DiffSide, line: number | null) {
    if (line === null) return <span aria-hidden="true" />
    const path = prLinePath({ id: hunk.id, side, first: line, last: line })
    const pressed =
      active?.side === side && line >= active.first && line <= active.last
    const starting =
      pending &&
      pending !== 'start' &&
      pending.side === side &&
      pending.line === line
    return open ? (
      <button
        type="button"
        data-annotation-target
        data-pr-anchor={path}
        aria-pressed={!!pressed || !!starting}
        aria-label={'Comment on ' + side + ' line ' + line}
        onClick={(e) => pick(side, line, e.shiftKey)}
      >
        {line}
      </button>
    ) : (
      <span tabIndex={-1} data-pr-anchor={path}>
        {line}
      </span>
    )
  }
  function threadMarker({ thread, range }: (typeof markers)[number]) {
    const label =
      'Open discussion on ' + (range ? rangeLabel(range) : 'this hunk')
    return (
      <button
        type="button"
        key={thread.id}
        className="pr-thread-marker"
        aria-label={label}
        title={thread.body}
        onClick={() => visitThread(thread)}
      >
        <Icon name="chat" size={13} />
      </button>
    )
  }
  const rangeHelp =
    error ||
    (pending === 'start'
      ? 'Choose the first line number.'
      : pending
        ? 'Choose the last line on the ' +
          pending.side +
          ' side. Range starts at ' +
          pending.line +
          '.'
        : '')
  return (
    <section
      className="pr-evidence"
      aria-label="Diff evidence"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pending) {
          e.preventDefault()
          e.stopPropagation()
          setPending(null)
          setError('')
          cancelButton.current?.focus()
        }
      }}
    >
      <header>
        <div tabIndex={-1} data-pr-anchor={hunkPath}>
          <Icon name="code" />
          <strong>{file.path}</strong>
          <span>{hunk.id}</span>
          {onHunk.map(threadMarker)}
        </div>
        {open && (
          <div>
            {rows.length > 0 && (
              <Button
                ref={cancelButton}
                variant={pending ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={pending !== null}
                onClick={() => {
                  setPending(pending ? null : 'start')
                  setError('')
                }}
              >
                {pending ? 'Cancel range' : 'Select lines'}
              </Button>
            )}
            <Button
              data-annotation-target
              variant="ghost"
              size="sm"
              onClick={() => annotate(hunkPath)}
            >
              <Icon name="chat" />
              Discuss hunk
            </Button>
          </div>
        )}
      </header>
      {rangeHelp && (
        <p className="pr-range-hint" role="status">
          {rangeHelp}
        </p>
      )}
      {hunk.header && <code className="pr-hunk-header">{hunk.header}</code>}
      {!rows.length ? (
        <p className="pr-hunk-note">
          {hunk.note || 'File-level change'}{' '}
          <strong>{hunk.kind.replaceAll('_', ' ')}</strong>
        </p>
      ) : (
        <div
          className="pr-diff-scroll"
          tabIndex={0}
          aria-label={'Diff for ' + file.path}
        >
          <div className="pr-diff-lines">
            <div className="pr-column-head" aria-hidden="true">
              <span />
              <span>Old</span>
              <span>New</span>
            </div>
            {rows
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((row, n) => {
                const matched =
                  evidence.side &&
                  row[evidence.side] !== null &&
                  row[evidence.side] >= evidence.first &&
                  row[evidence.side] <= evidence.last
                const saved = markers.filter(
                  (m) => m.range && covers(m.range, row),
                )
                const chosen = active && covers(active, row)
                const preferredSide =
                  pending && pending !== 'start' ? pending.side : active?.side
                const side =
                  preferredSide && row[preferredSide] !== null
                    ? preferredSide
                    : row.new !== null
                      ? 'new'
                      : 'old'
                const line = row[side],
                  path =
                    active &&
                    active.first !== active.last &&
                    row[active.side] === active.first
                      ? selected
                      : undefined
                return (
                  <div
                    key={current * pageSize + n}
                    className="pr-diff-row"
                    data-kind={{ '+': 'added', '-': 'removed' }[row.text[0]]}
                    data-match={matched || undefined}
                    data-threaded={saved.length || undefined}
                    data-pr-selected={chosen || undefined}
                    data-pr-anchor={path}
                    tabIndex={path ? -1 : undefined}
                  >
                    <span className="pr-row-threads">
                      {saved
                        .filter((m) => row[m.range.side] === m.range.first)
                        .map(threadMarker)}
                    </span>
                    {gutter('old', row.old)}
                    {gutter('new', row.new)}
                    {open && (annotating || pending) && line !== null ? (
                      <button
                        type="button"
                        data-annotation-target
                        className="pr-code-action"
                        aria-label={
                          'Annotate code on ' + side + ' line ' + line
                        }
                        onClick={(e) => pick(side, line, e.shiftKey)}
                      >
                        <CodeLine text={row.text} language={language} />
                      </button>
                    ) : (
                      <CodeLine text={row.text} language={language} />
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
      {pages > 1 && (
        <div className="pr-pagination">
          <Button
            size="sm"
            variant="outline"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            Previous lines
          </Button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            Next lines
          </Button>
        </div>
      )}
      {(hunk.truncated || hunk.redacted > 0) && (
        <p className="pr-hunk-note">
          {hunk.truncated &&
            plural(hunk.omittedLines, 'line') +
              ' omitted from the supplied report. '}
          {hunk.redacted > 0 && plural(hunk.redacted, 'line') + ' redacted.'}
        </p>
      )}
    </section>
  )
}
