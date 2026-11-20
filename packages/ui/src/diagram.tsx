import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React, { useMemo } from 'react'
import GraphCanvas from './graph-canvas'
import { graph, type WalkthroughStep } from '../../core/src/catalog'
import { Button } from './components/ui/button'
import { Icon } from './components/icon'
import { NarratedHeading, usePlaybackNarration } from './read-aloud'
import { MediaPlayControls } from './media-audio'
import { diagramPrefix } from './guide-stops'
import { useReportPlayback } from './guide-playback'
import './diagram-walkthrough.css'
export function Diagram({ item, anchor, selection }) {
  const [selected, setSelected] = React.useState(0)
  const versions = [
    {
      id: '',
      label: item.base_label ?? 'Original',
      spec: item.spec,
      resources: item.resources,
      walkthrough: item.walkthrough,
    },
    ...(item.variants ?? []),
  ]
  React.useEffect(() => {
    if (selection.type !== 'node') return
    const found = versions.findIndex(
      (v) =>
        v.id &&
        selection.path.startsWith('variant:' + encodeURIComponent(v.id) + '/'),
    )
    setSelected(found < 0 ? 0 : found)
  }, [selection])
  const v = versions[selected] ?? versions[0]
  return (
    <section className="diagram-view">
      {versions.length > 1 && (
        <div className="switcher" role="group" aria-label="Diagram variant">
          {versions.map((version, n) => (
            <button
              key={n}
              aria-pressed={selected === n}
              onClick={() => {
                setSelected(n)
                anchor({ type: 'item' })
              }}
            >
              {version.label}
            </button>
          ))}
        </div>
      )}
      {v.description && <p>{v.description}</p>}
      <Drawing
        key={v.id}
        itemId={item.id}
        versionId={v.id}
        selection={selection}
        selected={selection.path?.replace(/^variant:[^/]+\//, '')}
        spec={v.spec}
        resources={v.resources}
        walkthrough={v.walkthrough}
        anchor={(a) =>
          anchor({
            ...a,
            path:
              (v.id ? 'variant:' + encodeURIComponent(v.id) + '/' : '') +
              a.path,
          })
        }
      />
    </section>
  )
}
function Drawing({
  itemId,
  versionId,
  selection,
  spec,
  anchor,
  selected,
  resources,
  walkthrough,
}: {
  itemId: string
  versionId: string
  selection: { path?: string }
  spec: string
  anchor: (a: { type: 'node'; path: string }) => void
  selected?: string
  resources?: Record<string, { kind: string; detail?: string }>
  walkthrough?: WalkthroughStep[]
}) {
  const [step, setStep] = React.useState(0),
    [playing, setPlaying] = React.useState(false)
  const [narrating, setNarrating] = React.useState(false)
  const [played, setPlayed] = React.useState(false)
  const [silentFinished, setSilentFinished] = React.useState(false)
  const [audioFinished, setAudioFinished] = React.useState(false)
  const narration = usePlaybackNarration()
  const run = React.useRef(0)
  const audioControls = React.useRef<HTMLDivElement>(null)
  const audioPrimary = React.useRef<HTMLButtonElement>(null)
  const restoreFocus = React.useRef(false)
  const workbench = React.useRef<HTMLDivElement>(null)
  const current = walkthrough?.[step],
    count = walkthrough?.length ?? 0
  function retainControlFocus() {
    restoreFocus.current = !!audioControls.current?.contains(
      document.activeElement,
    )
  }
  React.useLayoutEffect(() => {
    if (!restoreFocus.current) return
    restoreFocus.current = false
    if (
      document.activeElement === document.body ||
      audioControls.current?.contains(document.activeElement)
    )
      audioPrimary.current?.focus({ preventScroll: true })
  }, [narrating, audioFinished])
  const stopWalkthrough = React.useCallback(() => {
    ++run.current
    narration.stop()
    setNarrating(false)
    setPlaying(false)
    setAudioFinished(false)
    setSilentFinished(false)
    setPlayed(false)
  }, [narration.stop])
  React.useEffect(() => {
    if (!playing && !narrating) return
    const stopIfHidden = () => {
      if (document.hidden || workbench.current?.closest('[hidden]'))
        stopWalkthrough()
    }
    const panelSize = new ResizeObserver(stopIfHidden)
    panelSize.observe(workbench.current)
    document.addEventListener('visibilitychange', stopIfHidden)
    return () => {
      panelSize.disconnect()
      document.removeEventListener('visibilitychange', stopIfHidden)
    }
  }, [playing, narrating, stopWalkthrough])
  React.useEffect(() => {
    stopWalkthrough()
    const match = /^walkthrough:(\d+)$/.exec(selected ?? '')
    if (match && Number(match[1]) < count) setStep(Number(match[1]))
  }, [selection, count, stopWalkthrough])
  React.useEffect(
    () => () => {
      ++run.current
    },
    [],
  )

  function playWithAudio() {
    if (
      !walkthrough?.length ||
      document.hidden ||
      workbench.current?.closest('[hidden]')
    )
      return
    const sequence = ++run.current
    setPlayed(true)
    const first = audioFinished ? 0 : step
    const captions = walkthrough
      .slice(first)
      .map((caption) => caption.label + '\n\n' + caption.description)
    // The menu is portaled; its selected option is about to unmount.
    restoreFocus.current = true
    setPlaying(false)
    setNarrating(true)
    setAudioFinished(false)
    narration.startSequence(captions, {
      onStep(index) {
        if (sequence !== run.current) return
        if (
          document.hidden ||
          !workbench.current ||
          workbench.current.closest('[hidden]')
        )
          stopWalkthrough()
        else setStep(first + index)
      },
      onEnd() {
        if (sequence !== run.current) return
        retainControlFocus()
        setNarrating(false)
        setAudioFinished(true)
      },
      onStop() {
        if (sequence !== run.current) return
        ++run.current
        retainControlFocus()
        setNarrating(false)
      },
    })
  }
  React.useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (document.hidden || workbench.current?.closest('[hidden]')) {
        setPlaying(false)
        return
      }
      const next = Math.min(step + 1, count - 1)
      setStep(next)
      if (next === count - 1) {
        setPlaying(false)
        setSilentFinished(true)
      }
    }, 4000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [step, playing, count])
  function seek(next: number) {
    stopWalkthrough()
    setStep(next)
  }
  function togglePlayback() {
    if (document.hidden || workbench.current?.closest('[hidden]')) return
    setPlayed(true)
    setSilentFinished(false)
    narration.stop()
    setAudioFinished(false)
    if (!playing && step === count - 1) setStep(0)
    setPlaying(!playing)
  }
  const model = useMemo(() => {
    const parsed = graph(spec)
    const nodes = parsed.nodes.map(([id, label], n) => ({
      id: 'node:' + id,
      label,
      kind: resources?.[id]?.kind,
      detail: resources?.[id]?.detail,
      tone: n % 3,
    }))
    const edges = Array.from(
      new Map<string, any>(
        parsed.edges.map(([a, b]) => [
          'edge:' + a + '->' + b,
          {
            id: 'edge:' + a + '->' + b,
            from: 'node:' + a,
            to: 'node:' + b,
            label: a + ' → ' + b,
          },
        ]),
      ).values(),
    )
    return { nodes, edges, horizontal: parsed.horizontal }
  }, [spec, JSON.stringify(resources)])
  const active = model.nodes.find((n) => n.id === selected)
  const replaySilent = (count > 1 && step === count - 1) || audioFinished
  const media = diagramPrefix(versionId) + 'walkthrough'
  const status = narrating
    ? narration.phase === 'loading'
      ? 'Preparing audio'
      : narration.phase === 'paused'
        ? 'Paused with audio'
        : 'Playing with audio'
    : playing
      ? 'Playing'
      : audioFinished || silentFinished
        ? 'Finished'
        : played
          ? 'Paused'
          : 'Ready to play'
  useReportPlayback(
    itemId,
    count ? media : '',
    media + ':' + step,
    status,
    narrating
      ? narration.phase === 'paused'
        ? 'Resume'
        : 'Pause'
      : playing
        ? 'Pause'
        : played && !replaySilent
          ? 'Resume'
          : 'Play',
    narrating
      ? narration.phase === 'paused'
        ? narration.resume
        : narration.pause
      : togglePlayback,
    stopWalkthrough,
  )
  const choose = (path) => {
    stopWalkthrough()
    anchor({ type: 'node', path })
  }
  return (
    <div className="graph-workbench" ref={workbench}>
      <GraphCanvas
        {...model}
        label="Infrastructure and dependency graph"
        selected={selected}
        onSelect={choose}
        highlighted={current?.targets}
        playing={playing || (narrating && narration.phase === 'playing')}
      >
        {current && (
          <section
            data-guide-path={media + ':' + step}
            className="graph-walkthrough"
            aria-label="Diagram walkthrough"
          >
            <div className="walkthrough-bar">
              <div className="walkthrough-position">
                <Icon name="layers" />
                <span>Walkthrough</span>
                <b>
                  Step {step + 1} of {count}
                </b>
              </div>
              <div
                role="group"
                aria-label="Walkthrough controls"
                className="walkthrough-controls"
              >
                {count > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous walkthrough step"
                    disabled={step === 0}
                    onClick={() => seek(step - 1)}
                  >
                    <Icon name="arrow" className="rotate-180" />
                  </Button>
                )}
                <div className="walkthrough-audio-controls" ref={audioControls}>
                  {narrating ? (
                    <>
                      <Button
                        ref={audioPrimary}
                        variant="secondary"
                        aria-label={
                          narration.phase === 'paused'
                            ? 'Resume narrated walkthrough'
                            : 'Pause narrated walkthrough'
                        }
                        onClick={
                          narration.phase === 'paused'
                            ? narration.resume
                            : narration.pause
                        }
                      >
                        <Icon
                          name={narration.phase === 'paused' ? 'play' : 'pause'}
                        />
                        {narration.phase === 'paused' ? 'Resume' : 'Pause'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Stop narrated walkthrough"
                        title="Stop narration"
                        onClick={() => {
                          retainControlFocus()
                          stopWalkthrough()
                        }}
                      >
                        <Icon name="stop" />
                      </Button>
                    </>
                  ) : (
                    <MediaPlayControls
                      menuRef={audioPrimary}
                      available={narration.available}
                      replay={audioFinished}
                      onPlayWithAudio={playWithAudio}
                    >
                      <Button
                        size="default"
                        variant="secondary"
                        aria-label={
                          playing
                            ? 'Pause walkthrough'
                            : replaySilent
                              ? 'Replay walkthrough'
                              : 'Play walkthrough'
                        }
                        onClick={togglePlayback}
                      >
                        <Icon name={playing ? 'pause' : 'play'} />
                        {playing ? 'Pause' : replaySilent ? 'Replay' : 'Play'}
                      </Button>
                    </MediaPlayControls>
                  )}
                </div>
                {count > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next walkthrough step"
                    disabled={step === count - 1}
                    onClick={() => seek(step + 1)}
                  >
                    <Icon name="arrow" />
                  </Button>
                )}
              </div>
            </div>
            <div className="walkthrough-caption">
              {narrating ? (
                <strong>{current.label}</strong>
              ) : (
                <NarratedHeading
                  key={step}
                  label="Walkthrough caption"
                  text={current.label + '\n\n' + current.description}
                  onStart={() => setPlaying(false)}
                >
                  <strong>{current.label}</strong>
                </NarratedHeading>
              )}
              <p aria-live="polite" aria-atomic="true">
                {current.description}
              </p>
            </div>
            {((narrating && narration.phase === 'loading') ||
              narration.message) && (
              <p className="walkthrough-audio-status" role="status">
                {narration.message || 'Preparing audio…'}
              </p>
            )}
            <div className="walkthrough-progress" aria-hidden="true">
              {walkthrough.map((_, i) => (
                <span key={i} data-complete={i <= step} />
              ))}
            </div>
          </section>
        )}
      </GraphCanvas>
      <div className="graph-index" role="group" aria-label="Diagram nodes">
        {model.nodes.map((n) => (
          <button
            key={n.id}
            data-guide-path={diagramPrefix(versionId) + n.id}
            aria-pressed={selected === n.id}
            onClick={() => choose(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>
      {model.edges.length > 0 && (
        <label className="edge-picker">
          Connection{' '}
          <NativeSelect
            value={model.edges.some((e) => e.id === selected) ? selected : ''}
            onChange={(e) => e.target.value && choose(e.target.value)}
          >
            <NativeSelectOption value="">
              Select a connection
            </NativeSelectOption>
            {model.edges.map((e) => (
              <NativeSelectOption key={e.id} value={e.id}>
                {e.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      )}
      {active && (
        <div className="resource-info" aria-live="polite">
          <strong>{active.label}</strong>
          {active.kind && ' · ' + active.kind}
          {active.detail && <p>{active.detail}</p>}
        </div>
      )}
    </div>
  )
}
