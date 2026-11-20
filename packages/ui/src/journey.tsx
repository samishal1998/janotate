import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React, { useState } from 'react'
import { dbmlText } from '../../core/src/dbml-patch'
import { itemStops, type GuideStop } from './guide-stops'
import { useGuidePlayback } from './guide-playback'
import type { Schema } from './dbml-model'
import { groupThreads } from './discussion'
import { Icon, itemIcon } from './components/icon'
import { NarratedHeading } from './read-aloud'
import './journey-dock.css'

function OutlineStop({
  stop,
  current,
  visit,
}: {
  stop: GuideStop
  current: boolean
  visit: () => void
}) {
  const media = useGuidePlayback(stop.media ? stop.item : undefined)
  return (
    <button
      type="button"
      aria-current={current ? 'step' : undefined}
      onClick={visit}
    >
      <span>{stop.label}</span>
      <small>
        {media && media.path === stop.anchor.path && media.group === stop.media
          ? media.status
          : stop.status}
      </small>
    </button>
  )
}

function constrain(left: number, top: number, box: DOMRect) {
  const gap = 8
  return {
    left: Math.max(gap, Math.min(left, innerWidth - box.width - gap)),
    top: Math.max(gap, Math.min(top, innerHeight - box.height - gap)),
  }
}

export function Journey({ review, answers, visibleItem, onVisit }) {
  const [mode, setMode] = useState('review')
  const [selected, setSelected] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const browseButton = React.useRef<HTMLButtonElement>(null)
  const seeking = React.useRef<string>(null)
  const [schemas, setSchemas] = useState<
    Record<string, { source: string; schema?: Schema }>
  >({})
  React.useEffect(() => {
    const sources = review.items
      .filter((i) => i.kind === 'dbml')
      .map((i) => {
        const draft =
          answers[i.id]?.revision === i.revision
            ? answers[i.id].value?.dbmlEdit
            : null
        const source =
          draft ??
          (typeof i.value === 'string'
            ? i.value
            : i.value?.format
              ? dbmlText(i, i.value)
              : i.source_text)
        return { id: i.id, source }
      })
    if (!sources.some((s) => schemas[s.id]?.source !== s.source)) return
    let current = true
    void import('./dbml-model').then(({ parseDbml }) => {
      if (!current) return
      const next = {}
      for (const { id, source } of sources) {
        if (schemas[id]?.source === source) {
          next[id] = schemas[id]
          continue
        }
        try {
          next[id] = { source, schema: parseDbml(source) }
        } catch {
          next[id] = { source }
        }
      }
      setSchemas(next)
    })
    return () => {
      current = false
    }
  }, [review.items, answers, schemas])
  const panel = React.useRef<HTMLElement>(null)
  const dockTarget = React.useRef<HTMLDivElement>(null)
  const placementButton = React.useRef<HTMLButtonElement>(null)
  const focusDock = React.useRef(false)
  const drag = React.useRef<{
    x: number
    y: number
    dx: number
    dy: number
    moved: boolean
  }>(null)
  const contentId = React.useId()
  const [collapsed, setCollapsed] = useState(() => innerWidth <= 700)
  const [floating, setFloating] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [overDock, setOverDock] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number }>(null)
  const gripRef = React.useCallback((el: HTMLButtonElement | null) => {
    if (!el) return
    // A fast handle drag must not start a browser fling that consumes the next tap.
    const preventFling = (event: TouchEvent) => event.preventDefault()
    el.addEventListener('touchmove', preventFling, { passive: false })
    return () => el.removeEventListener('touchmove', preventFling)
  }, [])
  function move(left: number, top: number) {
    setFloating(true)
    setPosition(constrain(left, top, panel.current.getBoundingClientRect()))
  }
  function redock() {
    focusDock.current = true
    setFloating(false)
  }
  function endDrag() {
    drag.current = null
    setDragging(false)
    setOverDock(false)
  }
  function onDockTarget(x: number, y: number) {
    const box = dockTarget.current?.getBoundingClientRect()
    return (
      !!box &&
      x >= box.left &&
      x <= box.right &&
      y >= box.top &&
      y <= box.bottom
    )
  }
  React.useLayoutEffect(() => {
    if (!floating) {
      if (focusDock.current) {
        focusDock.current = false
        placementButton.current?.focus({ preventScroll: true })
        placementButton.current?.scrollIntoView({ block: 'nearest' })
      }
      return
    }
    function fit() {
      const box = panel.current?.getBoundingClientRect()
      if (!box) return
      setPosition((prev) => {
        if (!prev) return prev
        const next = constrain(prev.left, prev.top, box)
        return prev.left === next.left && prev.top === next.top ? prev : next
      })
    }
    fit()
    const size = new ResizeObserver(fit)
    size.observe(panel.current)
    window.addEventListener('resize', fit)
    return () => {
      size.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [floating])
  const outline: GuideStop[] = React.useMemo(
    () =>
      review.items.flatMap((i) =>
        itemStops(i, answers[i.id], schemas[i.id]?.schema),
      ),
    [review.items, answers, schemas],
  )
  const plan = outline.filter((s) => s.kind === 'plan' || s.kind === 'proposal')
  const discussion: GuideStop[] = React.useMemo(() => {
    const items = new Map<string, any>(review.items.map((i) => [i.id, i]))
    return groupThreads(review.comments).map(([c, ...rest]) => {
      const replies = rest.length
      return {
        id: c.id,
        item: c.item_id,
        title: items.get(c.item_id)?.title ?? 'Discussion',
        kind: 'thread',
        label: c.body,
        narration: c.body,
        anchor: c.anchor,
        thread: c.id,
        status: replies === 1 ? '1 reply' : replies + ' replies',
      }
    })
  }, [review.comments, review.items])
  const entries =
    mode === 'review' ? outline : mode === 'plan' ? plan : discussion
  const index = entries.findIndex((s) => s.id === selected),
    active = entries[index]
  const playback = useGuidePlayback(active?.media ? active.item : undefined)
  const visible = visibleItem === null || active?.item === visibleItem
  const betweenMarkers = playback?.group === 'animation' && playback.path === ''
  const transport =
    playback?.group === active?.media &&
    (playback?.path === active?.anchor.path || betweenMarkers)
      ? playback
      : null
  // Follow a running sequence without issuing a new visit, which would stop its player.
  React.useEffect(() => {
    if (seeking.current) {
      if (playback?.path !== seeking.current) return
      seeking.current = null
    }
    if (!active?.media || !playback || playback.path === active.anchor.path)
      return
    const next = entries.find(
      (s) =>
        s.item === active.item &&
        s.media === playback.group &&
        s.anchor.path === playback.path,
    )
    if (next) setSelected(next.id)
  }, [active, playback, entries])
  const hasPlan = review.items.some((i) => i.kind === 'plan')
  const hasProposal = review.items.some((i) => i.kind === 'proposal')
  const planLabel =
    hasPlan && hasProposal
      ? 'Sections'
      : hasProposal
        ? 'Proposal'
        : 'Plan stages'
  function visit(list, n) {
    const stop = list[n]
    if (
      active?.media &&
      (active.item !== stop?.item || active.media !== stop?.media)
    )
      playback?.stop()
    seeking.current = stop?.media ? stop.anchor.path : null
    setSelected(stop?.id ?? '')
    setBrowsing(false)
    if (stop) onVisit(stop)
  }
  return (
    <div className="journey-dock">
      {dragging && (
        <div
          ref={dockTarget}
          className="guide-drop"
          data-over={overDock}
          aria-hidden="true"
        >
          Drop to dock
        </div>
      )}
      <nav
        data-placement={floating ? 'floating' : 'docked'}
        ref={panel}
        className={'journey floating-guide' + (collapsed ? ' compact' : '')}
        style={
          floating && position
            ? { ...position, bottom: 'auto', right: 'auto' }
            : undefined
        }
        aria-label="Guided review"
      >
        <div
          className="guide-head"
          onKeyDown={(e) => {
            if (floating && e.key === 'Escape') {
              e.preventDefault()
              redock()
            }
          }}
        >
          <button
            type="button"
            className="grip"
            ref={gripRef}
            aria-label="Move guide"
            title="Drag or use arrow keys to move. Home returns the guide to its dock."
            onPointerDown={(e) => {
              if (!e.isPrimary || e.button !== 0) return
              const b = panel.current.getBoundingClientRect()
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                dx: e.clientX - b.left,
                dy: e.clientY - b.top,
                moved: false,
              }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const origin = drag.current
              if (!origin || !e.currentTarget.hasPointerCapture(e.pointerId))
                return
              if (
                !origin.moved &&
                Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4
              )
                return
              origin.moved = true
              setDragging(true)
              move(e.clientX - origin.dx, e.clientY - origin.dy)
              setOverDock(onDockTarget(e.clientX, e.clientY))
            }}
            onPointerUp={(e) => {
              if (drag.current?.moved && onDockTarget(e.clientX, e.clientY))
                redock()
              endDrag()
            }}
            onLostPointerCapture={endDrag}
            onKeyDown={(e) => {
              const b = panel.current.getBoundingClientRect(),
                delta = {
                  ArrowUp: [0, -24],
                  ArrowDown: [0, 24],
                  ArrowLeft: [-24, 0],
                  ArrowRight: [24, 0],
                }[e.key]
              if (delta) {
                e.preventDefault()
                move(b.left + delta[0], b.top + delta[1])
              } else if (e.key === 'Home') {
                e.preventDefault()
                if (floating) redock()
              }
            }}
          >
            <svg
              className="guide-grip-dots"
              aria-hidden="true"
              width="10"
              height="16"
              viewBox="0 0 10 16"
              fill="currentColor"
            >
              {[3, 8, 13].map((y) => (
                <React.Fragment key={y}>
                  <circle cx="2.5" cy={y} r="1.25" />
                  <circle cx="7.5" cy={y} r="1.25" />
                </React.Fragment>
              ))}
            </svg>
            <strong>Guide</strong>
          </button>
          <button
            ref={placementButton}
            type="button"
            className="guide-placement"
            aria-label={floating ? 'Dock guide' : 'Float guide'}
            title={floating ? 'Dock guide' : 'Float guide'}
            onClick={() => (floating ? redock() : setFloating(true))}
          >
            <Icon name={floating ? 'board' : 'fit'} size={14} />
          </button>
          <button
            type="button"
            aria-label={collapsed ? 'Expand guide' : 'Collapse guide'}
            title={collapsed ? 'Expand guide' : 'Collapse guide'}
            aria-expanded={!collapsed}
            aria-controls={collapsed ? undefined : contentId}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon
              name="chevron-down"
              className={collapsed ? '' : 'guide-chevron-up'}
            />
          </button>
        </div>
        {!collapsed && (
          <div id={contentId} className="guide-content">
            <NativeSelect
              className="w-full"
              size="sm"
              aria-label="Guide route"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value)
                visit(
                  e.target.value === 'review'
                    ? outline
                    : e.target.value === 'plan'
                      ? plan
                      : discussion,
                  0,
                )
              }}
            >
              <NativeSelectOption value="review">
                Full review
              </NativeSelectOption>
              {plan.length > 0 && (
                <NativeSelectOption
                  value="plan"
                  aria-label={
                    hasPlan && hasProposal
                      ? 'Sections in the plan and proposal'
                      : planLabel
                  }
                >
                  {planLabel}
                </NativeSelectOption>
              )}
              <NativeSelectOption value="discussion">
                Threads
              </NativeSelectOption>
            </NativeSelect>
            {active && (
              <div className="guide-active" aria-live="polite">
                <div className="guide-item-name">
                  <Icon
                    name={active.thread ? 'chat' : itemIcon(active.kind)}
                    size={13}
                  />
                  {active.title}
                </div>
                <NarratedHeading
                  key={active.id}
                  text={active.narration}
                  label="Journey stop"
                >
                  <small className="guide-stop">{active.label}</small>
                </NarratedHeading>
                <div className="guide-stop-state">
                  <span>
                    {transport?.status ?? active.status}
                    {betweenMarkers && ' · Between markers'}
                  </span>
                  {!visible && active.media ? (
                    <button type="button" onClick={() => visit(entries, index)}>
                      Open stop
                    </button>
                  ) : (
                    transport?.action && (
                      <button
                        type="button"
                        aria-label={transport.action + ' guide media'}
                        onClick={transport.toggle}
                      >
                        {transport.action}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
            {entries.length > 0 && (
              <button
                type="button"
                ref={browseButton}
                className="guide-browse"
                aria-expanded={browsing}
                onClick={() => setBrowsing(!browsing)}
              >
                <Icon name="menu" size={13} />
                {browsing ? 'Hide stops' : 'Browse stops'}
                <Icon
                  name="chevron-down"
                  className={browsing ? 'guide-chevron-up' : ''}
                  size={12}
                />
              </button>
            )}
            {browsing && (
              <div
                className="guide-outline"
                aria-label="Guide stops"
                role="group"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setBrowsing(false)
                    browseButton.current?.focus()
                  }
                }}
              >
                {entries.map((s, n) => (
                  <React.Fragment key={s.id}>
                    {entries[n - 1]?.item !== s.item && (
                      <small>{s.title}</small>
                    )}
                    <OutlineStop
                      stop={s}
                      current={s.id === selected}
                      visit={() => {
                        visit(entries, n)
                        browseButton.current?.focus()
                      }}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}
            {active && (
              <progress
                aria-hidden="true"
                className="guide-progress"
                value={index + 1}
                max={entries.length}
              />
            )}
            <div className="guide-steps">
              <span aria-live="polite">
                {entries.length
                  ? index < 0
                    ? entries.length + ' stops'
                    : index + 1 + ' / ' + entries.length
                  : 'No stops yet'}
              </span>
              <button
                hidden={index < 0}
                disabled={index <= 0}
                aria-label="Previous guide stop"
                onClick={() => visit(entries, index - 1)}
              >
                <Icon name="arrow" className="guide-back-arrow" size={13} />
              </button>
              <button
                disabled={!entries.length || index >= entries.length - 1}
                onClick={() => visit(entries, index + 1)}
              >
                {index < 0 ? 'Start guide' : 'Next stop'}{' '}
                <Icon name="arrow" size={13} />
              </button>
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
