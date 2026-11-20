import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  getInstalledVoicePack,
  installVoiceDirectory,
  unpackVoiceArchive,
  voicePackStatus,
  voiceRoot,
} from '../packages/server/src/voice-packs.ts'

test('versioned voice archives verify before extraction, coalesce concurrent installs and reuse offline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'janotate-voice-pack-'))
  const fixture = join(root, 'fixture'),
    destination = join(root, 'published')
  mkdirSync(fixture)
  writeFileSync(join(fixture, 'model'), 'voice test fixture')
  const tarball = join(root, 'model.tar.gz')
  execFileSync('tar', ['-czf', tarball, '-C', root, 'fixture'])
  const bytes = readFileSync(tarball)
  const integrity = 'sha256-' + createHash('sha256').update(bytes).digest('hex')
  let requests = 0
  const server = createServer((_req, res) => {
    requests++
    res.end(bytes)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url =
    'http://127.0.0.1:' +
    (server.address() as AddressInfo).port +
    '/model.tar.gz'
  const ready = (path: string) => existsSync(join(path, 'model'))
  try {
    await assert.rejects(
      installVoiceDirectory(destination, ready, (dir) =>
        unpackVoiceArchive(url, 'sha256-' + '0'.repeat(64), dir, bytes.length),
      ),
      /Checksum mismatch/,
    )
    assert.equal(existsSync(destination), false)
    assert.deepEqual(
      readdirSync(root).filter((n) => n.startsWith('.')),
      [],
    )
    const install = () =>
      installVoiceDirectory(destination, ready, (dir) =>
        unpackVoiceArchive(url, integrity, dir, bytes.length),
      )
    await Promise.all([install(), install(), install()])
    assert.equal(requests, 2)
    assert.equal(
      readFileSync(join(destination, 'model'), 'utf8'),
      'voice test fixture',
    )
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await install()
    assert.deepEqual(readdirSync(destination), ['model'])
  } finally {
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('independent processes publish one complete voice directory and recover abandoned staging', async () => {
  const root = mkdtempSync(join(tmpdir(), 'janotate-voice-race-'))
  const target = join(root, 'model')
  const stale = join(root, '.model.partial-2147483647-old')
  mkdirSync(stale)
  mkdirSync(target)
  writeFileSync(join(target, 'incomplete'), 'previous install')
  const code = `
    import { installVoiceDirectory } from ${JSON.stringify(new URL('../packages/server/src/voice-packs.ts', import.meta.url).href)}
    import { existsSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    import { setTimeout } from 'node:timers/promises'
    await installVoiceDirectory(process.argv[1], dir=>existsSync(join(dir,'done')),async dir=>{
      writeFileSync(join(dir,'owner'),String(process.pid))
      await setTimeout(100)
      writeFileSync(join(dir,'done'),String(process.pid))
    })`
  try {
    const { execFile } = await import('node:child_process')
    const launch = () =>
      new Promise<void>((resolve, reject) =>
        execFile(
          process.execPath,
          ['--input-type=module', '-e', code, target],
          (err) => (err ? reject(err) : resolve()),
        ),
      )
    await Promise.all([launch(), launch()])
    assert.equal(
      readFileSync(join(target, 'owner'), 'utf8'),
      readFileSync(join(target, 'done'), 'utf8'),
    )
    assert.deepEqual(readdirSync(root), ['model'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('status honors the shared cache override and missing packs have an actionable error', () => {
  const root = mkdtempSync(join(tmpdir(), 'janotate-voice-status-'))
  const previous = process.env.JANOTATE_VOICE_DIR
  process.env.JANOTATE_VOICE_DIR = root
  try {
    assert.equal(voiceRoot(), root)
    for (const id of ['kitten', 'kokoro'] as const) {
      assert.equal(voicePackStatus(id).installed, false)
      assert.equal(dirname(voicePackStatus(id).directory), root)
      assert.throws(
        () => getInstalledVoicePack(id),
        new RegExp('janotate voice install ' + id),
      )
    }
    assert.throws(
      () => voicePackStatus('../elsewhere' as any),
      /Unknown voice pack/,
    )
    assert.deepEqual(readdirSync(root), [])
  } finally {
    if (previous === undefined) delete process.env.JANOTATE_VOICE_DIR
    else process.env.JANOTATE_VOICE_DIR = previous
    rmSync(root, { recursive: true })
  }
})
