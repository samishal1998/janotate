import React, { useRef, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'

export function EndReview({
  busy,
  onEnd,
}: {
  busy: boolean
  onEnd: () => Promise<void>
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')

  function confirm() {
    setError('')
    dialog.current?.showModal()
    keep.current?.focus()
  }
  async function end() {
    try {
      setError('')
      await onEnd()
    } catch {
      setError('Could not end the review. Check the connection and try again.')
    }
  }
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          ref={trigger}
          render={<Button size="icon" variant="outline" />}
          disabled={busy}
          aria-label="More review actions"
          title="More review actions"
        >
          <Icon name="more" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            align="end"
            sideOffset={5}
            className="review-menu-position"
          >
            <Menu.Popup
              className="review-menu"
              finalFocus={() => !dialog.current?.open}
            >
              <Menu.Item onClick={confirm}>End without submitting…</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <dialog
        ref={dialog}
        className="end-review-dialog"
        aria-labelledby="end-review-title"
        aria-describedby="end-review-details"
        onClose={() => trigger.current?.focus()}
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <h2 id="end-review-title">End this review without submitting?</h2>
        <p id="end-review-details">
          The agent will receive a cancelled status. Saved answers and comments
          stay in this review. Unsaved edits will be discarded.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-choices">
          <Button
            ref={keep}
            variant="outline"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Keep reviewing
          </Button>
          <Button variant="destructive" disabled={busy} onClick={end}>
            {busy ? 'Ending…' : 'End review'}
          </Button>
        </div>
      </dialog>
    </>
  )
}
