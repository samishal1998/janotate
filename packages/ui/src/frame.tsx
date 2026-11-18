import React, { useEffect, useState, useRef } from 'react'
export function HtmlFrame({ review, item }) {
  const ref = useRef<HTMLIFrameElement>(null),
    [height, setHeight] = useState(190)
  const [url, setUrl] = useState(''),
    [message, setMessage] = useState('Loading form')
  useEffect(() => {
    const base = '/api/review/' + review + '/items/' + item
    const controller = new AbortController(),
      signal = controller.signal
    async function load() {
      const r = await fetch(base + '/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal,
      })
      if (!r.ok) throw Error('Form unavailable')
      setUrl((await r.json()).url)
    }
    async function status() {
      const r = await fetch(base + '/frame-status', { signal })
      setMessage((await r.json()).message)
    }
    const error = (e) => {
      if (!signal.aborted) setMessage(e.message)
    }
    function onMessage(event: MessageEvent) {
      if (
        event.source !== ref.current?.contentWindow ||
        event.origin !== 'null' ||
        !event.data
      )
        return
      if (event.data.type === 'resize' && Number.isFinite(event.data.height))
        setHeight(Math.max(100, Math.min(1200, event.data.height)))
      if (event.data.type === 'submit') status().catch(error)
    }
    window.addEventListener('message', onMessage)
    load().catch(error)
    const timer = setInterval(() => status().catch(error), 350)
    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [review, item])
  return (
    <>
      {url && (
        <iframe
          ref={ref}
          style={{ height }}
          title="Review form"
          sandbox="allow-scripts allow-forms"
          src={url}
        />
      )}
      <p role="status">{message}</p>
    </>
  )
}
