import { Diagram } from './diagram'
import React, { useState } from 'react'
import { columns, states } from '../../core/src/catalog'
export function Catalog({ item, values, change, anchor }) {
  const [step, setStep] = useState(0)
  const mark = (path, label) => (
    <button onClick={() => anchor({ type: 'node', path })}>{label}</button>
  )
  const select = (id, label, choices, initial = '') => (
    <label key={id}>
      {label}
      <select
        value={values[id] ?? initial}
        onChange={(e) => change({ ...values, [id]: e.target.value })}
      >
        <option value="">Choose</option>
        {choices.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  )
  const reviewed = (
    <label>
      <input
        type="checkbox"
        checked={values.review === 'reviewed'}
        onChange={(e) => change(e.target.checked ? { review: 'reviewed' } : {})}
      />{' '}
      Reviewed
    </label>
  )
  switch (item.kind) {
    case 'digest':
      return (
        <>
          {item.entries.map((e) => (
            <section key={e.id}>
              <h3>{e.label}</h3>
              <p>{e.summary}</p>
              <button onClick={() => change({ ...values, [e.id]: 'approve' })}>
                Approve
              </button>{' '}
              <button onClick={() => change({ ...values, [e.id]: 'reverse' })}>
                Reverse
              </button>
              <label>
                Answer
                <input
                  value={
                    values[e.id]?.startsWith('answer:')
                      ? values[e.id].slice(7)
                      : ''
                  }
                  onChange={(ev) =>
                    change({ ...values, [e.id]: 'answer:' + ev.target.value })
                  }
                />
              </label>
              <output>{values[e.id]}</output>
            </section>
          ))}
        </>
      )
    case 'diagram':
      return (
        <>
          <Diagram spec={item.spec} anchor={anchor} />
          {reviewed}
        </>
      )
    case 'diff': {
      const active = item.steps[step],
        hunks = active.patch
          .split(/^(?=@@ )/m)
          .filter((s) => s.startsWith('@@ '))
      return (
        <>
          <nav aria-label="Change steps">
            {item.steps.map((s, n) => (
              <button key={s.id} onClick={() => setStep(n)}>
                {s.label}
              </button>
            ))}
          </nav>
          {hunks.map((h, n) => (
            <Hunk
              key={active.id + ':' + n}
              patch={h}
              button={mark('hunk:' + active.id + ':' + n, 'Comment on hunk')}
            />
          ))}
          {select(active.id, active.label, ['approved', 'revise'])}
        </>
      )
    }
    case 'function_overview':
      return (
        <>
          {item.blocks.map((b) => (
            <details key={b.id}>
              <summary>{b.label}</summary>
              <pre>{b.code}</pre>
              {mark('block:' + b.id, 'Comment on block')}
            </details>
          ))}
          {reviewed}
        </>
      )
    case 'plan': {
      function tree(nodes) {
        return (
          <ul>
            {nodes.map((n) => (
              <li key={n.id}>
                {select(n.id, n.label, states)}{' '}
                {mark('node:' + n.id, 'Comment on node')}
                {n.children && tree(n.children)}
              </li>
            ))}
          </ul>
        )
      }
      return tree(item.nodes)
    }
    case 'matrix':
      return (
        <table>
          <caption>Weighted comparison</caption>
          <thead>
            <tr>
              <th>Option</th>
              {item.criteria.map((c) => (
                <th key={c.id}>
                  <label>
                    {c.label}
                    <input
                      type="number"
                      min="0"
                      value={values['weight:' + c.id] ?? c.weight}
                      onChange={(e) =>
                        change({
                          ...values,
                          ['weight:' + c.id]: e.target.value,
                        })
                      }
                    />
                  </label>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {item.options.map((o) => (
              <tr key={o.id}>
                <th>
                  <label>
                    <input
                      type="radio"
                      name={item.id}
                      checked={values.option === o.id}
                      onChange={() =>
                        change({
                          ...Object.fromEntries(
                            item.criteria.map((c) => [
                              'weight:' + c.id,
                              String(c.weight),
                            ]),
                          ),
                          ...values,
                          option: o.id,
                        })
                      }
                    />
                    {o.label}
                  </label>
                </th>
                {item.criteria.map((c) => (
                  <td key={c.id}>{o.scores[c.id]}</td>
                ))}
                <td>
                  {item.criteria.reduce(
                    (sum, c) =>
                      sum +
                      (o.scores[c.id] ?? 0) *
                        Number(values['weight:' + c.id] ?? c.weight),
                    0,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'scope_board':
      return (
        <div className="board">
          {columns.map((col) => (
            <section key={col}>
              <h3>{col}</h3>
              {item.cards
                .filter((c) => (values[c.id] ?? c.column) === col)
                .map((c) => (
                  <div key={c.id}>
                    {select(c.id, c.label, columns, c.column)}
                    <p>{c.reason}</p>
                  </div>
                ))}
            </section>
          ))}
        </div>
      )
    default:
      return null
  }
}
function Hunk({ patch, button }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{patch.split('\n', 1)[0]}</summary>
      {open && (
        <>
          <pre>{patch}</pre>
          {button}
        </>
      )}
    </details>
  )
}
