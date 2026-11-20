import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from './components/ui/card'
import { Icon, itemIcon } from './components/icon'
import { Input } from './components/ui/input'
import { Discussion } from './discussion'
import { flatten } from '../../core/src/catalog'
import { dbmlText } from '../../core/src/dbml-patch'
import { Button } from './components/ui/button'
import { Catalog, CodeEditor } from './catalog'
import { HtmlFrame } from './frame'
import { AnnotationMode } from './annotation-tool'
import React, { useState } from 'react'
const SchemaReview = React.lazy(() => import('./schema-review'))
export function Item({ item: i, review, post, stage, visit }) {
  const annotating = React.useContext(AnnotationMode)
  const [sourceRequest, setSourceRequest] = useState(null)
  const [draft, localDraft] = useState(null),
    [anchor, setAnchor] = useState<{
      type: string
      exact?: string
      path?: string
      prefix?: string
      suffix?: string
    }>(
      i.kind === 'plan'
        ? { type: 'node', path: 'node:' + i.nodes[0].id }
        : { type: 'item' },
    ),
    [pending, setPending] = useState(false)
  React.useLayoutEffect(() => {
    if (!visit) return
    setAnchor({ ...visit.anchor })
    let target: HTMLElement
    let observer: MutationObserver
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById('item-' + i.id)
      if (!section) return
      function reveal() {
        target = visit.thread
          ? document.getElementById('thread-' + visit.thread)
          : ([
              ...section.querySelectorAll<HTMLElement>('[data-guide-path]'),
            ].find((el) => el.dataset.guidePath === visit.anchor.path) ??
            (visit.anchor.type === 'item' ? section : null))
        if (!target) return false
        if (target instanceof HTMLDetailsElement) target.open = true
        if (!visit.thread && target !== section)
          target.dataset.guideCurrent = 'true'
        target.scrollIntoView({ block: 'nearest' })
        if (visit.thread) target.focus({ preventScroll: true })
        return true
      }
      if (!reveal()) {
        section.scrollIntoView({ block: 'nearest' })
        // The selected panel may load lazily or expose the target after switching variants.
        observer = new MutationObserver(() => {
          if (reveal()) observer.disconnect()
        })
        observer.observe(section, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-guide-path'],
        })
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      if (target) delete target.dataset.guideCurrent
    }
  }, [visit, i.id])
  React.useEffect(() => {
    if (!sourceRequest || sourceRequest !== anchor || i.kind !== 'pr_review')
      return
    const section = document.getElementById('item-' + i.id)
    if (!section) return
    const path = CSS.escape(
      sourceRequest.path ?? sourceRequest.section_id ?? '',
    )
    const selector =
      '[data-pr-anchor="' +
      path +
      '"], [data-pr-location="' +
      path +
      '"], [data-guide-path="' +
      path +
      '"]'
    function reveal() {
      const stale = section.querySelector<HTMLElement>('[data-pr-stale]')
      const location = section.querySelector<HTMLElement>(selector)
      const target =
        stale ??
        (sourceRequest.type === 'text'
          ? location?.querySelector<HTMLElement>('mark[data-current="true"]')
          : location)
      if (!target?.getClientRects().length) return false
      if (target.tabIndex < 0) target.tabIndex = -1
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return true
    }
    // Restoring a location can change the report tab, open a disclosure or page the diff.
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect()
    })
    const frame = requestAnimationFrame(() => {
      if (!reveal())
        observer.observe(section, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            'data-pr-anchor',
            'data-current',
            'open',
            'data-pr-stale',
            'data-pr-location',
          ],
        })
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [anchor, sourceRequest, i.id, i.kind])
  function setDraft(v) {
    localDraft(v)
    stage(i.id, i.revision, v)
  }
  const threads = review.comments.filter((c) => c.item_id === i.id)
  const saved =
    i.value === undefined
      ? null
      : i.kind === 'decision'
        ? i.options.some((o) => o.id === i.value)
          ? { option: i.value }
          : { other: i.value }
        : i.kind === 'dbml'
          ? {
              dbmlEdit:
                typeof i.value === 'string' ? i.value : dbmlText(i, i.value),
            }
          : i.kind === 'code'
            ? { code: i.value }
            : { values: i.value }
  const answer =
    draft ??
    saved ??
    (i.kind === 'ranking'
      ? {
          values: Object.fromEntries(
            i.entries.map((e, n) => [e.id, String(n + 1)]),
          ),
        }
      : i.kind === 'range'
        ? {
            values: Object.fromEntries(
              i.scales.map((s) => [s.id, String(s.initial)]),
            ),
          }
        : i.kind === 'plan'
          ? {
              values: Object.fromEntries(
                flatten(i.nodes).map((n) => [n.id, 'proposed']),
              ),
            }
          : i.kind === 'dbml'
            ? { dbmlEdit: i.source_text }
            : i.kind === 'code'
              ? { code: i.code }
              : i.kind === 'scope_board'
                ? {
                    values: Object.fromEntries(
                      i.cards.map((c) => [c.id, c.column]),
                    ),
                  }
                : null)
  async function send(action, value) {
    setPending(true)
    try {
      if (await post(i.id, action, value)) {
        if (action === 'answer') setDraft(null)
        return true
      }
    } finally {
      setPending(false)
    }
  }
  function pickAnchor(next, { focusComposer = true } = {}) {
    setAnchor(next)
    if (
      open &&
      focusComposer &&
      (annotating || i.kind === 'pr_review') &&
      next.type !== 'item'
    )
      requestAnimationFrame(() =>
        document.getElementById('comment-' + i.id)?.focus(),
      )
  }
  function selection(event) {
    if (
      (event.target as Element).closest(
        'input, textarea, select, [contenteditable="true"]',
      )
    )
      return
    const sel = window.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) return
    const range = sel.getRangeAt(0),
      container = event.currentTarget
    if (!container.contains(range.commonAncestorContainer)) return
    const before = range.cloneRange(),
      after = range.cloneRange()
    before.selectNodeContents(container)
    before.setEnd(range.startContainer, range.startOffset)
    after.selectNodeContents(container)
    after.setStart(range.endContainer, range.endOffset)
    pickAnchor({
      type: 'text',
      exact: range.toString(),
      prefix: before.toString().slice(-48),
      suffix: after.toString().slice(0, 48),
    })
  }
  const open = review.state === 'open'
  const titleInReviewHeading =
    review.items.length === 1 && i.title === review.title
  function rowValue(key, value) {
    setDraft({ values: { ...answer?.values, [key]: value } })
  }
  return (
    <section
      id={'item-' + i.id}
      className={'review-item kind-' + i.kind}
      data-annotating={annotating || undefined}
    >
      <fieldset
        disabled={
          pending ||
          (!open &&
            ![
              'plan',
              'code',
              'diff',
              'diagram',
              'proposal',
              'dbml',
              'lottie',
              'pr_review',
            ].includes(i.kind))
        }
      >
        <legend className="sr-only">{i.title}</legend>
        <div className="item-grid">
          <Card className="question-card">
            <CardHeader data-compact={titleInReviewHeading}>
              <div className="item-meta">
                <a
                  className="kind-chip"
                  href={'/docs/interfaces/' + i.kind + '/'}
                >
                  <Icon name={itemIcon(i.kind)} />
                  {i.kind === 'dbml'
                    ? 'DBML'
                    : i.kind === 'pr_review'
                      ? 'PR review'
                      : i.kind.replaceAll('_', ' ')}
                </a>
                <span
                  className="item-state"
                  data-state={i.skipped ? 'skipped' : i.status}
                >
                  {i.skipped
                    ? 'Skipped'
                    : i.status === 'asked'
                      ? 'Needs answer'
                      : i.status}
                </span>
              </div>
              <CardTitle
                className={titleInReviewHeading ? 'sr-only' : undefined}
              >
                <h2>{i.title}</h2>
              </CardTitle>
              <div className="source">
                <Icon name="cpu" />
                {i.source?.by === 'user' ? 'Reviewer' : 'Coding agent'}{' '}
                <span>·</span> {i.source?.basis ?? 'unverified'}
              </div>
            </CardHeader>
            <CardContent>
              <div
                onMouseUp={
                  [
                    'html',
                    'proposal',
                    'pr_review',
                    'ranking',
                    'range',
                    'lottie',
                    'dbml',
                    'diagram',
                  ].includes(i.kind)
                    ? undefined
                    : selection
                }
              >
                {i.kind === 'decision' && (
                  <>
                    {i.options.map((o) => (
                      <div
                        className="option"
                        data-guide-path={'option:' + o.id}
                        key={o.id}
                        onClickCapture={(event) => {
                          if (!annotating) return
                          event.preventDefault()
                          event.stopPropagation()
                          if (window.getSelection()?.isCollapsed)
                            pickAnchor({ type: 'node', path: 'option:' + o.id })
                        }}
                      >
                        <label>
                          <input
                            type="radio"
                            name={i.id}
                            checked={
                              (answer?.option ??
                                (!answer && i.status === 'defaulted'
                                  ? i.default
                                  : undefined)) === o.id
                            }
                            onChange={() => {
                              setDraft({ option: o.id })
                              send('answer', { option: o.id })
                            }}
                          />{' '}
                          {o.label}
                          {o.recommended && (
                            <span className="recommended">
                              <Icon name="spark" size={12} />
                              Recommended
                            </span>
                          )}
                          <small>{o.tradeoffs}</small>
                        </label>
                        {open && (
                          <button
                            className="annotation"
                            title={'Comment on ' + o.label}
                            aria-label={'Comment on ' + o.label}
                            onClick={() =>
                              pickAnchor({
                                type: 'node',
                                path: 'option:' + o.id,
                              })
                            }
                          >
                            <Icon name="chat" size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    {i.allow_other !== false && (open || answer?.other) && (
                      <label data-guide-path="other">
                        Other{' '}
                        <Input
                          placeholder="Write another answer"
                          value={answer?.other ?? ''}
                          onChange={(e) => setDraft({ other: e.target.value })}
                        />
                      </label>
                    )}
                  </>
                )}
                {i.kind === 'dbml' && (
                  <React.Suspense fallback={<p>Opening schema…</p>}>
                    <SchemaReview
                      guideVisit={visit}
                      item={i}
                      source={answer.dbmlEdit ?? answer.code}
                      change={(dbmlEdit) => setDraft({ dbmlEdit })}
                      open={open}
                      anchor={pickAnchor}
                      selection={anchor}
                    />
                  </React.Suspense>
                )}
                {i.kind === 'code' && (
                  <React.Suspense fallback={<pre>{answer.code}</pre>}>
                    <CodeEditor
                      filename={i.filename}
                      language={i.language}
                      value={answer.code}
                      readOnly={!open || pending}
                      change={(code) => setDraft({ code })}
                    />
                  </React.Suspense>
                )}
                <Catalog
                  open={open}
                  selection={anchor}
                  threads={threads}
                  item={i}
                  values={answer?.values ?? {}}
                  change={(values) => setDraft({ values })}
                  anchor={pickAnchor}
                />
                {i.kind === 'html' &&
                  (open ? (
                    <HtmlFrame review={review.id} item={i.id} />
                  ) : (
                    <pre>{JSON.stringify(i.value, null, 2)}</pre>
                  ))}
                {i.kind === 'claim' &&
                  i.claims.map((c) => (
                    <label
                      key={c.id}
                      className="select-field"
                      data-guide-path={'claim:' + c.id}
                    >
                      <span>
                        {c.label} {c.evidence}
                      </span>
                      <NativeSelect
                        value={answer?.values?.[c.id] ?? ''}
                        onChange={(e) => rowValue(c.id, e.target.value)}
                      >
                        <NativeSelectOption value="">
                          Choose state
                        </NativeSelectOption>
                        {['verified', 'wrong', 'research'].map((s) => (
                          <NativeSelectOption key={s}>{s}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                  ))}
                {i.kind === 'defaults' &&
                  i.defaults.map((d) => (
                    <label key={d.id} data-guide-path={'default:' + d.id}>
                      {d.label}
                      <input
                        placeholder={d.value}
                        value={answer?.values?.[d.id] ?? d.value}
                        onChange={(e) =>
                          setDraft({
                            values: {
                              ...Object.fromEntries(
                                i.defaults.map((e) => [e.id, e.value]),
                              ),
                              ...answer?.values,
                              [d.id]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
              </div>
              {i.evidence?.map((e, n) => (
                <p key={n}>{e.url ? <a href={e.url}>{e.label}</a> : e.label}</p>
              ))}
            </CardContent>
            {open && i.kind !== 'html' && (
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    send(
                      'answer',
                      answer ??
                        (i.kind === 'defaults'
                          ? {
                              values: Object.fromEntries(
                                i.defaults.map((e) => [e.id, e.value]),
                              ),
                            }
                          : i.default
                            ? { option: i.default }
                            : null),
                    )
                  }
                >
                  {i.kind === 'dbml' ? 'Save patch' : 'Save answer'}
                </Button>
                <Button variant="ghost" onClick={() => send('answer', null)}>
                  Skip item
                </Button>
              </CardFooter>
            )}
          </Card>
          <Discussion
            item={i}
            anchor={anchor}
            setAnchor={(location) => {
              setAnchor({ ...location })
            }}
            showSource={(location) => {
              const next = { ...location }
              setAnchor(next)
              setSourceRequest(next)
            }}
            comments={threads}
            open={open}
            send={send}
          />
        </div>
      </fieldset>
    </section>
  )
}
