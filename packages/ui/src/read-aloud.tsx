import React, {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from './components/ui/button'
import { Tooltip } from '@base-ui/react/tooltip'
import { Icon } from './components/icon'
import { speechChunks } from './speech-chunks'
import './read-aloud.css'

type Playback = {
  owner: string
  phase: 'loading' | 'playing' | 'paused' | 'error'
  message?: string
}
type NarrationCallbacks = {
  onStep?: (index: number) => void
  onPlaying?: () => void
  onEnd?: () => void
  onStop?: () => void
}
type Clip = { blob: Blob } | { error: string }
type RequestedClip = {
  index: number
  receivedBytes: boolean
  result: Promise<Clip>
}
type Session = {
  owner: string
  controller: AbortController
  audio: HTMLAudioElement
  url: string | null
  current: RequestedClip | null
  ahead: RequestedClip | null
  resumeBoundary?: () => void
  callbacks: NarrationCallbacks
  paused: boolean
  ready: boolean
  playing: boolean
  playAttempt: number
}
type Player = {
  available: boolean
  playback: Playback | null
  startSequence: (
    owner: string,
    steps: string[],
    callbacks?: NarrationCallbacks,
  ) => void
  pause: (owner: string) => void
  resume: (owner: string) => void
  stop: (owner?: string) => void
}
const Voice = React.createContext<Player | null>(null)

function release(s: Session) {
  s.controller.abort()
  s.current = s.ahead = null
  s.resumeBoundary = undefined
  s.audio.onplaying = null
  s.audio.onended = null
  s.audio.onerror = null
  s.audio.pause()
  s.audio.removeAttribute('src')
  s.audio.load()
  if (s.url) URL.revokeObjectURL(s.url)
  s.url = null
}

async function prepareClip(
  reviewId: string,
  text: string,
  signal: AbortSignal,
  onFirstBytes: () => void,
): Promise<Clip> {
  try {
    const response = await fetch(
      '/api/review/' + encodeURIComponent(reviewId) + '/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      },
    )
    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      return {
        error:
          typeof details.error === 'string'
            ? details.error
            : 'Speech is unavailable. Try Listen again.',
      }
    }
    const type = response.headers
      .get('Content-Type')
      ?.split(';')[0]
      .trim()
      .toLowerCase()
    if (
      !response.body ||
      ![
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/vnd.wave',
        'audio/mpeg',
        'audio/mp3',
      ].includes(type)
    ) {
      await response.body?.cancel()
      return {
        error:
          'The voice service returned an unsupported audio format. Try Listen again.',
      }
    }
    let received = false
    const audio = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(bytes, stream) {
          if (bytes.length && !received) {
            received = true
            if (!signal.aborted) onFirstBytes()
          }
          stream.enqueue(bytes)
        },
      }),
    )
    const blob = await new Response(audio, {
      headers: { 'Content-Type': type },
    }).blob()
    return received
      ? { blob }
      : {
          error: 'The voice service returned an empty clip. Try Listen again.',
        }
  } catch {
    return {
      error: 'Could not reach the voice service. Try Listen again.',
    }
  }
}

export function ReadAloudProvider({ reviewId, destination, visit, children }) {
  const [available, setAvailable] = useState(false)
  const hasVoice = useRef(false)
  const [playback, setPlayback] = useState<Playback>(null)
  const active = useRef<Session>(null)
  const finish = useCallback(
    (s: Session, reason: 'stop' | 'end' | 'error', message?: string) => {
      if (active.current !== s) return
      // Clear ownership before notifying consumers; onEnd may start the next step.
      active.current = null
      release(s)
      setPlayback(
        reason === 'error' ? { owner: s.owner, phase: 'error', message } : null,
      )
      if (reason === 'end') s.callbacks.onEnd?.()
      else s.callbacks.onStop?.()
    },
    [],
  )
  const stop = useCallback(
    (owner?: string) => {
      const s = active.current
      if (s) {
        if (!owner || s.owner === owner) finish(s, 'stop')
      } else {
        setPlayback((prev) => (!owner || prev?.owner === owner ? null : prev))
      }
    },
    [finish],
  )

  useEffect(() => {
    if (!reviewId) return
    let request: AbortController
    let lastSelection: string | undefined
    async function refresh() {
      request?.abort()
      const controller = new AbortController()
      request = controller
      try {
        const response = await fetch('/api/voice/status', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) return
        const status = await response.json()
        if (controller.signal.aborted) return
        hasVoice.current = status.available === true
        setAvailable(hasVoice.current)
        const selection = [status.model, status.revision].join(':')
        if (
          !status.available ||
          (lastSelection !== undefined && selection !== lastSelection)
        )
          stop()
        lastSelection = selection
      } catch {
        /* A later window focus retries the status check. */
      }
    }
    const leave = () => stop()
    const voiceChanged = () => {
      stop()
      void refresh()
    }
    const hide = () => {
      if (document.hidden) stop()
    }
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('janotate:voice-change', voiceChanged)
    window.addEventListener('pagehide', leave)
    window.addEventListener('hashchange', leave)
    document.addEventListener('visibilitychange', hide)
    return () => {
      request?.abort()
      hasVoice.current = false
      stop()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('janotate:voice-change', voiceChanged)
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('hashchange', leave)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [reviewId, stop])
  useEffect(() => {
    stop()
  }, [reviewId, destination, visit, stop])

  const play = useCallback(
    async (s: Session) => {
      if (!s.ready || s.paused || active.current !== s) return
      const attempt = ++s.playAttempt
      try {
        await s.audio.play()
      } catch (error) {
        if (active.current !== s || attempt !== s.playAttempt || s.paused)
          return
        if (error.name === 'NotAllowedError') {
          s.paused = true
          setPlayback({
            owner: s.owner,
            phase: 'paused',
            message: 'Audio is ready. Press Resume to play.',
          })
        } else {
          finish(s, 'error', 'Audio could not be played. Try Listen again.')
        }
      }
    },
    [finish],
  )
  const startSequence = useCallback(
    (owner: string, steps: string[], callbacks: NarrationCallbacks = {}) => {
      const parts = steps.flatMap((step, index) =>
        speechChunks(step).map((text) => ({ text, step: index })),
      )
      if (!hasVoice.current || !parts.length) {
        callbacks.onStop?.()
        return
      }
      stop()
      if (active.current) {
        callbacks.onStop?.()
        return
      }
      const s: Session = {
        owner,
        controller: new AbortController(),
        audio: new Audio(),
        url: null,
        current: null,
        ahead: null,
        callbacks,
        paused: false,
        ready: false,
        playing: false,
        playAttempt: 0,
      }
      active.current = s
      const { signal } = s.controller
      function request(index: number): RequestedClip {
        const ticket: RequestedClip = {
          index,
          receivedBytes: false,
          result: prepareClip(reviewId, parts[index].text, signal, () => {
            ticket.receivedBytes = true
            if (s.current === ticket) prepareAhead()
          }),
        }
        return ticket
      }
      function prepareAhead() {
        const current = s.current
        if (
          !signal.aborted &&
          current?.receivedBytes &&
          !s.ahead &&
          current.index + 1 < parts.length
        )
          s.ahead = request(current.index + 1)
      }
      async function activate(index: number) {
        if (signal.aborted) return
        s.ready = false
        s.playing = false
        s.playAttempt++
        if (index === parts.length) {
          finish(s, 'end')
          return
        }
        setPlayback({ owner, phase: s.paused ? 'paused' : 'loading' })
        if (parts[index].step !== parts[index - 1]?.step)
          callbacks.onStep?.(parts[index].step)
        if (signal.aborted) return
        const pending = s.ahead ?? request(index)
        s.current = pending
        s.ahead = null
        // Bytes may already have arrived while this clip was one ahead.
        prepareAhead()
        const clip = await pending.result
        if (signal.aborted || s.current !== pending) return
        if ('error' in clip) {
          finish(s, 'error', clip.error)
          return
        }
        if (s.url) URL.revokeObjectURL(s.url)
        s.url = URL.createObjectURL(clip.blob)
        s.audio.src = s.url
        s.ready = true
        await play(s)
      }
      // Resume and buffering can both fire playing again for the same clip.
      s.audio.onplaying = () => {
        if (
          s.controller.signal.aborted ||
          !s.ready ||
          s.playing ||
          s.audio.ended
        )
          return
        if (s.paused) {
          s.audio.pause()
          return
        }
        if (s.audio.paused) return
        s.playing = true
        setPlayback({ owner, phase: 'playing' })
        callbacks.onPlaying?.()
      }
      s.audio.onended = () => {
        if (!s.audio.ended || !s.ready || !s.current) return
        s.ready = false
        const index = s.current.index + 1
        if (s.paused) s.resumeBoundary = () => void activate(index)
        else void activate(index)
      }
      s.audio.onerror = () =>
        finish(s, 'error', 'Audio could not be decoded. Try Listen again.')
      void activate(0)
    },
    [reviewId, finish, stop, play],
  )
  const pause = useCallback((owner: string) => {
    const s = active.current
    if (!s || s.owner !== owner || s.paused) return
    s.paused = true
    s.playing = false
    s.playAttempt++
    s.audio.pause()
    setPlayback({ owner: s.owner, phase: 'paused' })
  }, [])
  const resume = useCallback(
    (owner: string) => {
      const s = active.current
      if (!s || s.owner !== owner || !s.paused) return
      s.paused = false
      setPlayback({ owner, phase: 'loading' })
      if (s.resumeBoundary) {
        const activate = s.resumeBoundary
        s.resumeBoundary = undefined
        activate()
      } else void play(s)
    },
    [play],
  )
  return (
    <Voice.Provider
      value={{ available, playback, startSequence, pause, resume, stop }}
    >
      {children}
    </Voice.Provider>
  )
}

export function usePlaybackNarration() {
  const player = useContext(Voice)
  const owner = useId()
  const { startSequence, stop, pause, resume } = player ?? {}
  const controls = useMemo(
    () => ({
      start: (text: string, callbacks?: NarrationCallbacks) => {
        if (startSequence) startSequence(owner, [text], callbacks)
        else callbacks?.onStop?.()
      },
      startSequence: (steps: string[], callbacks?: NarrationCallbacks) => {
        if (startSequence) startSequence(owner, steps, callbacks)
        else callbacks?.onStop?.()
      },
      pause: () => pause?.(owner),
      resume: () => resume?.(owner),
      stop: () => stop?.(owner),
    }),
    [owner, startSequence, stop, pause, resume],
  )
  useEffect(() => controls.stop, [controls])
  const mine = player?.playback?.owner === owner ? player.playback : null
  const phase = mine?.phase ?? ('idle' as const)
  const available = player?.available ?? false
  const message = mine?.message
  return useMemo(
    () => ({ ...controls, available, phase, message }),
    [controls, available, phase, message],
  )
}

export function HeadingAction({
  label,
  icon,
  buttonRef,
  busy,
  active,
  onClick,
  annotation,
}: {
  label: string
  icon: React.ComponentProps<typeof Icon>['name']
  buttonRef?: React.Ref<HTMLButtonElement>
  busy?: boolean
  active?: boolean
  annotation?: boolean
  onClick: () => void
}) {
  const container = useRef<HTMLElement>(null)
  return (
    <Tooltip.Root
      onOpenChange={(open) => {
        if (open)
          container.current =
            (document.fullscreenElement as HTMLElement) || document.body
      }}
    >
      <Tooltip.Trigger
        delay={400}
        render={
          <Button
            ref={buttonRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="heading-action"
            aria-label={label}
            aria-disabled={busy || undefined}
            data-active={active || undefined}
            data-annotation-target={annotation || undefined}
            onClick={onClick}
          >
            <Icon name={icon} />
          </Button>
        }
      />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner
          className="heading-tip-position"
          side="top"
          sideOffset={5}
          collisionPadding={8}
        >
          <Tooltip.Popup role="tooltip" className="heading-tip">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function NarratedHeading({
  text,
  label,
  onStart,
  children,
  trailingAction,
}: {
  text: string
  label: string
  onStart?: () => void
  children: React.ReactNode
  trailingAction?: React.ReactNode
}) {
  const player = usePlaybackNarration()
  const owner = useId()
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => () => player.stop(), [text, player.stop])
  const enabled = player.available && !!text.trim()
  const { phase, message } = player
  const name =
    phase === 'loading'
      ? 'Preparing audio for ' + label
      : phase === 'playing'
        ? 'Pause reading ' + label
        : phase === 'paused'
          ? 'Resume reading ' + label
          : 'Listen to ' + label
  function activate() {
    if (phase === 'loading') return
    if (phase === 'playing') player.pause()
    else if (phase === 'paused') player.resume()
    else {
      onStart?.()
      player.start(text)
    }
  }
  return (
    <div className="narrated-heading">
      <div className="narrated-title">{children}</div>
      {(enabled || trailingAction) && (
        <div className="heading-tools">
          {enabled && (
            <div
              className="read-aloud"
              role="group"
              aria-label={'Read aloud · ' + label}
              aria-describedby={owner}
            >
              <HeadingAction
                buttonRef={primary}
                label={name}
                icon={
                  phase === 'playing'
                    ? 'pause'
                    : phase === 'paused'
                      ? 'play'
                      : 'speaker'
                }
                busy={phase === 'loading'}
                active={
                  phase === 'loading' ||
                  phase === 'playing' ||
                  phase === 'paused'
                }
                onClick={activate}
              />
              {(phase === 'loading' ||
                phase === 'playing' ||
                phase === 'paused') && (
                <HeadingAction
                  label={'Stop reading ' + label}
                  icon="stop"
                  onClick={() => {
                    player.stop()
                    primary.current?.focus()
                  }}
                />
              )}
            </div>
          )}
          {trailingAction}
        </div>
      )}
      {enabled && (
        <span
          id={owner}
          role="status"
          className={message ? 'narration-status' : 'sr-only'}
        >
          {phase === 'loading' ? 'Preparing audio…' : message}
        </span>
      )}
    </div>
  )
}
