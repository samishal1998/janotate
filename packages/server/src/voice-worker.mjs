import { availableParallelism } from 'node:os'
import { createRequire } from 'node:module'
import { speechPhrases } from '../../core/src/speech-phrases.mjs'

const require = createRequire(import.meta.url)
let engine
let native

function wave(samples, sampleRate) {
  if (
    !(samples instanceof Float32Array) ||
    sampleRate !== 24000 ||
    !samples.length
  )
    throw new Error('The voice produced no playable audio.')
  if (samples.length > 120 * sampleRate)
    throw new RangeError('Split this paragraph into shorter passages.')
  const dataSize = samples.length * 2
  const bytes = Buffer.allocUnsafe(44 + dataSize)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataSize, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(2 * sampleRate, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataSize, 40)
  let audible = false
  for (let index = 0; index < samples.length; index++) {
    const f = samples[index]
    if (!Number.isFinite(f))
      throw new Error('The voice generated an invalid audio sample.')
    const sample = Math.round(
      Math.max(-1, Math.min(1, f)) * (f < 0 ? 32768 : 32767),
    )
    audible ||= sample !== 0
    bytes.writeInt16LE(sample, 44 + 2 * index)
  }
  if (!audible) throw new Error('The voice produced silence for this passage.')
  return bytes
}

function narrate(text, generationConfig) {
  const rate = 24000
  const parts = []
  let length = 0
  for (const phrase of speechPhrases(text)) {
    const { samples, sampleRate } = engine.generate({
      text: phrase.text,
      generationConfig,
    })
    if (
      sampleRate !== rate ||
      !(samples instanceof Float32Array) ||
      !samples.length
    )
      throw Error('The voice produced no playable audio.')
    let first = 0,
      last = samples.length
    // Replace quiet padding at internal boundaries so the model's own padding
    // and our pause do not stack. Keep breaths and other audible samples.
    if (parts.length)
      while (first < last && Math.abs(samples[first]) < 0.0005) first++
    if (phrase.pauseMs)
      while (last > first && Math.abs(samples[last - 1]) < 0.0005) last--
    const clip = samples.subarray(first, last)
    const silence = Math.round((rate * phrase.pauseMs) / 1000)
    length += clip.length + silence
    if (length > 120 * rate)
      throw new RangeError('Split this paragraph into shorter passages.')
    parts.push({ clip, silence })
  }
  const combined = new Float32Array(length)
  let offset = 0
  for (const { clip, silence } of parts) {
    combined.set(clip, offset)
    offset += clip.length + silence
  }
  return wave(combined, rate)
}

process.on('message', ({ id, pack, text, speaker, speed }) => {
  try {
    if (!engine) {
      native = require(pack.runtimePath)
      const files = {
        model: pack.model,
        voices: pack.voices,
        tokens: pack.tokens,
        dataDir: pack.dataDir,
      }
      if (pack.id === 'kokoro') {
        files.lang = 'en-us'
        if (pack.lexicon) files.lexicon = pack.lexicon
      }
      engine = new native.OfflineTts({
        model: {
          [pack.id]: files,
          numThreads: Math.min(2, availableParallelism()),
          provider: 'cpu',
          debug: false,
        },
        maxNumSentences: 1,
      })
    }
    if (speaker >= engine.numSpeakers)
      throw new RangeError('Choose an available speaker.')
    const generationConfig = new native.GenerationConfig({
      sid: speaker,
      speed,
    })
    process.send({ id, wav: narrate(text, generationConfig) })
  } catch (error) {
    const invalid = error instanceof RangeError
    process.send({
      id,
      error: invalid ? 'invalid' : 'failed',
      message: invalid
        ? error.message
        : 'The local voice could not generate audio.',
    })
  }
})

process.on('disconnect', () => process.exit(0))
