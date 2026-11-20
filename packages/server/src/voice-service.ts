import { fork, type ChildProcess } from 'node:child_process'
import { getInstalledVoicePack, type VoicePackId } from './voice-packs.ts'

type Pack = Awaited<ReturnType<typeof getInstalledVoicePack>>
type ErrorCode = 'unavailable' | 'busy' | 'invalid' | 'aborted' | 'failed'
export class VoiceServiceError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

type Request = {
  model: VoicePackId
  text: string
  speaker?: number
  speed?: number
}
type Worker = { model: VoicePackId; child: ChildProcess; closed: Promise<void> }
type Job = {
  request: Required<Request>
  cancel: () => void
  cancelled: boolean
  resolve: (wav: Buffer) => void
  reject: (error: Error) => void
  worker?: Worker
}

export function validateSpeechText(text: string) {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 1600 ||
    [...text].length > 800
  )
    throw new VoiceServiceError(
      'invalid',
      'Give the voice between 1 and 800 characters.',
    )
}

function requestValues(request: Request): Required<Request> {
  const { model, text, speaker = 0, speed = 1 } = request
  if (model !== 'kitten' && model !== 'kokoro')
    throw new VoiceServiceError('invalid', 'Choose an available voice model.')
  validateSpeechText(text)
  if (
    !Number.isInteger(speaker) ||
    speaker < 0 ||
    !Number.isFinite(speed) ||
    speed < 0.5 ||
    speed > 2
  )
    throw new VoiceServiceError(
      'invalid',
      'Choose a valid speaker and a speed from 0.5 to 2.',
    )
  // A trailing newline carries the pause into the next buffered clip.
  return { model, text: text.trimStart(), speaker, speed }
}

export function createVoiceService({
  resolveModel = getInstalledVoicePack,
  idleMs = 90000,
  deadlineMs = 120000,
}: {
  resolveModel?: (id: VoicePackId) => Pack | Promise<Pack>
  idleMs?: number
  deadlineMs?: number
} = {}) {
  let worker: Worker | undefined
  let retired: Promise<void> = Promise.resolve()
  let idle: NodeJS.Timeout | undefined
  let active: Job | undefined
  let closed = false
  let sequence = 0
  const queue: Job[] = []

  function retire(instance = worker) {
    if (!instance || instance !== worker) return
    worker = undefined
    retired = instance.closed
    instance.child.kill('SIGKILL')
  }
  function launch(model: VoicePackId): Worker {
    const child = fork(new URL('./voice-worker.mjs', import.meta.url), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      execArgv: [],
    })
    const instance = {
      model,
      child,
      closed: new Promise<void>((resolve) =>
        child.once('close', () => {
          if (worker?.child === child) worker = undefined
          resolve()
        }),
      ),
    }
    // An idle child can also fail. Its close event releases the slot for a fresh process.
    child.on('error', () => {})
    return instance
  }
  function generate(
    instance: Worker,
    request: Required<Request>,
    pack: Pack,
  ): Promise<Buffer> {
    const child = instance.child
    const id = ++sequence
    return new Promise((resolve, reject) => {
      function finish(error?: Error, wav?: Buffer) {
        clearTimeout(deadline)
        child.off('message', reply)
        child.off('exit', lost)
        child.off('error', lost)
        if (error) reject(error)
        else resolve(wav)
      }
      const lost = () =>
        finish(
          new VoiceServiceError(
            'failed',
            'The local voice process stopped. Try the paragraph again.',
          ),
        )
      function reply(message) {
        if (message?.id !== id) return
        if (message.error === 'invalid' || message.error === 'failed')
          finish(new VoiceServiceError(message.error, message.message))
        else if (!Buffer.isBuffer(message.wav) || message.wav.length <= 44)
          lost()
        else finish(undefined, message.wav)
      }
      const deadline = setTimeout(() => {
        finish(
          new VoiceServiceError(
            'failed',
            'Voice synthesis timed out. Try a shorter passage.',
          ),
        )
        retire(instance)
      }, deadlineMs)
      child.on('message', reply)
      child.once('exit', lost)
      child.once('error', lost)
      try {
        child.send({ id, pack, ...request }, (error) => {
          if (error) lost()
        })
      } catch {
        lost()
      }
    })
  }
  async function drain() {
    if (active) return
    while (queue.length && !closed) {
      const job = queue.shift()
      active = job
      try {
        let pack: Pack
        try {
          pack = await resolveModel(job.request.model)
        } catch {
          throw new VoiceServiceError(
            'unavailable',
            `Install this local voice with janotate voice install ${job.request.model}.`,
          )
        }
        if (job.cancelled) continue
        if (worker && worker.model !== job.request.model) retire()
        await retired
        if (job.cancelled) continue
        worker ??= launch(job.request.model)
        job.worker = worker
        job.resolve(await generate(worker, job.request, pack))
      } catch (error) {
        if (
          job.worker &&
          (!(error instanceof VoiceServiceError) || error.code === 'failed')
        )
          retire(job.worker)
        job.reject(
          error instanceof VoiceServiceError
            ? error
            : new VoiceServiceError(
                'failed',
                'Unable to start the local voice process.',
              ),
        )
      } finally {
        active = undefined
      }
    }
    if (worker) idle = setTimeout(() => retire(), idleMs).unref()
  }
  async function synthesize(
    input: Request,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const request = requestValues(input)
    if (closed || signal?.aborted)
      throw new VoiceServiceError('aborted', 'Voice playback stopped.')
    if (queue.length >= 4)
      throw new VoiceServiceError(
        'busy',
        'Local voice is busy. Try again shortly.',
      )
    clearTimeout(idle)
    let job: Job
    const result = new Promise<Buffer>((resolve, reject) => {
      job = {
        request,
        resolve,
        reject,
        cancelled: false,
        cancel() {
          if (job.cancelled) return
          job.cancelled = true
          const index = queue.indexOf(job)
          if (index >= 0) queue.splice(index, 1)
          if (active === job && job.worker) retire(job.worker)
          reject(new VoiceServiceError('aborted', 'Voice playback stopped.'))
        },
      }
      signal?.addEventListener('abort', job.cancel, { once: true })
      queue.push(job)
      void drain()
    })
    try {
      return await result
    } finally {
      signal?.removeEventListener('abort', job.cancel)
    }
  }
  return {
    synthesize,
    close() {
      closed = true
      clearTimeout(idle)
      for (const job of queue.splice(0)) job.cancel()
      active?.cancel()
      retire()
    },
  }
}
