import React, { useRef, useState } from 'react'
import { Icon } from './components/icon'
import { Button } from './components/ui/button'

export function ConnectAgent() {
  const [feedback, setFeedback] = useState('')
  const [initiallyOpen] = useState(
    () => matchMedia('(min-width: 960px)').matches,
  )
  const field = useRef<HTMLInputElement>(null)
  const endpoint = new URL('/mcp', window.location.origin).href
  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint)
      setFeedback('Endpoint copied.')
    } catch {
      field.current?.focus()
      field.current?.select()
      setFeedback('Endpoint selected. Use your device’s copy command.')
    }
  }
  return (
    <details
      className="connect-agent"
      open={initiallyOpen}
      onToggle={(event) => {
        if (!event.currentTarget.open) setFeedback('')
      }}
    >
      <summary>
        <span className="connect-agent-icon">
          <Icon name="code" size={18} />
        </span>
        <span>Connect your agent</span>
        <Icon name="chevron-down" size={15} />
      </summary>
      <div className="connect-agent-body">
        <div>
          <label htmlFor="agent-endpoint">MCP endpoint</label>
          <div className="connect-endpoint">
            <input
              ref={field}
              id="agent-endpoint"
              value={endpoint}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={copy}>
              {feedback === 'Endpoint copied.' ? <Icon name="check" /> : null}{' '}
              Copy
            </Button>
          </div>
          <p>Add this URL to your agent as a Streamable HTTP server.</p>
          <span className="connect-feedback" role="status">
            {feedback}
          </span>
        </div>
        <div className="connect-instructions">
          <a href="/docs/agents/workflow/">
            Agent setup guide <Icon name="arrow" size={15} />
          </a>
          <p>Stdio setup, the project skill and examples for each review type.</p>
        </div>
      </div>
    </details>
  )
}
