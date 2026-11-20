import React from 'react'
import { quoteOffset } from '../../core/src/quote'

export function readPassage(root: HTMLElement) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || sel.isCollapsed) {
    return null
  }
  const range = sel.getRangeAt(0)
  const start =
    range.startContainer.nodeType === 1
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const passage = start?.closest('[data-section]')
  if (
    !root?.contains(passage) ||
    !passage?.contains(range.commonAncestorContainer)
  ) {
    return null
  }
  const exact = range.toString()
  if (!exact || exact.length > 10000) {
    return null
  }
  const pre = range.cloneRange()
  pre.selectNodeContents(passage)
  pre.setEnd(range.startContainer, range.startOffset)
  const at = pre.toString().length
  const body = passage.textContent
  const box = range.getBoundingClientRect(),
    outer = root.getBoundingClientRect()
  return {
    quote: {
      type: 'text',
      section_id: passage.getAttribute('data-section'),
      start: at,
      exact,
      prefix: body.slice(Math.max(0, at - 48), at),
      suffix: body.slice(at + exact.length, at + exact.length + 48),
    },
    top: box.bottom - outer.top + 4,
    left: Math.max(0, Math.min(box.left - outer.left, outer.width - 150)),
  }
}

export function PassageMarks({
  body,
  section,
  roots,
  selection,
  visitThread,
  strictContext = false,
}) {
  const quoting = selection?.type === 'text'
  const annotations = roots.filter((c) => c.anchor.section_id === section)
  if (
    quoting &&
    selection.section_id === section &&
    !annotations.some(
      (c) => JSON.stringify(c.anchor) === JSON.stringify(selection),
    )
  )
    annotations.push({ anchor: selection })
  const ranges = annotations
    .map((c) => ({ at: quoteOffset(body, c.anchor, strictContext), c }))
    .filter((r) => r.at >= 0)
  const cuts = [
    ...new Set<number>([
      0,
      body.length,
      ...ranges.flatMap(({ at, c }) => [at, at + c.anchor.exact.length]),
    ]),
  ].sort((a, b) => a - b)
  return cuts.slice(0, -1).map((from, n) => {
    const to = cuts[n + 1],
      text = body.slice(from, to)
    const active = ranges.filter(
      (r) => r.at <= from && to <= r.at + r.c.anchor.exact.length,
    )
    if (!active.length) return text
    const current = active.find(
      (r) =>
        quoting &&
        selection.section_id === section &&
        selection.exact === r.c.anchor.exact &&
        selection.start === r.c.anchor.start,
    )
    const c = (current ?? active[0]).c
    function visit() {
      if (!window.getSelection()?.isCollapsed) return
      visitThread(c)
    }
    return (
      <mark
        key={from}
        role="button"
        tabIndex={0}
        data-current={Boolean(current)}
        aria-label={'Discussion on ' + text}
        onClick={visit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            visit()
          }
        }}
      >
        {text}
      </mark>
    )
  })
}
