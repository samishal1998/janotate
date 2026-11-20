import React, { useRef } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'
import './media-audio.css'

export function MediaPlayControls({
  children,
  available,
  onPlayWithAudio,
  disabled,
  replay,
  menuRef,
}: {
  children: React.ReactNode
  available: boolean
  onPlayWithAudio: () => void
  disabled?: boolean
  replay?: boolean
  menuRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const localTrigger = useRef<HTMLButtonElement>(null)
  const trigger = menuRef ?? localTrigger
  const portal = useRef<HTMLElement>(null)
  const selected = useRef(false)
  function chooseAudio() {
    selected.current = true
    if (available) onPlayWithAudio()
    else
      window.dispatchEvent(
        new CustomEvent('janotate:open-voice-settings', {
          detail: trigger.current,
        }),
      )
  }
  return (
    <div className="media-play-split">
      {children}
      <Menu.Root
        onOpenChange={(open) => {
          if (open) {
            selected.current = false
            portal.current =
              (document.fullscreenElement as HTMLElement) ?? document.body
          }
        }}
      >
        <Menu.Trigger
          ref={trigger}
          render={<Button size="icon-sm" variant="secondary" />}
          disabled={disabled}
          aria-label="Playback options"
          title="Playback options"
        >
          <Icon name="chevron-down" />
        </Menu.Trigger>
        <Menu.Portal container={portal}>
          <Menu.Positioner
            className="media-play-position"
            align="end"
            sideOffset={5}
            collisionPadding={8}
          >
            <Menu.Popup
              className="media-play-menu"
              aria-label="Playback options"
              finalFocus={() => !selected.current}
            >
              <Menu.Item onClick={chooseAudio}>
                <Icon name="speaker" />
                {available
                  ? replay
                    ? 'Replay with audio'
                    : 'Play with audio'
                  : 'Set up audio'}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}
