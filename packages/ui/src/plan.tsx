import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React from 'react'
import { flatten, states } from '../../core/src/catalog'
import { Icon } from './components/icon'
export function Plan({
  item,
  values,
  change,
  anchor,
  selection,
  threads,
  open,
}) {
  const nodes = flatten(item.nodes)
  const selected =
    nodes.find((n) => selection.path === 'node:' + n.id) ?? nodes[0]
  const select = (n) => anchor({ type: 'node', path: 'node:' + n.id })
  const status = (n) => values[n.id] ?? 'proposed'
  function branch(entries, depth = 0) {
    return (
      <ol className={'plan-track ' + (depth ? 'branch' : 'trunk')}>
        {entries.map((n, index) => (
          <li key={n.id}>
            <button
              className="plan-stop"
              data-state={status(n)}
              aria-pressed={n.id === selected.id}
              onClick={() => select(n)}
            >
              <span className="station">
                {status(n) === 'approved'
                  ? '✓'
                  : status(n) === 'revise'
                    ? '↺'
                    : depth
                      ? '•'
                      : index + 1}
              </span>
              <span>{n.label}</span>
              {threads.some((c) => c.anchor.path === 'node:' + n.id) && (
                <Icon name="chat" size={14} />
              )}
            </button>
            {n.children?.length ? branch(n.children, depth + 1) : null}
          </li>
        ))}
      </ol>
    )
  }
  const index = nodes.indexOf(selected)
  return (
    <div className="plan-view">
      <div className="plan-map" aria-label="Plan outline">
        {branch(item.nodes)}
      </div>
      <section className="stage-detail" data-guide-path={'node:' + selected.id}>
        <header>
          <span>
            Stage {index + 1} of {nodes.length}
          </span>
          <div>
            <button
              aria-label="Previous stage"
              disabled={index === 0}
              onClick={() => select(nodes[index - 1])}
            >
              ←
            </button>
            <button
              aria-label="Next stage"
              disabled={index === nodes.length - 1}
              onClick={() => select(nodes[index + 1])}
            >
              →
            </button>
          </div>
        </header>
        <h3>{selected.label}</h3>
        {selected.description && <p>{selected.description}</p>}
        {selected.deliverable && (
          <p className="deliverable">
            <strong>Deliverable</strong> {selected.deliverable}
          </p>
        )}
        <div className="stage-controls">
          <label>
            Status{' '}
            <NativeSelect
              size="sm"
              disabled={!open}
              value={status(selected)}
              onChange={(e) =>
                change({
                  ...Object.fromEntries(nodes.map((n) => [n.id, status(n)])),
                  [selected.id]: e.target.value,
                })
              }
            >
              {states.map((v) => (
                <NativeSelectOption key={v}>{v}</NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {open && (
            <button
              onClick={() => {
                select(selected)
                document.getElementById('comment-' + item.id)?.focus()
              }}
            >
              <Icon name="chat" /> Annotate stage
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
