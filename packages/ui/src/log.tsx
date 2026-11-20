import React, { useEffect, useState } from 'react'
import { Icon } from './components/icon'
import { Input } from './components/ui/input'

const decisionDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function DecisionLog() {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState([]),
    [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/decisions?q=' + encodeURIComponent(query), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error('Unable to load decisions.')
        const result = await response.json()
        if (!controller.signal.aborted) {
          setRows(result)
          setError('')
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [query])
  return (
    <section className="decision-log">
      <header className="log-heading">
        <h1>Decision log</h1>
        <label className="log-search">
          <Icon name="search" />
          <Input
            type="search"
            aria-label="Search decisions"
            placeholder="Search decisions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : rows.length ? (
        <ul className="log-list">
          {rows.map((r) => (
            <li key={r.id}>
              <a
                href={
                  '/review/' + r.review_id + '?view=focus#item-' + r.item_id
                }
              >
                <span className="log-outcome">
                  <Icon name="check" />
                </span>
                <div className="log-entry">
                  <strong>{r.question}</strong>
                  <span>{String(r.answer)}</span>
                </div>
                <time dateTime={r.decided_at} title={r.decided_at}>
                  {decisionDate.format(new Date(r.decided_at))}
                </time>
                <Icon name="chevron-right" size={15} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="log-empty">
          <span className="log-empty-icon">
            <Icon name={query ? 'search' : 'log'} size={25} />
          </span>
          <p>
            {query
              ? 'No decisions match this search.'
              : 'Confirmed workspace decisions will appear here.'}
          </p>
          {query ? (
            <button type="button" onClick={() => setQuery('')}>
              Clear search
            </button>
          ) : (
            <a href="/">
              Browse reviews <Icon name="arrow" size={14} />
            </a>
          )}
        </div>
      )}
    </section>
  )
}
