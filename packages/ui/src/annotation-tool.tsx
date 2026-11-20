import React, { createContext, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'

export const AnnotationMode = createContext(false)

export function AnnotationTool({ active, onChange }) {
  useEffect(() => {
    if (!active) return
    function exit(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onChange(false)
    }
    window.addEventListener('keydown', exit)
    return () => window.removeEventListener('keydown', exit)
  }, [active, onChange])
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'outline'}
      aria-pressed={active}
      className="annotate-tool"
      title="Click an annotation target or select a passage. Press Escape to exit."
      onClick={() => onChange(!active)}
    >
      <Icon name="chat" /> Annotate
      {active && <kbd aria-hidden="true">Esc</kbd>}
    </Button>
  )
}
