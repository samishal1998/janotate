import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  elevenLabsConfig,
  elevenLabsDefaults,
  type ElevenLabsConfig,
} from './elevenlabs.ts'
import {
  installVoicePack,
  voicePackStatus,
  type VoicePackId,
} from './voice-packs.ts'

const names = {
  kitten: 'Kitten Nano 0.8',
  kokoro: 'Kokoro 82M v1.0',
  elevenlabs: 'ElevenLabs-compatible',
} as const
type Model = VoicePackId | 'elevenlabs' | null
type Settings = {
  model: Model
  revision?: string
  elevenlabs?: ElevenLabsConfig
}

function isPackId(value: unknown): value is VoicePackId {
  return value === 'kitten' || value === 'kokoro'
}

export function readVoiceSettings(data: string): Settings {
  let contents: string
  try {
    contents = readFileSync(join(data, 'voice.json'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { model: null }
    throw err
  }
  try {
    const { model, revision, elevenlabs } = JSON.parse(contents)
    const config =
      elevenlabs === undefined ? undefined : elevenLabsConfig.parse(elevenlabs)
    if (model === null || isPackId(model) || (model === 'elevenlabs' && config))
      return { model, revision, elevenlabs: config }
  } catch {
    /* Report a generic error, since the file can contain a credential. */
  }
  throw Error('Could not read project voice settings.')
}

// A CLI and a daemon can both change this project. Hold the writer lock only
// while checking the revision and replacing the JSON, never during downloads.
function updateSelection(
  data: string,
  model?: Model,
  expected?: string,
  provider?: ElevenLabsConfig | null,
) {
  mkdirSync(data, { recursive: true, mode: 0o700 })
  const settings = join(data, 'voice.json')
  const revision = randomUUID()
  const temporary = settings + '.' + revision
  const lock = new DatabaseSync(join(data, 'voice-lock.sqlite'))
  try {
    lock.exec('PRAGMA busy_timeout=3000; BEGIN IMMEDIATE')
    const current = readVoiceSettings(data)
    if (expected !== undefined && current.revision !== expected) return
    let config = current.elevenlabs
    if (provider === null) config = undefined
    else if (provider) {
      const apiKey =
        provider.apiKey ??
        (config?.endpoint === provider.endpoint ? config?.apiKey : undefined)
      if (
        new URL(provider.endpoint).hostname === 'api.elevenlabs.io' &&
        !apiKey
      )
        throw new MissingVoicePack('Enter the API key for ElevenLabs.')
      config = { ...provider, apiKey }
    }
    if (model === 'elevenlabs' && !config)
      throw new MissingVoicePack(
        'Configure the ElevenLabs-compatible provider first.',
      )
    writeFileSync(
      temporary,
      JSON.stringify({
        model:
          model === undefined
            ? provider === null && current.model === 'elevenlabs'
              ? null
              : current.model
            : model,
        revision,
        elevenlabs: config,
      }) + '\n',
      {
        mode: 0o600,
        flag: 'wx',
      },
    )
    renameSync(temporary, settings)
    return revision
  } finally {
    lock.close()
    rmSync(temporary, { force: true })
  }
}

export class MissingVoicePack extends Error {}
export async function setProjectVoice(
  data: string,
  model: Model,
  install?: (id: VoicePackId) => Promise<unknown>,
) {
  if (isPackId(model) && !voicePackStatus(model).installed) {
    if (!install)
      throw new MissingVoicePack(
        `Voice pack missing. Run janotate voice install ${model}.`,
      )
    const intent = updateSelection(data)
    await install(model)
    if (!voicePackStatus(model).installed)
      throw Error('Voice installation did not finish.')
    updateSelection(data, model, intent)
  } else {
    updateSelection(data, model)
  }
  return readVoiceSettings(data).model
}

export function configureElevenLabs(
  data: string,
  config: ElevenLabsConfig | null,
) {
  updateSelection(data, config ? 'elevenlabs' : undefined, undefined, config)
}

export function voiceSettings(
  data: string,
  canInstall: boolean,
  canConfigure: boolean,
) {
  const { model, elevenlabs } = readVoiceSettings(data)
  return {
    model,
    elevenlabs: {
      canConfigure,
      configured: !!elevenlabs,
      ...(canConfigure && {
        endpoint: elevenlabs?.endpoint ?? elevenLabsDefaults.endpoint,
        modelId: elevenlabs?.modelId ?? elevenLabsDefaults.modelId,
        voiceId: elevenlabs?.voiceId ?? elevenLabsDefaults.voiceId,
        hasKey: !!elevenlabs?.apiKey,
      }),
    },
    packs: (['kitten', 'kokoro'] as const).map((id) => {
      const { installed, downloadBytes } = voicePackStatus(id)
      return { id, name: names[id], installed, downloadBytes }
    }),
    canInstall,
  }
}

export function voiceStatus(data: string) {
  const { model, revision } = readVoiceSettings(data)
  return {
    available:
      model === 'elevenlabs' ||
      (isPackId(model) && voicePackStatus(model).installed),
    model,
    ...(model === 'elevenlabs' && { revision }),
  }
}

export async function voiceCommand(data: string, args: string[]) {
  const [action = 'status', name] = args
  if (action === 'status' && args.length <= 1) {
    const selected = readVoiceSettings(data).model
    console.log('Project voice:', selected ? names[selected] : 'off')
    for (const model of ['kitten', 'kokoro'] as const) {
      const status = voicePackStatus(model)
      console.log(
        `${model}: ${status.installed ? 'installed' : 'not installed'} (${status.directory})`,
      )
    }
    return
  }
  if (action === 'configure-elevenlabs' && args.length === 1) {
    const config = elevenLabsConfig.safeParse({
      endpoint:
        process.env.JANOTATE_ELEVENLABS_ENDPOINT ?? elevenLabsDefaults.endpoint,
      modelId:
        process.env.JANOTATE_ELEVENLABS_MODEL_ID ?? elevenLabsDefaults.modelId,
      voiceId:
        process.env.JANOTATE_ELEVENLABS_VOICE_ID ?? elevenLabsDefaults.voiceId,
      apiKey: process.env.JANOTATE_ELEVENLABS_API_KEY,
    })
    if (!config.success)
      throw Error(
        'Check the ElevenLabs endpoint, voice ID, model ID and API key.',
      )
    configureElevenLabs(data, config.data)
    console.log(
      'The ElevenLabs-compatible voice is configured for this project.',
    )
    return
  }
  if (action === 'forget-elevenlabs' && args.length === 1) {
    configureElevenLabs(data, null)
    console.log(
      'Removed this project’s ElevenLabs-compatible settings and API key.',
    )
    return
  }
  if (action === 'off' && args.length === 1) {
    await setProjectVoice(data, null)
    console.log('Read aloud is off for this project.')
    return
  }
  if ((action !== 'install' && action !== 'use') || args.length > 2)
    throw Error(
      'Usage: janotate voice install [kitten|kokoro], use <kitten|kokoro|elevenlabs>, configure-elevenlabs, forget-elevenlabs, status, or off',
    )
  const model = name ?? (action === 'install' ? 'kitten' : undefined)
  if (action === 'use' && model === 'elevenlabs') {
    await setProjectVoice(data, model)
    console.log('The ElevenLabs-compatible voice is selected.')
    return
  }
  if (!isPackId(model)) throw Error('Choose a voice pack: kitten or kokoro')
  const selected = await setProjectVoice(
    data,
    model,
    action === 'install'
      ? (id) => installVoicePack(id, (message) => console.error(message))
      : undefined,
  )
  console.log(
    selected
      ? `Read aloud is on for this project with ${names[selected]}.`
      : 'Read aloud is off for this project.',
  )
}
