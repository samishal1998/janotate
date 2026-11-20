import React, {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Icon } from './components/icon'
import './voice-settings.css'

type Model = 'kitten' | 'kokoro' | 'elevenlabs' | null
type Pack = {
  id: 'kitten' | 'kokoro'
  name: string
  installed: boolean
  downloadBytes: number
}
type ProviderFields = { endpoint: string; modelId: string; voiceId: string }
type Settings = {
  model: Model
  packs: Pack[]
  canInstall: boolean
  elevenlabs?: Partial<ProviderFields> & {
    canConfigure: boolean
    configured: boolean
    hasKey?: boolean
  }
}

async function requestSettings(
  update?:
    | { model: Model; install?: true }
    | (ProviderFields & { apiKey?: string })
    | 'forget',
): Promise<Settings> {
  const provider = update === 'forget' || (update && 'endpoint' in update)
  const response = await fetch(
    provider ? '/api/voice/elevenlabs' : '/api/voice/settings',
    update === 'forget'
      ? { method: 'DELETE' }
      : update
        ? {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          }
        : { cache: 'no-store' },
  )
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw Error(
      data?.error ?? 'Voice settings are unavailable. Please try again.',
    )
  if (!Array.isArray(data?.packs))
    throw Error('The server returned incomplete voice settings.')
  return data
}

export function VoiceSettings() {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement>(null)
  const requestId = useRef(0)
  const updating = useRef(false)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [choice, setChoice] = useState<Model>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<ProviderFields>({
    endpoint: '',
    modelId: '',
    voiceId: '',
  })
  const [apiKey, setApiKey] = useState('')
  const provider = settings?.elevenlabs
  const editingProvider = choice === 'elevenlabs' && provider?.canConfigure
  const changedProvider =
    editingProvider &&
    (!provider.configured ||
      !!apiKey ||
      fields.endpoint !== provider.endpoint ||
      fields.modelId !== provider.modelId ||
      fields.voiceId !== provider.voiceId)
  const selected = settings?.packs.find((pack) => pack.id === choice)
  const needsInstall = !!selected && !selected.installed
  const canApply =
    settings &&
    (choice !== settings.model || needsInstall || changedProvider) &&
    (!editingProvider ||
      (fields.endpoint.trim() &&
        fields.modelId.trim() &&
        fields.voiceId.trim())) &&
    (!needsInstall || settings.canInstall)

  function populate(latest: Settings) {
    setSettings(latest)
    setChoice(latest.model)
    const config = latest.elevenlabs
    setFields({
      endpoint: config?.endpoint ?? '',
      modelId: config?.modelId ?? '',
      voiceId: config?.voiceId ?? '',
    })
    setApiKey('')
  }
  async function refresh() {
    if (updating.current) return
    const revision = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const latest = await requestSettings()
      if (revision !== requestId.current) return
      populate(latest)
    } catch (e) {
      if (revision === requestId.current) {
        setSettings(null)
        setError(e.message)
      }
    } finally {
      if (revision === requestId.current) setLoading(false)
    }
  }
  function show(from: HTMLElement) {
    if (dialog.current?.open) return
    returnFocus.current = from
    dialog.current.showModal()
    setOpen(true)
    void refresh()
  }
  const showFromPlayer = useEffectEvent((event: CustomEvent<HTMLElement>) =>
    show(event.detail),
  )
  useEffect(() => {
    const openFromPlayer = (event: Event) =>
      showFromPlayer(event as CustomEvent<HTMLElement>)
    window.addEventListener('janotate:open-voice-settings', openFromPlayer)
    return () =>
      window.removeEventListener('janotate:open-voice-settings', openFromPlayer)
  }, [])
  function close() {
    dialog.current.close()
  }
  async function save(forget = false) {
    if ((!canApply && !forget) || updating.current) return
    updating.current = true
    setError('')
    setProgress(
      needsInstall ? `Installing ${selected.name}…` : 'Saving voice settings…',
    )
    try {
      const latest = await requestSettings(
        forget
          ? 'forget'
          : changedProvider
            ? { ...fields, ...(apiKey && { apiKey }) }
            : needsInstall
              ? { model: choice, install: true }
              : { model: choice },
      )
      populate(latest)
      window.dispatchEvent(new Event('janotate:voice-change'))
      if (dialog.current?.open) {
        // The action button disappears once the choice has been saved.
        requestAnimationFrame(() =>
          dialog.current
            ?.querySelector<HTMLButtonElement>('[data-voice-done]')
            ?.focus(),
        )
      }
    } catch (e) {
      setError(e.message)
    } finally {
      updating.current = false
      setProgress('')
    }
  }
  function option(
    model: Model,
    label: string,
    detail?: string,
    disabled = false,
  ) {
    const current = settings.model === model
    const optionId = id + '-' + (model ?? 'off')
    return (
      <label
        className="voice-settings-option"
        key={model ?? 'off'}
        data-picked={choice === model || undefined}
        data-unavailable={disabled || undefined}
      >
        <input
          type="radio"
          name={id + '-choice'}
          value={model ?? 'off'}
          checked={choice === model}
          disabled={disabled}
          aria-label={label}
          aria-describedby={
            [detail && optionId + '-detail', current && optionId + '-current']
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={() => {
            setError('')
            setApiKey('')
            setChoice(model)
          }}
        />
        <span className="voice-settings-label">
          <strong>{label}</strong>
          {detail && <small id={optionId + '-detail'}>{detail}</small>}
        </span>
        {current && (
          <span id={optionId + '-current'} className="voice-settings-current">
            Current
          </span>
        )}
      </label>
    )
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="voice-settings-trigger"
        aria-label="Voice"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        title="Project voice settings"
        onClick={(event) => show(event.currentTarget)}
      >
        <Icon name="speaker" />
        <span>Voice</span>
      </Button>
      {createPortal(
        <dialog
          className="voice-settings-dialog"
          id={id}
          ref={dialog}
          aria-labelledby={id + '-title'}
          aria-describedby={id + '-scope'}
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
          onClose={() => {
            setApiKey('')
            setOpen(false)
            const origin = returnFocus.current
            if (origin?.isConnected) origin.focus()
            else trigger.current?.focus()
          }}
        >
          <div className="voice-settings-panel">
            <header className="voice-settings-heading">
              <div>
                <h2 id={id + '-title'}>Read-aloud voice</h2>
                <p id={id + '-scope'}>
                  Applies to everyone reviewing this project.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close voice settings"
                onClick={close}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </Button>
            </header>
            {loading && (
              <p role="status" className="voice-settings-note">
                Loading voice settings…
              </p>
            )}
            {!loading && settings && (
              <>
                <fieldset
                  className="voice-settings-options"
                  disabled={!!progress}
                >
                  <legend className="sr-only">Project voice</legend>
                  {option(null, 'Off')}
                  {settings.packs.map((pack) =>
                    option(
                      pack.id,
                      pack.name,
                      pack.installed
                        ? 'Installed'
                        : `${(pack.downloadBytes / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB model download`,
                      !pack.installed && !settings.canInstall,
                    ),
                  )}
                  {provider &&
                    option(
                      'elevenlabs',
                      'ElevenLabs-compatible',
                      'Send narrated passages to a speech provider.',
                      !provider.canConfigure && !provider.configured,
                    )}
                </fieldset>
                {editingProvider && (
                  <fieldset
                    className="voice-provider-fields"
                    disabled={!!progress}
                  >
                    <legend>Provider connection</legend>
                    {(
                      [
                        ['endpoint', 'API base URL'],
                        ['modelId', 'Model ID'],
                        ['voiceId', 'Voice ID'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <Input
                          type={field === 'endpoint' ? 'url' : 'text'}
                          value={fields[field]}
                          spellCheck={false}
                          autoComplete="off"
                          maxLength={field === 'endpoint' ? 2048 : 128}
                          onChange={(e) =>
                            setFields({ ...fields, [field]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      API key
                      <Input
                        type="password"
                        autoComplete="new-password"
                        spellCheck={false}
                        value={apiKey}
                        maxLength={1024}
                        placeholder={
                          provider.hasKey &&
                          fields.endpoint === provider.endpoint
                            ? 'Saved key ••••••••'
                            : 'Provider API key'
                        }
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    </label>
                    <p className="voice-settings-note">
                      Playback sends the selected passage to this endpoint and
                      may incur charges. Changing the endpoint requires entering
                      its key again.
                    </p>
                    {provider.configured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => save(true)}
                      >
                        Forget connection
                      </Button>
                    )}
                  </fieldset>
                )}
                {needsInstall && settings.canInstall && (
                  <p className="voice-settings-note">
                    The first installation also downloads the shared speech
                    runtime.
                  </p>
                )}
                {!settings.canInstall &&
                  settings.packs.some((p) => !p.installed) && (
                    <p className="voice-settings-note">
                      The server operator can install additional voices.
                    </p>
                  )}
              </>
            )}
            <div
              role="status"
              aria-live="polite"
              className="voice-settings-progress"
            >
              {progress && (
                <>
                  <span aria-hidden="true" />
                  {progress}
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="voice-settings-error">
                {error}
              </p>
            )}
            <footer className="voice-settings-footer">
              <Button variant="outline" data-voice-done onClick={close}>
                {progress ? 'Close' : canApply ? 'Cancel' : 'Done'}
              </Button>
              {!loading && !settings && error && (
                <Button onClick={refresh}>Try again</Button>
              )}
              {canApply && !loading && (
                <Button disabled={!!progress} onClick={() => save()}>
                  {changedProvider
                    ? 'Save and use provider'
                    : needsInstall
                      ? 'Install and use'
                      : choice
                        ? 'Use voice'
                        : 'Turn voice off'}
                </Button>
              )}
            </footer>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  )
}
