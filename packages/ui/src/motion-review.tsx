import React, { useEffect, useRef, useState } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'
import { MediaPlayControls } from './media-audio'
import { usePlaybackNarration } from './read-aloud'
import { AnnotationMode } from './annotation-tool'
import { motionMarkers } from './guide-stops'
import { useReportPlayback } from './guide-playback'

export default function MotionReview({ item, open, anchor, selection }) {
  // Item is remounted on revision. Live discussion refreshes must preserve the playhead.
  const [animation] = useState(() => item.animation)
  const caption: string = item.caption?.trim() || animation.nm?.trim() || ''
  const narration = usePlaybackNarration()
  const annotating = React.useContext(AnnotationMode)
  const first = animation.ip,
    last = animation.op - 1
  const container = useRef<HTMLDivElement>(null)
  const player = useRef<AnimationItem>(null)
  const [frame, setFrame] = useState(first)
  const [playing, setPlaying] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [rangeStart, setRangeStart] = useState<number | null>(null)
  const [withAudio, setWithAudio] = useState(false)
  const run = useRef<{ framesEnded: boolean; speechEnded: boolean } | null>(
    null,
  )
  const stopVoice = useRef(narration.stop)
  stopVoice.current = narration.stop
  const transport = useRef<HTMLButtonElement>(null),
    audioButton = useRef<HTMLButtonElement>(null),
    stopButton = useRef<HTMLButtonElement>(null)
  const moveFocus = useRef<'transport' | 'audio' | null>(null)
  React.useLayoutEffect(() => {
    if (moveFocus.current === 'transport')
      transport.current?.focus({ preventScroll: true })
    if (moveFocus.current === 'audio')
      audioButton.current?.focus({ preventScroll: true })
    moveFocus.current = null
  }, [withAudio])
  function finishRun() {
    if (!run.current) return
    if (
      !document.hidden &&
      !container.current?.closest('[hidden]') &&
      (document.activeElement === transport.current ||
        document.activeElement === stopButton.current)
    )
      moveFocus.current = 'audio'
    run.current = null
    setWithAudio(false)
  }
  function pauseFrames() {
    player.current?.pause()
    setPlaying(false)
  }
  function stopBoth() {
    if (run.current) {
      finishRun()
      stopVoice.current()
    }
    pauseFrames()
  }
  function seek(next: number) {
    stopBoth()
    setCompleted(false)
    const bounded = Math.max(first, Math.min(last, next))
    player.current?.goToAndStop(bounded - first, true)
    setFrame(bounded)
  }
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pauseForMotion = () => {
      if (motion.matches) stopBoth()
    }
    const pauseInBackground = () => {
      if (document.hidden) stopBoth()
    }
    const voiceChanged = () => {
      if (run.current) stopBoth()
    }
    // A visited review panel stays mounted when focus or the Threads view hides it.
    const panelSize = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === 0 || entry.contentRect.height === 0)
        stopBoth()
    })
    const fail = () => {
      stopBoth()
      setError(true)
      setReady(false)
    }
    try {
      const instance = lottie.loadAnimation({
        container: container.current,
        renderer: 'svg',
        autoplay: false,
        loop: false,
        animationData: { assets: [], ...structuredClone(animation) },
        rendererSettings: { focusable: false },
      })
      player.current = instance
      instance.setSubframe(false)
      instance.addEventListener('DOMLoaded', () => setReady(true))
      instance.addEventListener('enterFrame', (e) =>
        setFrame(first + Math.floor(e.currentTime)),
      )
      instance.addEventListener('complete', () => {
        setPlaying(false)
        setCompleted(true)
        if (run.current) {
          run.current.framesEnded = true
          if (run.current.speechEnded) finishRun()
        }
      })
      instance.addEventListener('error', fail)
      instance.addEventListener('data_failed', fail)
      if (instance.isLoaded) setReady(true)
    } catch {
      fail()
    }
    motion.addEventListener('change', pauseForMotion)
    document.addEventListener('visibilitychange', pauseInBackground)
    window.addEventListener('janotate:voice-change', voiceChanged)
    panelSize.observe(container.current)
    return () => {
      panelSize.disconnect()
      document.removeEventListener('visibilitychange', pauseInBackground)
      window.removeEventListener('janotate:voice-change', voiceChanged)
      motion.removeEventListener('change', pauseForMotion)
      player.current?.destroy()
      player.current = null
      run.current = null
      stopVoice.current()
    }
  }, [animation, first])
  useEffect(() => {
    const match = /^(?:frame:(\d+)|frames:(\d+)-(\d+))$/.exec(
      selection.path ?? '',
    )
    if (!ready || !match) return
    const start = Number(match[1] ?? match[2])
    if (start < first || start > last) return
    seek(start)
    setRangeStart(null)
  }, [selection, ready, first, last])
  useEffect(() => {
    if (annotating && run.current) stopBoth()
  }, [annotating])
  useEffect(() => {
    if (!run.current) return
    if (!narration.available) stopBoth()
    else if (narration.phase === 'loading' || narration.phase === 'paused')
      pauseFrames()
  }, [narration.phase, narration.available])
  function playWithAudio() {
    if (!caption || !narration.available || !ready) return
    seek(first)
    const session = { framesEnded: false, speechEnded: false }
    run.current = session
    moveFocus.current = 'transport'
    setWithAudio(true)
    narration.start(caption, {
      onPlaying() {
        if (run.current !== session || session.framesEnded) return
        player.current?.play()
        setPlaying(true)
      },
      onEnd() {
        if (run.current !== session) return
        session.speechEnded = true
        if (session.framesEnded) finishRun()
      },
      onStop() {
        if (run.current !== session) return
        finishRun()
        pauseFrames()
      },
    })
  }
  const paused =
    withAudio &&
    (narration.phase === 'paused' || (run.current?.speechEnded && !playing))
  function play() {
    if (document.hidden || container.current?.closest('[hidden]')) return
    if (run.current) {
      if (paused) {
        if (run.current.speechEnded) {
          player.current.play()
          setPlaying(true)
        } else narration.resume()
      } else {
        pauseFrames()
        if (!run.current.speechEnded) narration.pause()
      }
      return
    }
    if (narration.phase === 'error') narration.stop()
    if (!playing) setCompleted(false)
    if (playing) player.current.pause()
    else if (frame === last) player.current.goToAndPlay(0, true)
    else player.current.play()
    setPlaying(!playing)
  }
  const markers = React.useMemo(() => motionMarkers(animation), [animation])
  const location =
    markers.find((m) => frame >= m.start && frame <= m.end)?.path ??
    (markers.length ? '' : 'frame:' + first)
  const phase = error
    ? 'Unavailable'
    : !ready
      ? 'Loading'
      : paused
        ? 'Paused with audio'
        : withAudio && narration.phase === 'loading'
          ? 'Preparing audio'
          : withAudio
            ? 'Playing with audio'
            : playing
              ? 'Playing'
              : completed
                ? 'Finished'
                : frame === first
                  ? 'Ready to play'
                  : 'Paused'
  useReportPlayback(
    item.id,
    'animation',
    location,
    phase,
    !ready || error
      ? ''
      : paused
        ? 'Resume'
        : withAudio || playing
          ? 'Pause'
          : 'Play',
    play,
    stopBoth,
  )
  const start = Math.min(frame, rangeStart ?? frame)
  const end = Math.max(frame, rangeStart ?? frame)
  const range = rangeStart !== null && start !== end
  function comment() {
    seek(frame)
    anchor({
      type: 'node',
      path: range ? `frames:${start}-${end}` : `frame:${frame}`,
    })
    requestAnimationFrame(() =>
      document.getElementById('comment-' + item.id)?.focus(),
    )
  }
  const primaryPlay = (
    <Button ref={transport} size="sm" onClick={play} disabled={!ready}>
      {withAudio ? (paused ? 'Resume' : 'Pause') : playing ? 'Pause' : 'Play'}
    </Button>
  )
  return (
    <div className="motion-review" data-guide-path={location}>
      <div
        className="motion-stage"
        ref={container}
        role="img"
        aria-label={animation.nm ?? item.title}
      />
      {caption && (
        <p className="motion-caption m-0 whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]">
          {caption}
        </p>
      )}
      {error ? (
        <p role="alert">
          This animation could not be rendered. Ask the agent to check its
          vector geometry.
        </p>
      ) : (
        <>
          <div className="motion-readout">
            <strong>Frame {frame}</strong>
            <span>
              {((frame - first) / animation.fr).toFixed(2)} s /{' '}
              {((last - first + 1) / animation.fr).toFixed(2)} s ·{' '}
              {animation.fr} fps
            </span>
          </div>
          <input
            aria-label="Animation frame"
            type="range"
            min={first}
            max={last}
            step={1}
            value={frame}
            aria-valuetext={`Frame ${frame}`}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={!ready}
          />
          <div
            className="motion-controls"
            role="group"
            aria-label="Animation playback"
          >
            {caption && !withAudio ? (
              <MediaPlayControls
                available={narration.available}
                onPlayWithAudio={playWithAudio}
                replay={frame === last}
                disabled={!ready}
                menuRef={audioButton}
              >
                {primaryPlay}
              </MediaPlayControls>
            ) : (
              primaryPlay
            )}
            {withAudio && (
              <Button
                ref={stopButton}
                size="sm"
                variant="outline"
                onClick={stopBoth}
              >
                Stop
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => seek(frame - 1)}
              disabled={!ready || frame <= first}
            >
              Previous frame
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seek(frame + 1)}
              disabled={!ready || frame >= last}
            >
              Next frame
            </Button>
          </div>
          {((withAudio && narration.phase === 'loading') ||
            narration.message) && (
            <p role="status" className="m-0 text-sm text-[var(--muted)]">
              {narration.message || 'Preparing audio…'}
            </p>
          )}
          {open && (
            <div
              className="motion-controls"
              role="group"
              aria-label="Animation annotation"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={comment}
                disabled={!ready}
                data-annotation-target
              >
                <Icon name="chat" />
                {range
                  ? `Comment on frames ${start}–${end}`
                  : `Comment on frame ${frame}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!ready}
                aria-pressed={rangeStart !== null}
                onClick={() => {
                  seek(frame)
                  setRangeStart(rangeStart === null ? frame : null)
                }}
              >
                {rangeStart === null
                  ? 'Mark range start'
                  : `Clear start at ${rangeStart}`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
