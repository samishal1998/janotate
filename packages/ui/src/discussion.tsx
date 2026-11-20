import React, { useEffect, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card'
import { Button } from './components/ui/button'
import { Textarea } from './components/ui/textarea'
import { Icon } from './components/icon'
import { flatten, graph } from '../../core/src/catalog'
import { prLocation } from '../../core/src/pr-review'
import { prQuoteOffset } from '../../core/src/pr-passage'
import './discussion.css'
function location(item, a) {
  if (a.type === 'item')
    return item.kind === 'pr_review' ? 'Whole PR' : 'Whole item'
  if (a.type === 'text') {
    const quote = '“' + a.exact + '”'
    if (item.kind !== 'pr_review') return quote
    if (a.ledger_id && a.ledger_id !== item.report.ledgerId)
      return 'Earlier diff · ' + quote
    const place = a.section_id && prLocation(item.report, a.section_id)
    return place ? place + ' · ' + quote : quote
  }
  const path = a.path ?? ''
  if (item.kind === 'pr_review')
    return a.ledger_id && a.ledger_id !== item.report.ledgerId
      ? 'Earlier diff · ' + path
      : (prLocation(item.report, path) ?? path)
  if (item.kind === 'lottie')
    return path
      .replace(/^frame:(\d+)$/, 'Frame $1')
      .replace(/^frames:(\d+)-(\d+)$/, 'Frames $1–$2')
  if (item.kind === 'dbml') return path.replace(/^(field|table|ref):/, '')
  if (item.kind === 'diagram') {
    const variant = item.variants?.find((v) =>
      path.startsWith('variant:' + encodeURIComponent(v.id) + '/'),
    )
    const target = variant ? path.slice(path.indexOf('/') + 1) : path
    const version = variant ?? item
    const prefix =
      variant?.label ?? (item.variants?.length ? item.base_label : '')
    const step = /^walkthrough:(\d+)$/.exec(target)
    let label = step && version.walkthrough?.[Number(step[1])]?.label
    if (!label && /^(node|edge):/.test(target)) {
      const names = new Map(graph(version.spec).nodes)
      label = target
        .slice(target.indexOf(':') + 1)
        .split('->')
        .map((id) => names.get(id) ?? id)
        .join(' → ')
    }
    if (label) return prefix ? prefix + ' · ' + label : label
  }
  if (item.kind === 'proposal')
    return item.sections.find((s) => 'section:' + s.id === path)?.label ?? path
  if (item.kind === 'plan')
    return (
      flatten(item.nodes).find((n) => 'node:' + n.id === path)?.label ?? path
    )
  if (item.kind === 'decision')
    return item.options.find((o) => 'option:' + o.id === path)?.label ?? path
  return path
    .replace(/^variant:([^/]+)\//, '$1 · ')
    .replace(/(node|edge|block|hunk):/g, '$1 ')
    .replace(/->/g, ' → ')
}
export { location as threadLocation }
export function groupThreads(comments) {
  const roots = new Map<string, any[]>()
  const parents = new Map<string, string>()
  for (const comment of comments) {
    const root = parents.get(comment.parent_id) ?? comment.id
    parents.set(comment.id, root)
    if (!roots.has(root)) roots.set(root, [])
    roots.get(root).push(comment)
  }
  return [...roots.values()]
}
function anchorKey(a) {
  if (a.type === 'item') return 'item'
  if (a.type === 'node') return JSON.stringify([a.type, a.ledger_id, a.path])
  return JSON.stringify([
    a.type,
    a.ledger_id,
    a.section_id,
    a.start,
    a.exact,
    a.prefix,
    a.suffix,
  ])
}

export function Discussion({
  item,
  anchor,
  setAnchor,
  showSource,
  comments,
  open,
  send,
}) {
  const [reply, setReply] = useState(null),
    [drafts, setDrafts] = useState({}),
    [scope, setScope] = useState(item.kind === 'pr_review' ? 'all' : 'stage')
  const latest = comments.at(-1)?.id
  const previous = useRef(latest)
  useEffect(() => {
    const arrived = latest && latest !== previous.current
    previous.current = latest
    if (
      !arrived ||
      !matchMedia('(prefers-reduced-motion: no-preference)').matches
    )
      return
    const message = document.getElementById('thread-' + latest)
    const reveal = message?.animate(
      [
        { opacity: 0.55, transform: 'translateY(3px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 185, easing: 'ease-out' },
    )
    return () => reveal?.cancel()
  }, [latest])
  const target = anchorKey(anchor)
  const parent = reply?.target === target ? reply.comment : null
  const key = parent?.id ?? target,
    body = drafts[key] ?? ''
  function edit(s) {
    setDrafts((old) => ({ ...old, [key]: s }))
  }
  const pr = item.kind === 'pr_review'
  const earlier =
    pr && anchor.ledger_id && anchor.ledger_id !== item.report.ledgerId
  const unavailable = React.useMemo(() => {
    if (!pr || anchor.type === 'item') return false
    if (earlier) return true
    return anchor.type === 'text'
      ? prQuoteOffset(item.report, anchor) < 0
      : !prLocation(item.report, anchor.path)
  }, [pr, earlier, anchor, item.report])
  const canSend = body.trim().length > 0 && (!unavailable || !!parent)
  async function submit() {
    if (!canSend) return
    if (await send('comments', { body, anchor, parent_id: parent?.id })) {
      edit('')
      setReply(null)
    }
  }
  const scoped = item.kind === 'plan' && anchor.type === 'node'
  const prLocationSelected = pr && anchor.type !== 'item'
  const allGroups = groupThreads(comments)
  const atLocation = allGroups.filter((group) =>
    scoped
      ? group.some((comment) => comment.anchor.path === anchor.path)
      : anchorKey(group[0].anchor) === target,
  )
  const groups =
    scope !== 'all' && (scoped || prLocationSelected) ? atLocation : allGroups
  function respond(c) {
    setAnchor(c.anchor)
    setReply({ target: anchorKey(c.anchor), comment: c })
    requestAnimationFrame(() =>
      document.getElementById('comment-' + item.id)?.focus(),
    )
  }
  return (
    <Card className="discussion">
      <CardHeader>
        <CardTitle>
          <h3>
            <Icon name="chat" /> Discussion
            <span
              aria-label={
                comments.length +
                (comments.length === 1 ? ' message' : ' messages')
              }
            >
              {comments.length}
            </span>
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(scoped || (prLocationSelected && allGroups.length > 0)) && (
          <div
            className="switcher thread-filter"
            role="group"
            aria-label="Discussion scope"
          >
            {['stage', 'all'].map((k) => (
              <button
                key={k}
                aria-pressed={scope === k}
                onClick={() => setScope(k)}
              >
                {k === 'stage'
                  ? pr
                    ? 'This location'
                    : 'This stage'
                  : 'All threads'}
                {pr && (
                  <span className="thread-filter-count">
                    {' '}
                    {k === 'stage' ? atLocation.length : allGroups.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="conversation">
          {groups.length === 0 ? (
            <p className="empty-thread">
              {prLocationSelected && scope !== 'all'
                ? 'No threads at this location yet.'
                : scoped
                  ? 'No annotations on this stage yet.'
                  : 'No comments yet.'}
            </p>
          ) : (
            groups.map((group) => (
              <section
                key={group[0].id}
                className="thread"
                data-pr-current={
                  (prLocationSelected &&
                    anchorKey(group[0].anchor) === target) ||
                  undefined
                }
              >
                <button
                  className="thread-location"
                  title={
                    pr && group[0].anchor.type !== 'item'
                      ? 'Show this location in the PR'
                      : undefined
                  }
                  onClick={() => {
                    const source = group[0].anchor
                    if (pr && (source.path || source.section_id))
                      showSource(source)
                    else setAnchor(source)
                  }}
                >
                  <Icon name="item" size={13} />
                  <span>{location(item, group[0].anchor)}</span>
                </button>
                <ul>
                  {group.map((c) => (
                    <li
                      key={c.id}
                      tabIndex={-1}
                      id={'thread-' + c.id}
                      className={'message ' + c.author}
                    >
                      <div className="avatar" aria-hidden="true">
                        {c.author === 'agent' ? (
                          <Icon name="cpu" size={14} />
                        ) : (
                          'R'
                        )}
                      </div>
                      <div className="message-content">
                        <div className="byline">
                          <strong>
                            {c.author === 'agent' ? 'Coding agent' : 'Reviewer'}
                          </strong>{' '}
                          <time dateTime={c.created_at} title={c.created_at}>
                            {new Date(c.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          {open && (
                            <button
                              type="button"
                              className="reply-action"
                              onClick={() => respond(c)}
                            >
                              Reply
                            </button>
                          )}
                        </div>
                        <div className="bubble">{c.body}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        {open && (
          <div className="composer">
            <label htmlFor={'comment-' + item.id}>
              {parent
                ? 'Reply to ' +
                  (parent.author === 'agent' ? 'coding agent' : 'reviewer')
                : 'Comment on'}{' '}
              <strong title={location(item, anchor)}>
                {location(item, anchor)}
              </strong>
            </label>
            {pr && anchor.type !== 'item' && (
              <div className="pr-composer-location">
                {(anchor.path || anchor.section_id) && (
                  <button type="button" onClick={() => showSource(anchor)}>
                    View source
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReply(null)
                    setAnchor({ type: 'item' })
                    document.getElementById('comment-' + item.id)?.focus()
                  }}
                >
                  Comment on whole PR
                </button>
              </div>
            )}
            {unavailable && !parent && (
              <p className="input-hint">
                Reply in the original thread to discuss this earlier version.
              </p>
            )}
            <div className="comment-input">
              <Textarea
                id={'comment-' + item.id}
                aria-label={
                  'Comment on ' + (anchor.exact ?? anchor.path ?? 'item')
                }
                placeholder={parent ? 'Write a reply…' : 'Write a comment…'}
                value={body}
                onChange={(e) => edit(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
              <div className="composer-actions">
                {parent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReply(null)}
                  >
                    Cancel reply
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={canSend ? 'default' : 'secondary'}
                  disabled={!canSend}
                  onClick={submit}
                >
                  {parent ? 'Send reply' : 'Add comment'}{' '}
                  <Icon name="arrow" size={13} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
