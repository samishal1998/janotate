import React, { useMemo, useState } from 'react'
import {
  Diff,
  Hunk,
  parseDiff,
  computeOldLineNumber,
  computeNewLineNumber,
} from 'react-diff-view'
import 'react-diff-view/style/index.css'
import { diffTokens } from './diff-syntax'
function Expanded({ patch, language, layout }) {
  const data = useMemo(() => {
    const hunks =
      parseDiff(
        'diff --git a/file b/file\n--- a/file\n+++ b/file\n' +
          patch.trimEnd() +
          '\n',
      )[0]?.hunks ?? []
    const tokens = { old: [], new: [] }
    for (const h of hunks)
      for (const c of h.changes) {
        const prefix =
          c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' '
        const line = [
          { type: 'text', value: prefix },
          ...diffTokens(c.content, language),
        ]
        if (c.type !== 'insert') tokens.old[computeOldLineNumber(c) - 1] = line
        if (c.type !== 'delete') tokens.new[computeNewLineNumber(c) - 1] = line
      }
    return { hunks, tokens }
  }, [patch, language])
  return (
    <div className="patch-scroll">
      <Diff viewType={layout} diffType="modify" {...data}>
        {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
      </Diff>
    </div>
  )
}
export default function DiffView({ step, mark, selection }) {
  const [layout, setLayout] = useState<'unified' | 'split'>('unified')
  const hunks = useMemo(
    () => step.patch.split(/^(?=@@ )/m).filter((s) => s.startsWith('@@ ')),
    [step.patch],
  )
  return (
    <div className="patch">
      <div className="code-bar">
        <strong>
          {hunks.length} {hunks.length === 1 ? 'hunk' : 'hunks'}
        </strong>
        <div className="switcher">
          {(['unified', 'split'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={v === layout}
              onClick={() => setLayout(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {hunks.map((patch, n) => (
        <PatchHunk
          key={n}
          path={'hunk:' + step.id + ':' + n}
          selected={selection.path === 'hunk:' + step.id + ':' + n}
          patch={patch}
          layout={layout}
          language={step.language ?? 'javascript'}
          comment={mark('hunk:' + step.id + ':' + n, 'Comment on hunk')}
        />
      ))}
    </div>
  )
}
function PatchHunk({ path, selected, patch, layout, language, comment }) {
  const [open, setOpen] = useState(false)
  React.useEffect(() => {
    if (selected) setOpen(true)
  }, [selected])
  return (
    <details data-guide-path={path} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{patch.split('\n', 1)[0]}</summary>
      {open && (
        <>
          <Expanded patch={patch} layout={layout} language={language} />
          {comment}
        </>
      )}
    </details>
  )
}
