import { z } from 'zod'
import { VoiceServiceError, validateSpeechText } from './voice-service.ts'

export const elevenLabsDefaults = {
  endpoint: 'https://api.elevenlabs.io/v1',
  modelId: 'eleven_multilingual_v2',
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
}

function normalizeEndpoint(input: string) {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
    return null
  if (url.username || url.password || url.search || url.hash) return null
  return url.origin + (url.pathname.replace(/\/+$/, '') || '/v1')
}

export const elevenLabsConfig = z.strictObject({
  endpoint: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .transform((value, ctx) => {
      const endpoint = normalizeEndpoint(value)
      if (endpoint) return endpoint
      ctx.addIssue({
        code: 'custom',
        message:
          'Use an HTTPS API base URL or a loopback HTTP URL without credentials, query or fragment.',
      })
      return z.NEVER
    }),
  modelId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/),
  voiceId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}$/),
  apiKey: z
    .string()
    .max(1024)
    .regex(/^[\x21-\x7e]*$/)
    .optional(),
})
export type ElevenLabsConfig = z.infer<typeof elevenLabsConfig>

export function createElevenLabsService() {
  const lifetime = new AbortController()
  let active = 0
  async function synthesize(
    config: ElevenLabsConfig,
    text: string,
    client: AbortSignal,
  ) {
    validateSpeechText(text)
    if (active >= 4)
      throw new VoiceServiceError(
        'busy',
        'The speech provider is busy. Try again shortly.',
      )
    const operation = new AbortController()
    const signal = AbortSignal.any([
      client,
      lifetime.signal,
      operation.signal,
      AbortSignal.timeout(120_000),
    ])
    if (signal.aborted)
      throw new VoiceServiceError('aborted', 'Voice playback stopped.')
    active++
    let finished = false
    function finish() {
      if (finished) return
      finished = true
      active--
      signal.removeEventListener('abort', finish)
    }
    signal.addEventListener('abort', finish, { once: true })
    try {
      const url = new URL(
        config.endpoint +
          '/text-to-speech/' +
          encodeURIComponent(config.voiceId) +
          '/stream',
      )
      url.searchParams.set('output_format', 'mp3_44100_128')
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          ...(config.apiKey && { 'xi-api-key': config.apiKey }),
        },
        body: JSON.stringify({ text, model_id: config.modelId }),
      })
      if (!response.ok) {
        const status = response.status
        if (status === 401 || status === 403)
          throw new VoiceServiceError(
            'unavailable',
            'The speech provider rejected the API key or access to this voice.',
          )
        if (status === 429)
          throw new VoiceServiceError(
            'busy',
            'The speech provider reached its usage limit. Check the account or try again later.',
          )
        throw new VoiceServiceError(
          'unavailable',
          'The speech provider could not generate this clip. Check its endpoint, model and voice ID.',
        )
      }
      const type = response.headers
        .get('Content-Type')
        ?.split(';')[0]
        .trim()
        .toLowerCase()
      if (
        !response.body ||
        !['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'].includes(type)
      )
        throw new VoiceServiceError(
          'unavailable',
          'The speech provider returned an unsupported audio format.',
        )
      const limit = 8 * 1024 * 1024
      if (Number(response.headers.get('Content-Length')) > limit)
        throw new VoiceServiceError(
          'unavailable',
          'The speech provider returned an oversized clip.',
        )
      const reader = response.body.getReader()
      let size = 0
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              finish()
              controller.close()
              return
            }
            size += value.byteLength
            if (size > limit) throw Error('Clip too large')
            controller.enqueue(value)
          } catch {
            operation.abort()
            controller.error(Error('Speech playback was interrupted.'))
          }
        },
        cancel() {
          operation.abort()
        },
      })
      return new Response(body, {
        headers: {
          'Content-Type': type,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      operation.abort()
      if (client.aborted || lifetime.signal.aborted)
        throw new VoiceServiceError('aborted', 'Voice playback stopped.')
      if (error instanceof VoiceServiceError) throw error
      throw new VoiceServiceError(
        'unavailable',
        'The speech provider could not be reached. Check the endpoint and try again.',
      )
    }
  }
  return { synthesize, close: () => lifetime.abort() }
}
