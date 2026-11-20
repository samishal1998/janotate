import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createVoiceService } from '../packages/server/src/voice-service.ts'
import type { VoicePackId } from '../packages/server/src/voice-packs.ts'

// This fixture runs inside the real forked worker. It makes lifetime, PCM encoding
// and failure paths deterministic without installing either optional voice pack.
function fixture(options: { idleMs?: number; deadlineMs?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'janotate-tts-'))
  const runtimePath = join(directory, 'binding.cjs'),
    log = join(directory, 'events.jsonl')
  writeFileSync(log, '')
  writeFileSync(
    runtimePath,
    `
const { appendFileSync } = require('node:fs')
const record = (entry) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({ ...entry, pid:process.pid })+'\\n')
exports.GenerationConfig = class { constructor(options){ Object.assign(this,options) } }
exports.OfflineTts = class {
  constructor(config) { this.numSpeakers = 8; record({type:'load',config}) }
  generate({text,generationConfig}) {
    record({type:'speak',text,generationConfig})
    if (text === 'block') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000)
    if (text === 'exit') process.exit(30)
    const samples = text === 'long'
      ? new Float32Array(24000 * 120 + 1)
      : new Float32Array(text === 'invalid sample' ? [NaN] : [-1,0,0.5,1])
    return {samples,sampleRate:24000}
  }
}
`,
  )
  const pack = (id: VoicePackId) => ({
    id,
    directory,
    model: join(directory, id + '.onnx'),
    tokens: join(directory, 'tokens.txt'),
    dataDir: join(directory, 'espeak-ng-data'),
    voices: join(directory, 'voices.bin'),
    runtimePath,
    lexicon: id === 'kokoro' ? join(directory, 'en.txt') : undefined,
  })
  const service = createVoiceService({ ...options, resolveModel: pack })
  const events = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  return {
    ...service,
    events,
    dispose() {
      service.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

async function until(check: () => boolean) {
  const end = Date.now() + 5000
  while (!check()) {
    if (Date.now() > end) assert.fail('Timed out waiting for the voice worker')
    await delay(15)
  }
}

test('voice worker lazily loads the selected engine, returns PCM WAV, and releases on model change or idle', async () => {
  const service = fixture({ idleMs: 100 })
  try {
    assert.deepEqual(service.events(), [])
    const wav = await service.synthesize({
      model: 'kitten',
      text: 'First paragraph',
      speaker: 4,
      speed: 1.2,
    })
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
    assert.equal(wav.subarray(8, 16).toString(), 'WAVEfmt ')
    assert.equal(wav.readUInt32LE(4), wav.length - 8)
    assert.equal(wav.readUInt32LE(24), 24000)
    assert.equal(wav.readUInt16LE(22), 1)
    assert.equal(wav.readUInt16LE(34), 16)
    assert.equal(wav.readUInt32LE(40), wav.length - 44)
    assert.deepEqual(
      [44, 46, 48, 50].map((i) => wav.readInt16LE(i)),
      [-32768, 0, 16384, 32767],
    )
    const [load, speak] = service.events()
    assert.equal(load.config.model.provider, 'cpu')
    assert.match(load.config.model.kitten.dataDir, /espeak-ng-data$/)
    assert.deepEqual(speak.generationConfig, { sid: 4, speed: 1.2 })
    await service.synthesize({ model: 'kitten', text: 'Second paragraph' })
    assert.equal(service.events().filter((e) => e.type === 'load').length, 1)
    await service.synthesize({ model: 'kokoro', text: 'Another model' })
    const kokoro = service.events().find((e) => e.config?.model.kokoro)
    assert.equal(kokoro.config.model.kokoro.lang, 'en-us')
    assert.match(kokoro.config.model.kokoro.lexicon, /en\.txt$/)
    const gone = (pid) => {
      try {
        process.kill(pid, 0)
        return false
      } catch (error) {
        return error.code === 'ESRCH'
      }
    }
    assert(gone(load.pid), 'Switching must release the previous engine first')
    await until(() => gone(kokoro.pid))
    await service.synthesize({ model: 'kokoro', text: 'Return after idle' })
    assert.equal(service.events().filter((e) => e.type === 'load').length, 3)
  } finally {
    service.dispose()
  }
})

test('synthesis remains cancellable during native work and drains the bounded queue after abort or worker crash', async () => {
  const service = fixture()
  try {
    const active = new AbortController(),
      queued = new AbortController()
    const busy = service.synthesize(
      { model: 'kitten', text: 'block' },
      active.signal,
    )
    await until(() => service.events().some((e) => e.text === 'block'))
    const cancelled = service.synthesize(
      { model: 'kitten', text: 'queued then cancelled' },
      queued.signal,
    )
    const survivors = Array.from({ length: 3 }, (_, i) =>
      service.synthesize({ model: 'kitten', text: 'queued ' + i }),
    )
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'too many' }),
      { code: 'busy' },
    )
    queued.abort()
    await assert.rejects(cancelled, { code: 'aborted' })
    active.abort()
    await assert.rejects(busy, { code: 'aborted' })
    await Promise.all(survivors)
    assert(!service.events().some((e) => e.text === 'queued then cancelled'))
    assert.equal(service.events().filter((e) => e.type === 'load').length, 2)
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'exit' }),
      { code: 'failed' },
    )
    await service.synthesize({ model: 'kitten', text: 'Recovered' })
    const final = service.synthesize({ model: 'kitten', text: 'block' })
    const pending = service.synthesize({
      model: 'kitten',
      text: 'close while queued',
    })
    service.close()
    await Promise.all(
      [final, pending].map((p) => assert.rejects(p, { code: 'aborted' })),
    )
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'Closed' }),
      { code: 'aborted' },
    )
  } finally {
    service.dispose()
  }
})

test('voice input, output and native runtime time are bounded, including Unicode text', async () => {
  const missing = createVoiceService({
    resolveModel: () => {
      throw Error('missing')
    },
  })
  try {
    await assert.rejects(
      missing.synthesize({ model: 'kitten', text: 'Hello' }),
      {
        code: 'unavailable',
        message: /janotate voice install kitten/,
      },
    )
  } finally {
    missing.close()
  }
  const service = fixture({ deadlineMs: 1200 })
  try {
    for (const text of ['', '😀'.repeat(801)])
      await assert.rejects(service.synthesize({ model: 'kitten', text }), {
        code: 'invalid',
      })
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'test', speed: Infinity }),
      { code: 'invalid' },
    )
    assert.deepEqual(service.events(), [])
    await service.synthesize({ model: 'kitten', text: '😀'.repeat(800) })
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'test', speaker: 8 }),
      { code: 'invalid' },
    )
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'long' }),
      { code: 'invalid' },
    )
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'invalid sample' }),
      { code: 'failed' },
    )
    await assert.rejects(
      service.synthesize({ model: 'kitten', text: 'block' }),
      { code: 'failed', message: /timed out/ },
    )
    await service.synthesize({ model: 'kitten', text: 'Recovered' })
  } finally {
    service.dispose()
  }
})

test('speech preserves punctuation and encodes distinct sentence, line and paragraph pauses in the WAV', async () => {
  const service = fixture()
  try {
    const text = 'Dr. Lee marked v1.2, then waited. “Ready?”\r\nGo\u2029End.'
    for (const model of ['kitten', 'kokoro'] as const) {
      const before = service.events().length
      const wav = await service.synthesize({ model, text })
      const spoken = service
        .events()
        .slice(before)
        .filter((e) => e.type === 'speak')
      assert.deepEqual(
        spoken.map((e) => e.text),
        ['Dr. Lee marked v1.2,', 'then waited.', '“Ready?”', 'Go', 'End.'],
      )
      let offset = 44
      for (const milliseconds of [120, 300, 450, 700, 300]) {
        assert.equal(wav.readInt16LE(offset), -32768)
        offset += 8 // each fixture utterance emits four PCM16 samples
        const end = offset + milliseconds * 24 * 2
        assert.equal(
          wav.subarray(offset, end).some((byte) => byte !== 0),
          false,
        )
        offset = end
      }
      assert.equal(offset, wav.length)
    }
    const tail = await service.synthesize({
      model: 'kitten',
      text: 'Keep this paragraph break\n\n',
    })
    assert.equal(tail.readUInt32LE(40), 8 + 700 * 24 * 2)
  } finally {
    service.dispose()
  }
})
