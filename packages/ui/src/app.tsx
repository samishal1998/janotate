import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { dbmlPatch } from '../../core/src/dbml-patch'
import './theme.css'
import { Button } from './components/ui/button'
import { Appearance } from './appearance'
import { VoiceSettings } from './voice-settings'
import { EndReview } from './end-review'
import { Home } from './home'
import { AnnotationMode, AnnotationTool } from './annotation-tool'
import { Journey } from './journey'
import { ReadAloudProvider } from './read-aloud'
import { Item } from './item'
import { Icon, itemIcon } from './components/icon'
import { DecisionLog } from './log'
import { groupThreads, threadLocation } from './discussion'
const mobileHeader = matchMedia('(max-width: 700px)')
function subscribeHeader(change: () => void) {
  mobileHeader.addEventListener('change', change)
  return () => mobileHeader.removeEventListener('change', change)
}
function ReviewPanel({ hidden, focused, children }) {
  const panel = useRef<HTMLDivElement>(null)
  const wasHidden = useRef(hidden)
  const [visited, setVisited] = useState(!hidden)
  useEffect(() => {
    const entering = wasHidden.current && !hidden && focused
    wasHidden.current = hidden
    if (!hidden) setVisited(true)
    if (
      entering &&
      matchMedia('(prefers-reduced-motion: no-preference)').matches
    ) {
      const reveal = panel.current?.animate(
        [
          { opacity: 0.65, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 165, easing: 'ease-out' },
      )
      return () => reveal?.cancel()
    }
  }, [hidden, focused])
  return (
    <div ref={panel} hidden={hidden}>
      {(!hidden || visited) && children}
    </div>
  )
}
function App() {
  const narrow = useSyncExternalStore(
    subscribeHeader,
    () => mobileHeader.matches,
  )
  const Identity = narrow ? 'header' : 'div'
  const id = location.pathname.split('/')[2],
    api = '/api/review/' + id
  const [review, setReview] = useState(null),
    [answers, setAnswers] = useState({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState('Connecting…')
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  function receive(data) {
    setReview((prev) => (prev?.version > data.version ? prev : data))
  }
  async function load() {
    const r = await fetch(api)
    if (!r.ok) throw Error('Review unavailable')
    receive(await r.json())
  }
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    let timer,
      version,
      retry = 500
    async function refresh() {
      try {
        const r = await fetch(
          api + (version === undefined ? '' : '?since=' + version),
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(35000),
            ]),
            cache: 'no-store',
          },
        )
        if (r.status === 404) {
          setReview(null)
          setConnection('Missing')
          return
        }
        if (!r.ok) throw Error('Review unavailable')
        if (r.status !== 204) {
          const snapshot = await r.json()
          if (controller.signal.aborted) return
          receive(snapshot)
          version = snapshot.version
          if (snapshot.state !== 'open') {
            setConnection('')
            return
          }
        }
        setConnection('Connected')
        retry = 500
        timer = setTimeout(refresh, version === undefined ? 2000 : 0)
      } catch {
        if (controller.signal.aborted) return
        setConnection('Reconnecting…')
        timer = setTimeout(refresh, retry)
        retry = Math.min(retry * 2, 10000)
      }
    }
    refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [id])
  function stage(key, revision, value) {
    setAnswers((old) => ({ ...old, [key]: { revision, value } }))
  }
  function answerPayload(item, value) {
    return item?.kind === 'dbml' && value && 'dbmlEdit' in value
      ? dbmlPatch(item, value.dbmlEdit)
      : value
  }
  async function post(key, action, value) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(api + '/items/' + key + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'answer'
            ? answerPayload(
                review.items.find((i) => i.id === key),
                value,
              )
            : value,
        ),
      })
      const data = await r.json()
      if (!r.ok) throw Error(data.error)
      receive(data)
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    setBusy(true)
    try {
      const r = await fetch(api + '/cancel', { method: 'POST' })
      if (!r.ok) throw Error('Could not cancel review')
      receive(await r.json())
      setAnswers({})
      setError('')
      requestAnimationFrame(() =>
        reviewHeading.current?.focus({ preventScroll: true }),
      )
    } finally {
      setBusy(false)
    }
  }
  async function submit() {
    setBusy(true)
    setError('')
    try {
      const staged = Object.fromEntries(
        review.items
          .filter(
            (i) =>
              answers[i.id]?.revision === i.revision &&
              answers[i.id]?.value != null,
          )
          .map((i) => [i.id, answerPayload(i, answers[i.id].value)]),
      )
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged),
      })
      if (!response.ok) throw Error((await response.json()).error)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const [visit, setVisit] = useState(null)
  function follow(stop) {
    setSurface('items')
    setFocused(stop.item)
    setVisit({ ...stop })
  }

  const open = review?.state === 'open'
  const [navOpen, setNavOpen] = useState(false)
  const [activeItem, setActiveItem] = useState('')
  const [annotating, setAnnotating] = useState(false)
  const [focusMode, setFocusMode] = useState(
    () => new URLSearchParams(location.search).get('view') === 'focus',
  )
  const [focused, setFocused] = useState(() =>
    location.hash.replace(/^#item-/, ''),
  )
  const [surface, setSurface] = useState('items'),
    [filter, setFilter] = useState('')
  const focusedIndex = Math.max(
    0,
    review?.items.findIndex((i) => i.id === focused) ?? 0,
  )
  const shown = review?.items[focusedIndex]
  const threads = groupThreads(review?.comments ?? []).sort(
    (a, b) => b.at(-1).cursor - a.at(-1).cursor,
  )
  const filteredItems =
    review?.items.filter((i) =>
      (i.title + ' ' + i.kind)
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
    ) ?? []
  function showItem(key) {
    setSurface('items')
    setFocused(key)
    setNavOpen(false)
    requestAnimationFrame(() => {
      const target = focusMode
        ? document.querySelector('.review-toolbar')
        : document.getElementById('item-' + key)
      target?.scrollIntoView({ block: 'start' })
    })
  }
  useEffect(() => {
    function hash() {
      if (location.hash.startsWith('#item-')) showItem(location.hash.slice(6))
    }
    window.addEventListener('hashchange', hash)
    return () => window.removeEventListener('hashchange', hash)
  }, [])

  useEffect(() => {
    if (!review?.id || focusMode || surface !== 'items') return
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('.review-item'),
    )
    let frame = 0
    function update() {
      frame = 0
      const active =
        items.find(
          (el) =>
            el.getBoundingClientRect().bottom >
            Math.min(innerHeight * 0.25, 160),
        ) ?? items.at(-1)
      setActiveItem(active?.id ?? '')
    }
    function scroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', scroll)
      cancelAnimationFrame(frame)
    }
  }, [
    focusMode,
    surface,
    review?.id,
    review?.items.map((i) => i.revision).join(','),
  ])
  const answered =
    review?.items.filter((i) => i.value !== undefined || i.skipped).length ?? 0
  return (
    <ReadAloudProvider
      reviewId={id}
      destination={[surface, focusMode, focused].join('/')}
      visit={visit}
    >
      <aside className="rail">
        <Identity
          className={narrow ? 'identity topbar mobile-header' : 'identity'}
        >
          <a className="wordmark" href="/" aria-label="Janotate home">
            Janotate
          </a>
          {narrow && (
            <div className="workspace-preferences">
              <Appearance />
              <VoiceSettings />
            </div>
          )}
          <button
            className="menu-toggle"
            aria-label="Menu"
            aria-expanded={navOpen}
            aria-controls="workspace-nav"
            onClick={() => setNavOpen(!navOpen)}
          >
            <Icon name="menu" /> <span>Menu</span>
          </button>
        </Identity>
        <nav id="workspace-nav" className={navOpen ? 'expanded' : ''}>
          <div className="nav-label">Workspace</div>
          <a className="nav-link" href="/">
            <Icon name="home" /> Home
          </a>
          {id && (
            <a className="nav-link current" aria-current="page" href="#review">
              <Icon name="board" /> Current review
            </a>
          )}
          <a
            className={'nav-link ' + (!id ? 'current' : '')}
            aria-current={!id ? 'page' : undefined}
            href="/decisions"
          >
            <Icon name="log" /> Decision log
          </a>
          {review && (
            <div className="item-outline">
              <label className="outline-search">
                <Icon name="search" />
                <input
                  aria-label="Find a review item"
                  placeholder="Find an item"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div className="nav-label">
                Review outline <span>{review.items.length}</span>
              </div>
              {filter.trim() && !filteredItems.length && (
                <div className="outline-empty" role="status">
                  No matching items.{' '}
                  <button onClick={() => setFilter('')}>Clear search</button>
                </div>
              )}
              {filteredItems.map((i) => (
                <a
                  key={i.id}
                  aria-current={
                    (focusMode
                      ? shown?.id === i.id
                      : activeItem === 'item-' + i.id) && surface === 'items'
                      ? 'location'
                      : undefined
                  }
                  href={'#item-' + i.id}
                  onClick={() => showItem(i.id)}
                >
                  <Icon name={itemIcon(i.kind)} size={17} />
                  {i.title}
                </a>
              ))}
            </div>
          )}
          <a className="nav-link docs-link" href="/docs/">
            <Icon name="book" /> Documentation
          </a>
        </nav>
        {review && (
          <Journey
            review={review}
            answers={answers}
            visibleItem={
              surface !== 'items' ? '' : focusMode ? shown?.id : null
            }
            onVisit={follow}
          />
        )}
      </aside>
      <div className="canvas" data-focus={focusMode && surface === 'items'}>
        {!narrow && (
          <header className="topbar">
            <nav className="workspace-path" aria-label="Breadcrumb">
              <a href="/">
                <Icon name="workspace" /> Workspace
              </a>
              <Icon name="chevron-right" size={13} />
              <span aria-current="page">{id ? 'Review' : 'Decision log'}</span>
            </nav>
            <div className="workspace-preferences">
              <Appearance />
              <VoiceSettings />
            </div>
          </header>
        )}
        <main id="review">
          {!id && <DecisionLog />}
          {review && (
            <>
              <header className="review-summary">
                <div className="review-heading">
                  <div>
                    <h1 tabIndex={-1} ref={reviewHeading}>
                      {review.title}
                    </h1>
                  </div>
                  {open && (
                    <div className="review-actions">
                      <Button
                        size="lg"
                        className="submit"
                        disabled={busy}
                        onClick={submit}
                      >
                        Submit review <Icon name="arrow" />
                      </Button>
                      <EndReview busy={busy} onEnd={cancel} />
                    </div>
                  )}
                </div>
                <div className="meta">
                  <span
                    className="state"
                    data-state={review.state}
                    role="status"
                  >
                    <i />
                    {open
                      ? 'Open for review'
                      : review.state === 'done'
                        ? 'Review submitted'
                        : review.state === 'cancelled'
                          ? 'Ended without submission'
                          : 'Expired'}
                  </span>
                  <span>
                    <Icon name="workspace" />
                    {review.mode === 'session' ? 'Session' : 'Workspace'}
                  </span>
                  <span>
                    <Icon name="chat" />
                    {review.comments.length}{' '}
                    {review.comments.length === 1 ? 'comment' : 'comments'}
                  </span>
                  <span className="review-progress">
                    <progress
                      aria-label="Review progress"
                      value={answered}
                      max={review.items.length}
                    />
                    {answered} of {review.items.length} reviewed
                  </span>
                  {connection && open && (
                    <span
                      className="connection"
                      data-connected={connection === 'Connected'}
                      title={`Review server: ${connection}`}
                      role="status"
                    >
                      <span>{connection}</span>
                    </span>
                  )}
                </div>
              </header>
              <div
                className="review-toolbar"
                data-single-item={review.items.length === 1}
              >
                <div className="items-bar studio-bar">
                  <div
                    className="studio-tabs"
                    role="group"
                    aria-label="Review views"
                  >
                    <button
                      aria-pressed={surface === 'items'}
                      onClick={() => setSurface('items')}
                    >
                      <Icon name="layers" /> Items
                    </button>
                    <button
                      aria-pressed={surface === 'threads'}
                      onClick={() => setSurface('threads')}
                    >
                      <Icon name="chat" /> Threads{' '}
                      <small>{threads.length}</small>
                    </button>
                  </div>
                </div>
                {surface === 'items' && (
                  <div className="reader-tools">
                    {review.items.length > 1 && (
                      <div
                        role="group"
                        className="layout-switch"
                        aria-label="Reading layout"
                      >
                        <button
                          aria-label="All items"
                          aria-pressed={!focusMode}
                          onClick={() => setFocusMode(false)}
                        >
                          All<span className="layout-detail"> items</span>
                        </button>
                        <button
                          aria-label="Focus item"
                          aria-pressed={focusMode}
                          onClick={() => {
                            setFocused(
                              activeItem.replace('item-', '') || shown?.id,
                            )
                            setFocusMode(true)
                          }}
                        >
                          Focus<span className="layout-detail"> item</span>
                        </button>
                      </div>
                    )}
                    {open && (
                      <AnnotationTool
                        active={annotating}
                        onChange={setAnnotating}
                      />
                    )}
                    {focusMode && review.items.length > 1 && (
                      <div className="reader-pager">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          aria-label="Previous review item"
                          disabled={focusedIndex === 0}
                          onClick={() =>
                            showItem(review.items[focusedIndex - 1].id)
                          }
                        >
                          <Icon name="arrow" className="previous-arrow" />
                        </Button>
                        <span>
                          {focusedIndex + 1} / {review.items.length}
                        </span>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          aria-label="Next review item"
                          disabled={focusedIndex === review.items.length - 1}
                          onClick={() =>
                            showItem(review.items[focusedIndex + 1].id)
                          }
                        >
                          <Icon name="arrow" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {surface === 'threads' && (
                <section className="thread-inbox">
                  <h2>Review discussion</h2>
                  {threads.length === 0 ? (
                    <p>
                      No threads yet. Select a passage or an item to start a
                      discussion.
                    </p>
                  ) : (
                    threads.map((thread) => {
                      const c = thread[0]
                      const item = review.items.find((i) => i.id === c.item_id)
                      const last = thread.at(-1)
                      const replies = thread.length - 1
                      return (
                        <button
                          key={c.id}
                          onClick={() =>
                            follow({
                              item: c.item_id,
                              thread: c.id,
                              anchor: c.anchor,
                            })
                          }
                        >
                          <Icon name={itemIcon(item?.kind)} />
                          <div>
                            <small>
                              {item.title} · {threadLocation(item, c.anchor)}
                            </small>
                            <strong>{c.body}</strong>
                            {replies > 0 && (
                              <span className="inbox-preview">
                                <Icon
                                  name={
                                    last.author === 'agent' ? 'cpu' : 'chat'
                                  }
                                  size={13}
                                />
                                <span>
                                  {last.author === 'agent'
                                    ? 'Coding agent'
                                    : 'Reviewer'}{' '}
                                  · {last.body}
                                </span>
                              </span>
                            )}
                          </div>
                          {replies > 0 && (
                            <span className="inbox-replies">
                              {replies} {replies === 1 ? 'reply' : 'replies'}
                            </span>
                          )}
                          <Icon name="arrow" />
                        </button>
                      )
                    })
                  )}
                </section>
              )}
              <AnnotationMode.Provider
                value={open && surface === 'items' && annotating}
              >
                {review.items.map((i) => (
                  <ReviewPanel
                    key={i.id}
                    focused={focusMode && surface === 'items'}
                    hidden={
                      surface !== 'items' || (focusMode && shown?.id !== i.id)
                    }
                  >
                    <Item
                      visit={visit?.item === i.id ? visit : null}
                      key={i.id + ':' + i.revision + ':' + review.state}
                      item={i}
                      review={review}
                      post={post}
                      stage={stage}
                    />
                  </ReviewPanel>
                ))}
              </AnnotationMode.Provider>
            </>
          )}
          {id && !review && connection === 'Missing' && (
            <section className="review-missing">
              <Icon name="workspace" size={24} />
              <h1>Review unavailable</h1>
              <p>
                This workspace has no review at that link. A session review ends
                when its server stops.
              </p>
              <a href="/">
                View open reviews <Icon name="arrow" />
              </a>
            </section>
          )}
          {id && !review && connection !== 'Missing' && (
            <p role="status">
              {connection === 'Reconnecting…'
                ? 'Review unavailable. Retrying connection…'
                : 'Opening review…'}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </main>
      </div>
    </ReadAloudProvider>
  )
}
createRoot(document.getElementById('root')).render(
  location.pathname === '/' ? <Home /> : <App />,
)
