import React, { useEffect, useRef, useState } from 'react'
import { AnnotationMode } from './annotation-tool'
import { HeadingAction, NarratedHeading } from './read-aloud'

import { quoteOffset } from '../../core/src/quote'
import { PassageMarks, readPassage } from './quote-passage'
export function Proposal({ item, selection, anchor, threads, open }) {
  const annotating = React.useContext(AnnotationMode)
  const root = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState(null)
  const quoting = selection.type === 'text'
  useEffect(() => {
    if (selection.type === 'node' && selection.path.startsWith('section:')) {
      const section = [
        ...root.current.querySelectorAll<HTMLElement>('[data-section]'),
      ].find((el) => el.dataset.section === selection.path.slice(8))
      section?.scrollIntoView({ block: 'center' })
      return
    }
    if (!quoting) return
    const target = root.current?.querySelector('mark[data-current="true"]')
    target?.scrollIntoView({ block: 'nearest' })
  }, [selection])
  useEffect(() => {
    if (!open) return
    function capture() {
      setPicked(readPassage(root.current))
    }
    document.addEventListener('selectionchange', capture)
    return () => document.removeEventListener('selectionchange', capture)
  }, [open])
  function compose(quote) {
    anchor(quote)
    setPicked(null)
    window.getSelection()?.removeAllRanges()
    requestAnimationFrame(() =>
      document.getElementById('comment-' + item.id)?.focus(),
    )
  }
  useEffect(() => {
    if (!picked || !open) return
    function shortcut(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault()
        compose(picked.quote)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [picked, open])
  const roots = threads.filter((c) => !c.parent_id && c.anchor.type === 'text')
  function visitThread(c) {
    anchor(c.anchor)
    if (c.id)
      requestAnimationFrame(() =>
        document.getElementById('thread-' + c.id)?.focus(),
      )
  }
  return (
    <div className="proposal" ref={root}>
      {open && (
        <p className="input-hint">
          {annotating
            ? 'Click a section or select a passage to start a comment.'
            : 'Select a passage to leave a comment.'}
        </p>
      )}
      {quoting &&
        !item.sections.some(
          (s) =>
            s.id === selection.section_id &&
            quoteOffset(s.body, selection) >= 0,
        ) && (
          <p role="status">
            This passage changed in the current revision. The thread retains the
            original quote.
          </p>
        )}
      {item.sections.map((s) => (
        <section key={s.id} data-guide-path={'section:' + s.id}>
          <NarratedHeading
            text={s.label + '\n\n' + s.body}
            label={s.label}
            trailingAction={
              open && (
                <HeadingAction
                  icon="chat"
                  annotation
                  label={'Comment on section ' + s.label}
                  onClick={() =>
                    compose({ type: 'node', path: 'section:' + s.id })
                  }
                />
              )
            }
          >
            <h3>{s.label}</h3>
          </NarratedHeading>
          <div
            className="prose-body"
            data-section={s.id}
            tabIndex={0}
            onClick={(event) => {
              if (!annotating) return
              const quote = readPassage(root.current)?.quote
              if (quote) compose(quote)
              else if (
                window.getSelection()?.isCollapsed &&
                !(event.target as Element).closest('mark')
              )
                compose({ type: 'node', path: 'section:' + s.id })
            }}
          >
            <PassageMarks
              body={s.body}
              section={s.id}
              {...{ selection, roots, visitThread }}
            />
          </div>
        </section>
      ))}
      {picked && (
        <button
          className="quote-action"
          title="Comment on passage (Alt+Shift+M)"
          aria-keyshortcuts="Alt+Shift+M"
          style={{ top: picked.top, left: picked.left }}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => compose(picked.quote)}
        >
          Comment on passage
        </button>
      )}
    </div>
  )
}
