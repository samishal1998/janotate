import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { prPassage, prQuoteOffset } from '../../core/src/pr-passage'
import { AnnotationMode } from './annotation-tool'
import { Icon } from './components/icon'
import { PassageMarks, readPassage } from './quote-passage'
import './pr-passage.css'

type Thread = { id: string; parent_id?: string; body: string; anchor: any }
type State = {
  report: Parameters<typeof prPassage>[0]
  roots: Map<string, Thread[]>
  annotating: boolean
  open: boolean
  selection: any
  compose: (anchor: any) => void
  visitThread: (thread: Thread) => void
  selectedPath: string
}
const Narrative = createContext<State>(null)

export function PrNarrative({
  item,
  threads,
  selection,
  anchor,
  open,
  children,
}) {
  const annotating = useContext(AnnotationMode)
  const root = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<ReturnType<typeof readPassage>>(null)
  const report = item.report
  const historical =
    selection?.ledger_id && selection.ledger_id !== report.ledgerId
  const selectedPath = historical
    ? ''
    : (selection?.section_id ?? selection?.path ?? '')
  const roots = useMemo(() => {
    const byPath = new Map<string, Thread[]>()
    for (const thread of threads) {
      if (thread.parent_id || thread.anchor.ledger_id !== report.ledgerId)
        continue
      const path = thread.anchor.section_id ?? thread.anchor.path
      if (!path) continue
      const list = byPath.get(path) ?? []
      list.push(thread)
      byPath.set(path, list)
    }
    return byPath
  }, [threads, report.ledgerId])

  function compose(a) {
    anchor({ ...a, ledger_id: report.ledgerId })
    window.getSelection()?.removeAllRanges()
    setPicked(null)
  }
  function visitThread(thread) {
    if (!thread.id) {
      compose(thread.anchor)
      return
    }
    anchor(thread.anchor, { focusComposer: false })
    requestAnimationFrame(() =>
      document.getElementById('thread-' + thread.id)?.focus(),
    )
  }
  useEffect(() => {
    if (!open) return
    const capture = () => setPicked(readPassage(root.current))
    document.addEventListener('selectionchange', capture)
    return () => document.removeEventListener('selectionchange', capture)
  }, [open])
  useEffect(() => {
    if (!picked || !open) return
    function shortcut(e: KeyboardEvent) {
      if (e.altKey && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault()
        compose(picked.quote)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [picked, open, report.ledgerId])
  const stale =
    !historical &&
    selection?.type === 'text' &&
    prQuoteOffset(report, selection) < 0
  return (
    <Narrative.Provider
      value={{
        report,
        roots,
        annotating,
        open,
        selection: historical ? null : selection,
        compose,
        visitThread,
        selectedPath,
      }}
    >
      <div className="pr-review" ref={root}>
        {annotating && open && (
          <p className="pr-annotation-hint">
            <Icon name="chat" size={15} />
            <span>
              Click a passage or select words to comment. In a diff, click a
              line or use <strong>Select lines</strong> to mark a range.
            </span>
          </p>
        )}
        {stale && (
          <p role="status" tabIndex={-1} data-pr-stale>
            This passage changed. The discussion keeps the original quote.
          </p>
        )}
        {children}
        {open && picked && (
          <button
            type="button"
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
    </Narrative.Provider>
  )
}

export function PrThreadPins({ path }: { path: string }) {
  const { roots, visitThread } = useContext(Narrative)
  const threads = roots.get(path) ?? []
  return (
    <>
      {threads.map((t, n) => (
        <button
          type="button"
          className="pr-thread-pin"
          key={t.id}
          aria-label={'Open discussion: ' + t.body}
          title={t.body}
          onClick={() => visitThread(t)}
        >
          <Icon name="chat" size={13} />
          {threads.length === 1 ? '1 thread' : n + 1}
        </button>
      ))}
    </>
  )
}

export function PrText({ path }: { path: string }) {
  const {
    report,
    roots,
    annotating,
    open,
    selection,
    compose,
    visitThread,
    selectedPath,
  } = useContext(Narrative)
  const passage = prPassage(report, path)
  const body = useRef<HTMLSpanElement>(null)
  const composedDrag = useRef(false)
  useEffect(() => {
    if (path !== selectedPath || !body.current) return
    // Summary context and evidence explanations may be inside native disclosures.
    let ancestor: HTMLElement = body.current
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
      ancestor = ancestor.parentElement
    }
  }, [selectedPath, selection, path])
  if (!passage) return null
  const active = path === selectedPath
  const annotations = roots.get(path) ?? []
  const whole = () =>
    compose(
      /:(?:story|also|outlier|unchanged|scope):\d+$/.test(path)
        ? {
            type: 'text',
            section_id: path,
            start: 0,
            exact: passage.text,
            prefix: '',
            suffix: '',
          }
        : { type: 'node', path },
    )
  return (
    <>
      <span
        ref={body}
        tabIndex={-1}
        data-section={path}
        data-pr-location={path}
        data-annotation-target={open || undefined}
        data-pr-current={(active && selection?.type === 'node') || undefined}
        onPointerDown={() => {
          composedDrag.current = false
        }}
        onPointerUp={() => {
          if (!annotating || !open) return
          const selected = readPassage(body.current)
          if (!selected) return
          composedDrag.current = true
          compose(selected.quote)
        }}
        onClick={(e) => {
          if (!annotating || !open || composedDrag.current) return
          const picked = readPassage(body.current)
          if (picked) compose(picked.quote)
          else if (
            window.getSelection()?.isCollapsed &&
            !(e.target as Element).closest('mark')
          )
            whole()
        }}
      >
        <PassageMarks
          section={path}
          body={passage.text}
          roots={annotations.filter((t) => t.anchor.type === 'text')}
          selection={selection}
          visitThread={visitThread}
          strictContext
        />
      </span>
      {annotating && open && (
        <button
          type="button"
          className="pr-passage-comment"
          aria-label={'Comment on ' + passage.label}
          title={'Comment on ' + passage.label}
          data-annotation-target
          onClick={whole}
        >
          <Icon name="chat" size={14} />
        </button>
      )}
      {annotations.some((t) => t.anchor.type === 'node') && (
        <PrThreadPins path={path} />
      )}
    </>
  )
}
