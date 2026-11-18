import React, { useEffect, useState } from 'react'
export function DecisionLog() {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState([]),
    [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/decisions?q=' + encodeURIComponent(query), {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setRows)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [query])
  return (
    <section>
      <h2>Decision log</h2>
      <label>
        Search decisions{' '}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <a href={'/review/' + r.review_id}>{r.question}</a> —{' '}
              {String(r.answer)} <small>{r.decided_at}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No matching decisions.</p>
      )}
    </section>
  )
}
