import React, { useEffect, useState } from 'react'
import { Appearance } from './appearance'
import { VoiceSettings } from './voice-settings'
import { ConnectAgent } from './connect-agent'
import { Icon } from './components/icon'
import { buttonVariants } from './components/ui/button'
import './home.css'

type RecentReview = {
  id: string
  title: string
  mode: 'session' | 'workspace'
  updated_at: string
  item_count: number
}

const timestamp = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const reviewUrl = (id: string) =>
  '/review/' + encodeURIComponent(id) + '?view=focus'

export function Home() {
  const [reviews, setReviews] = useState<RecentReview[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || document.hidden) return
      pending = true
      try {
        const response = await fetch('/api/reviews/recent', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw Error()
        const { reviews } = await response.json()
        if (!controller.signal.aborted) {
          setReviews(reviews)
          setState('ready')
        }
      } catch {
        if (!controller.signal.aborted) setState('error')
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 15000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [retry])
  const latest = reviews[0]
  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-inner">
          <a className="wordmark" href="/" aria-label="Janotate home">
            Janotate
          </a>
          <nav aria-label="Workspace navigation">
            <a href="#open-reviews" aria-current="location">
              Reviews
            </a>
            <a href="/decisions">Decision log</a>
            <a href="/docs/" aria-label="Documentation">
              Docs
            </a>
          </nav>
          <div className="workspace-preferences">
            <Appearance />
            <VoiceSettings />
          </div>
        </div>
      </header>
      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <h1 id="home-title">Review workspace</h1>
            <p>
              Annotate plans, discuss code changes, and send decisions back to
              your coding agent.
            </p>
            <div className="home-hero-actions">
              <a
                data-slot="button"
                className={buttonVariants({ className: 'home-cta' })}
                href={latest ? reviewUrl(latest.id) : '/docs/'}
              >
                {latest ? 'Resume latest review' : 'Get started'}
                <Icon name="arrow" />
              </a>
              {latest && (
                <a className="home-guide-link" href="/docs/">
                  Quick start
                </a>
              )}
            </div>
          </div>
          <div className="home-art" aria-hidden="true">
            <div className="home-emblem" />
          </div>
        </section>
        <div className="home-workspace">
          <section
            className="home-reviews"
            id="open-reviews"
            aria-labelledby="home-reviews-title"
          >
            <div className="home-reviews-heading">
              <h2 id="home-reviews-title">Open reviews</h2>
            </div>
            {state === 'loading' && (
              <p className="home-feedback" role="status">
                Loading reviews…
              </p>
            )}
            {state === 'error' && (
              <p className="home-feedback" role="status">
                Couldn’t refresh open reviews.{' '}
                <button onClick={() => setRetry(retry + 1)}>Try again</button>
              </p>
            )}
            {state === 'ready' && !latest && (
              <div className="home-empty">
                <Icon name="layers" size={24} />
                <div>
                  <h3>No open reviews yet</h3>
                  <p>Ask your coding agent to open a review in Janotate.</p>
                </div>
                <a href="/docs/">
                  Setup guide <Icon name="arrow" />
                </a>
              </div>
            )}
            {reviews.length > 0 && (
              <ul className="home-review-list">
                {reviews.map((review) => (
                  <li key={review.id} data-mode={review.mode}>
                    <a href={reviewUrl(review.id)}>
                      <span className="home-review-icon">
                        <Icon
                          name={
                            review.mode === 'workspace' ? 'workspace' : 'chat'
                          }
                          size={18}
                        />
                      </span>
                      <span className="home-review-summary">
                        <strong>{review.title}</strong>
                        <span>
                          {review.mode === 'workspace'
                            ? 'Workspace'
                            : 'Session'}
                          <span aria-hidden="true"> · </span>
                          {review.item_count}{' '}
                          {review.item_count === 1 ? 'item' : 'items'}
                        </span>
                      </span>
                      <time dateTime={review.updated_at}>
                        {timestamp.format(new Date(review.updated_at))}
                      </time>
                      <Icon name="arrow" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <ConnectAgent />
        </div>
      </main>
    </div>
  )
}
