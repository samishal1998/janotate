import assert from 'node:assert/strict'
import { getInstalledVoicePack } from '../packages/server/src/voice-packs.ts'
import { createVoiceService } from '../packages/server/src/voice-service.ts'

const [model = 'kitten', ...extra] = process.argv.slice(2)
if (extra.length || (model !== 'kitten' && model !== 'kokoro'))
  throw Error('Usage: node tests/voice.bench.ts [kitten|kokoro]')
getInstalledVoicePack(model)

function audioSeconds(wav: Buffer) {
  assert(wav.length > 44)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(4), wav.length - 8)
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ')
  assert.equal(wav.readUInt16LE(20), 1, 'Expected linear PCM')
  assert.equal(wav.readUInt16LE(22), 1, 'Expected mono audio')
  const rate = wav.readUInt32LE(24)
  assert.equal(rate, 24000)
  assert.equal(wav.readUInt16LE(34), 16)
  assert.equal(wav.toString('ascii', 36, 40), 'data')
  const size = wav.readUInt32LE(40)
  assert.equal(size, wav.length - 44)
  assert.equal(size % 2, 0)
  let peak = 0
  for (let i = 44; i < wav.length; i += 2)
    peak = Math.max(peak, Math.abs(wav.readInt16LE(i)))
  assert(peak > 0, 'The synthesized paragraph is silent')
  const duration = size / 2 / rate
  assert(duration > 0 && duration <= 120, 'Unexpected WAV duration')
  return duration
}

const service = createVoiceService()
const text =
  'Pilot ingress forwards the note write to the stable Notes API endpoint.'
try {
  for (const run of ['cold', 'warm 1', 'warm 2']) {
    const start = performance.now()
    const wav = await service.synthesize({ model, text })
    const elapsedMs = Math.round(performance.now() - start)
    const audioDurationSeconds = Number(audioSeconds(wav).toFixed(3))
    console.log(JSON.stringify({ model, run, elapsedMs, audioDurationSeconds }))
  }
} finally {
  service.close()
}
