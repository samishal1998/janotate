import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React, { useState } from 'react'

import { columns } from '../../core/src/catalog'

export function Ranking({ item, values, change, open }) {
  const [dragged, setDragged] = useState(null)
  const [over, setOver] = useState(null)
  const entries = [...item.entries].sort(
    (a, b) => Number(values[a.id]) - Number(values[b.id]),
  )
  function move(id, index) {
    const ordered = entries.filter((e) => e.id !== id)
    const entry = entries.find((e) => e.id === id)
    if (!open || !entry || index < 0 || index >= entries.length) return
    ordered.splice(index, 0, entry)
    change(Object.fromEntries(ordered.map((e, n) => [e.id, String(n + 1)])))
    setOver(null)
  }
  return (
    <div className="ranking">
      <p className="input-hint">
        Drag to prioritize, or use the arrow buttons.
      </p>
      <ol>
        {entries.map((e, n) => (
          <li
            key={e.id}
            data-guide-path={'rank:' + e.id}
            data-over={e.id === over}
            draggable={open}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', e.id)
              event.dataTransfer.effectAllowed = 'move'
              setDragged(e.id)
            }}
            onDragOver={(event) => {
              if (dragged) {
                event.preventDefault()
                setOver(e.id)
              }
            }}
            onDrop={(event) => {
              if (dragged) {
                event.preventDefault()
                move(dragged, n)
              }
              setDragged(null)
            }}
            onDragEnd={() => {
              setDragged(null)
              setOver(null)
            }}
          >
            <span className="rank">{n + 1}</span>
            <div>
              <strong>{e.label}</strong>
              {e.description && <p>{e.description}</p>}
            </div>
            <div className="rank-actions">
              <button
                aria-label={'Move ' + e.label + ' up'}
                disabled={!open || n === 0}
                onClick={() => move(e.id, n - 1)}
              >
                ↑
              </button>
              <button
                aria-label={'Move ' + e.label + ' down'}
                disabled={!open || n === entries.length - 1}
                onClick={() => move(e.id, n + 1)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
export function Ranges({ item, values, change, open }) {
  return (
    <div className="scales">
      {item.scales.map((s) => (
        <label key={s.id} data-guide-path={'scale:' + s.id}>
          <span>
            {s.label}
            <output>
              {values[s.id]} {s.unit}
            </output>
          </span>
          <input
            aria-label={s.label}
            aria-valuetext={values[s.id] + ' ' + (s.unit ?? '')}
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={values[s.id]}
            disabled={!open}
            onChange={(e) => change({ ...values, [s.id]: e.target.value })}
          />
          <small>
            <span>
              {s.min} {s.unit}
            </span>
            <span>
              {s.max} {s.unit}
            </span>
          </small>
        </label>
      ))}
    </div>
  )
}

export function ScopeBoard({ item, values, change, open }) {
  const [card, setCard] = useState(null),
    [over, setOver] = useState(null)
  return (
    <div className="board">
      {columns.map((col) => {
        const cards = item.cards.filter(
          (c) => (values[c.id] ?? c.column) === col,
        )
        return (
          <section
            aria-label={col}
            key={col}
            data-over={over === col}
            onDragOver={(e) => {
              if (card) {
                e.preventDefault()
                setOver(col)
              }
            }}
            onDrop={(e) => {
              if (open && card) {
                e.preventDefault()
                change({ ...values, [card]: col })
              }
              setCard(null)
              setOver(null)
            }}
          >
            <h3>
              {col}
              <span>{cards.length}</span>
            </h3>
            {cards.map((c) => (
              <article
                key={c.id}
                data-guide-path={'card:' + c.id}
                draggable={open}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setCard(c.id)
                }}
                onDragEnd={() => {
                  setCard(null)
                  setOver(null)
                }}
              >
                <strong>{c.label}</strong>
                <p>{c.reason}</p>
                <NativeSelect
                  className="mt-2 w-full"
                  aria-label={c.label}
                  disabled={!open}
                  value={col}
                  onChange={(e) =>
                    change({ ...values, [c.id]: e.target.value })
                  }
                >
                  {columns.map((v) => (
                    <NativeSelectOption key={v}>{v}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}
