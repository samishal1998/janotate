import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { Item } from './item'
import { DecisionLog } from './log'
function App() {
  const id = location.pathname.split('/')[2],
    api = '/api/review/' + id
  const [review, setReview] = useState(null),
    [answers, setAnswers] = useState({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function load() {
    const r = await fetch(api)
    if (!r.ok) throw Error('Review unavailable')
    setReview(await r.json())
  }
  useEffect(() => {
    if (!id) return
    let alive = true
    async function refresh() {
      try {
        const r = await fetch(api)
        if (!r.ok) throw Error('Review unavailable')
        const data = await r.json()
        if (alive) setReview(data)
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id])
  function stage(key, revision, value) {
    setAnswers((old) => ({ ...old, [key]: { revision, value } }))
  }
  async function post(key, action, value) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(api + '/items/' + key + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      const data = await r.json()
      if (!r.ok) throw Error(data.error)
      setReview(data)
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    if (
      !window.confirm(
        'Cancel this review? Saved answers will stay in its history.',
      )
    )
      return
    setBusy(true)
    try {
      const r = await fetch(api + '/cancel', { method: 'POST' })
      if (!r.ok) throw Error('Could not cancel review')
      setReview(await r.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function submit() {
    const staged = Object.fromEntries(
      review.items
        .filter(
          (i) =>
            answers[i.id]?.revision === i.revision &&
            answers[i.id]?.value != null,
        )
        .map((i) => [i.id, answers[i.id].value]),
    )
    setBusy(true)
    setError('')
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged),
      })
      if (!response.ok) throw Error((await response.json()).error)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const open = review?.state === 'open'
  return (
    <>
      <header>
        <strong>Janotate</strong>
        <a href="/docs/">Documentation</a>
      </header>
      <main>
        {!id ? (
          <>
            <h1>Project reviews</h1>
            <p>Open the review link from your agent to answer its questions.</p>
            <DecisionLog />
          </>
        ) : null}
        {review && (
          <>
            <h1>{review.title}</h1>
            <p role="status">
              {open
                ? 'Open for review'
                : review.state === 'done'
                  ? 'Review submitted'
                  : review.state}
            </p>
            {review.items.map((i) => (
              <Item
                key={i.id + ':' + i.revision}
                item={i}
                review={review}
                post={post}
                stage={stage}
              />
            ))}
            {open && (
              <>
                <button disabled={busy} onClick={submit}>
                  Submit review
                </button>{' '}
                <button disabled={busy} onClick={cancel}>
                  Cancel review
                </button>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </main>
    </>
  )
}
createRoot(document.getElementById('root')).render(<App />)
