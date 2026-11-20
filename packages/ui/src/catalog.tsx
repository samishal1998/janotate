import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Proposal } from './proposal'
import { Ranking, Ranges, ScopeBoard } from './interactive-inputs'
import React, { useState } from 'react'
import { Plan } from './plan'
const Diagram = React.lazy(() =>
  import('./diagram').then((m) => ({ default: m.Diagram })),
)
const DiffView = React.lazy(() => import('./diff-view'))
const MotionReview = React.lazy(() => import('./motion-review'))
const PrReview = React.lazy(() => import('./pr-review'))
export const CodeEditor = React.lazy(() => import('./code-editor'))
export function Catalog({
  item,
  values,
  change,
  anchor,
  selection,
  threads,
  open,
}) {
  const [step, setStep] = useState(0)
  React.useEffect(() => {
    if (item.kind !== 'diff' || !selection.path?.startsWith('hunk:')) return
    const id = selection.path.slice(5, selection.path.lastIndexOf(':'))
    const index = item.steps.findIndex((s) => s.id === id)
    if (index >= 0) setStep(index)
  }, [item.kind, selection])
  const mark = (path, label) => (
    <button
      data-annotation-target
      disabled={!open}
      onClick={() => anchor({ type: 'node', path })}
    >
      {label}
    </button>
  )
  const select = (id, label, choices, initial = '') => (
    <label key={id} className="select-field">
      <span>{label}</span>
      <NativeSelect
        disabled={!open}
        value={values[id] ?? initial}
        onChange={(e) => change({ ...values, [id]: e.target.value })}
      >
        <NativeSelectOption value="">Choose</NativeSelectOption>
        {choices.map((v) => (
          <NativeSelectOption key={v}>{v}</NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  )
  const reviewed = (
    <label>
      <input
        disabled={!open}
        type="checkbox"
        checked={values.review === 'reviewed'}
        onChange={(e) => change(e.target.checked ? { review: 'reviewed' } : {})}
      />{' '}
      Reviewed
    </label>
  )
  switch (item.kind) {
    case 'pr_review':
      return (
        <React.Suspense fallback={<p>Opening pull request…</p>}>
          <PrReview
            key={item.report.ledgerId}
            {...{ item, values, change, anchor, selection, threads, open }}
          />
        </React.Suspense>
      )
    case 'ranking':
      return <Ranking {...{ item, values, change, open }} />
    case 'range':
      return <Ranges {...{ item, values, change, open }} />
    case 'proposal':
      return (
        <>
          <Proposal {...{ item, anchor, selection, threads, open }} />
          {reviewed}
        </>
      )
    case 'digest':
      return (
        <>
          {item.entries.map((e) => (
            <section key={e.id} data-guide-path={'entry:' + e.id}>
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
    case 'lottie':
      return (
        <>
          <React.Suspense fallback={<p>Opening animation…</p>}>
            <MotionReview
              item={item}
              anchor={anchor}
              selection={selection}
              open={open}
            />
          </React.Suspense>
          {reviewed}
        </>
      )
    case 'diagram':
      return (
        <>
          <React.Suspense fallback={<p>Opening diagram…</p>}>
            <Diagram item={item} anchor={anchor} selection={selection} />
          </React.Suspense>
          {reviewed}
        </>
      )
    case 'diff': {
      const active = item.steps[step]
      return (
        <>
          <nav aria-label="Change steps">
            {item.steps.map((s, n) => (
              <button
                key={s.id}
                aria-pressed={step === n}
                onClick={() => {
                  setStep(n)
                  anchor({ type: 'item' })
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <React.Suspense fallback={<p>Loading diff…</p>}>
            <DiffView
              key={active.id}
              step={active}
              mark={mark}
              selection={selection}
            />
          </React.Suspense>
          {select(active.id, active.label, ['approved', 'revise'])}
        </>
      )
    }
    case 'function_overview':
      return (
        <>
          {item.blocks.map((b) => (
            <details key={b.id} data-guide-path={'block:' + b.id}>
              <summary>{b.label}</summary>
              <React.Suspense fallback={<pre>{b.code}</pre>}>
                <CodeEditor
                  filename={b.label}
                  language={b.language ?? 'javascript'}
                  value={b.code}
                  readOnly
                  change={undefined}
                />
              </React.Suspense>
              {mark('block:' + b.id, 'Comment on block')}
            </details>
          ))}
          {reviewed}
        </>
      )
    case 'plan':
      return (
        <Plan
          item={item}
          values={values}
          change={change}
          anchor={anchor}
          selection={selection}
          threads={threads}
          open={open}
        />
      )
    case 'matrix':
      return (
        <table>
          <caption>Weighted comparison</caption>
          <thead>
            <tr>
              <th>Option</th>
              {item.criteria.map((c) => (
                <th key={c.id} data-guide-path={'weight:' + c.id}>
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
              <tr key={o.id} data-guide-path={'option:' + o.id}>
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
      return <ScopeBoard {...{ item, values, change, open }} />
    default:
      return null
  }
}
