import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
export type VoicePackId = 'kitten' | 'kokoro'
type Progress = (message: string) => void
export const voiceRuntimeVersion = '1.13.8'

// Official sherpa-onnx tts-models release asset digests. Both archives include
// the v1 runtime's espeak-ng-data files and the upstream notices.
const models = {
  kitten: {
    name: 'kitten-nano-en-v0_8-int8',
    sha: '6fa5be852612ce761094ba74ee6123b4fc4acfefa79bf64dc63acae4a83af2fd',
    bytes: 31220690,
  },
  kokoro: {
    name: 'kokoro-int8-multi-lang-v1_0',
    sha: '72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653',
    bytes: 132353410,
  },
}

// npm dist.integrity for the exact wrapper and platform tarballs. No npm
// lifecycle scripts run and only the host platform's binary is downloaded.
const npmHashes: Record<string, string> = {
  node: 'MsDMBdhLFTZ1GwvcGSSQhnS7g/EA8OMH6IYysCVUOM7j8Icty9KRc0E6YT1A5fWBsZwRfKOeh88QC95aRvS8ag==',
  'linux-x64':
    '6plnhjagsSeTntCgnlag86hWbs/uZE9Crms1LgOb68/1nKsIQjMd+WG519m+aPwT6TrsBOiEMzrx41t8sL5L5g==',
  'linux-arm64':
    'Tlg7a70b/Wge3OF8IgTHF9jhSVCsLyKQKhwc4BsJ5A+dL/SrFtGBjzuHp4XeLhiiOT7afCxX5PdSn/D4c8Lnuw==',
  'darwin-x64':
    '7BLRpjM6w4f9W46/nmkmq8lEKUayhebvcpslCVQ+6QN2uReYlZEMDZlSpXMjme+hUFrPfRz8P3UNq8ep/4d19g==',
  'darwin-arm64':
    'FPNgJMgnWVl/KhRTIhG3KL3A4Om63Rn4YKXc9/uHY7SzLcvqLJLc/h7UBWJwduXvv7K18t5NpxHR6XgXn4sjWw==',
  'win-x64':
    'oZF1c9VPOKtMwn83Bboc5XSWL+76BRoyB3eUuVnCknBKxwSULZU2Foia9VHWzU+n4I12rPsP6z6H9Rp1hD9o8g==',
  'win-ia32':
    'H0Ojln9hfvM+pxWqW0cnjB/XK8/JPq4/k0IWu2JpY5Z458M3zv+XC3Hu+wmot3AoH/K1Bgt23n/tTKtPV9x8qg==',
}

function platformKey() {
  return (
    (process.platform === 'win32' ? 'win' : process.platform) +
    '-' +
    process.arch
  )
}
export function supportsVoiceInstallation() {
  return Object.hasOwn(npmHashes, platformKey())
}
export function voiceRoot() {
  if (process.env.JANOTATE_VOICE_DIR)
    return resolve(process.env.JANOTATE_VOICE_DIR)
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
      : process.env.XDG_CACHE_HOME ||
        (process.platform === 'darwin'
          ? join(homedir(), 'Library', 'Caches')
          : join(homedir(), '.cache'))
  return resolve(base, 'janotate', 'voices')
}
function runtimeDirectory() {
  return join(
    voiceRoot(),
    'sherpa-' + voiceRuntimeVersion + '-' + platformKey(),
  )
}
function packageEntry(dir: string) {
  return join(dir, 'node_modules', 'sherpa-onnx-node', 'sherpa-onnx.js')
}
function paths(id: VoicePackId) {
  if (!Object.hasOwn(models, id))
    throw Error('Unknown voice pack. Choose kitten or kokoro.')
  const directory = join(
    voiceRoot(),
    models[id].name + '-' + models[id].sha.slice(0, 12),
  )
  return {
    id,
    directory,
    model: join(directory, 'model.int8.onnx'),
    voices: join(directory, 'voices.bin'),
    tokens: join(directory, 'tokens.txt'),
    dataDir: join(directory, 'espeak-ng-data'),
    runtimePath: packageEntry(runtimeDirectory()),
    lexicon: id === 'kokoro' ? join(directory, 'lexicon-us-en.txt') : undefined,
  }
}
export type InstalledVoicePack = ReturnType<typeof paths>
function readyModel(directory: string, id: VoicePackId) {
  const files = [
    'model.int8.onnx',
    'voices.bin',
    'tokens.txt',
    'espeak-ng-data/phontab',
    'espeak-ng-data/phondata',
    'espeak-ng-data/phonindex',
    'espeak-ng-data/intonations',
  ]
  if (id === 'kokoro') files.push('lexicon-us-en.txt')
  return files.every((file) => {
    const stat = statSync(join(directory, file), { throwIfNoEntry: false })
    return stat?.isFile() && stat.size > 0
  })
}
function readyRuntime(directory: string) {
  return (
    existsSync(packageEntry(directory)) &&
    existsSync(
      join(
        directory,
        'node_modules',
        'sherpa-onnx-' + platformKey(),
        'sherpa-onnx.node',
      ),
    )
  )
}
export function voicePackStatus(id: VoicePackId) {
  const pack = paths(id)
  return {
    installed:
      readyModel(pack.directory, id) && readyRuntime(runtimeDirectory()),
    directory: pack.directory,
    downloadBytes: models[id].bytes,
  }
}
export function getInstalledVoicePack(id: VoicePackId): InstalledVoicePack {
  if (!voicePackStatus(id).installed)
    throw Error(
      'Voice pack ' +
        id +
        ' is unavailable. Run janotate voice install ' +
        id +
        '.',
    )
  return paths(id)
}

// A completed directory is immutable. Independent processes can build in
// parallel, but only one publishes its verified result. A killed downloader
// never holds a lock that the next invocation would need to break.
const inProgress = new Map<string, Promise<void>>()
export function installVoiceDirectory(
  destination: string,
  ready: (dir: string) => boolean,
  populate: (staging: string) => Promise<void>,
): Promise<void> {
  if (ready(destination)) return Promise.resolve()
  const active = inProgress.get(destination)
  if (active) return active
  const task = (async () => {
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
    const prefix = '.' + basename(destination) + '.partial-'
    for (const name of await readdir(dirname(destination))) {
      if (!name.startsWith(prefix)) continue
      const pid = Number(name.slice(prefix.length).split('-')[0])
      if (!Number.isSafeInteger(pid) || pid <= 0) continue
      try {
        process.kill(pid, 0)
      } catch (error) {
        if (error.code === 'ESRCH')
          await rm(join(dirname(destination), name), {
            recursive: true,
            force: true,
          })
      }
    }
    const working = await mkdtemp(
      join(dirname(destination), prefix + process.pid + '-'),
    )
    const stage = join(working, 'verified')
    try {
      await mkdir(stage)
      await populate(stage)
      if (!ready(stage))
        throw Error('Voice installation is missing required files.')
      if (ready(destination)) return
      // A previous version or manual cleanup may have left an incomplete
      // directory. Replace it only after a new candidate has been verified.
      if (existsSync(destination)) {
        try {
          await rename(destination, join(working, 'incomplete'))
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
      try {
        await rename(stage, destination)
      } catch (error) {
        if (!ready(destination)) throw error
      }
    } finally {
      await rm(working, { recursive: true, force: true })
    }
  })().finally(() => inProgress.delete(destination))
  inProgress.set(destination, task)
  return task
}

export async function unpackVoiceArchive(
  url: string,
  integrity: string,
  directory: string,
  expectedBytes?: number,
) {
  // Keep temporary downloads within the unpublished installation, so an
  // interrupted process leaves one identifiable staging directory.
  await mkdir(directory, { recursive: true })
  const download = await mkdtemp(join(directory, '.voice-download-'))
  const archive = join(download, 'payload')
  try {
    const [algorithm, digest] = integrity.split('-')
    const hash = createHash(algorithm)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    })
    if (!response.ok || !response.body)
      throw Error(
        'Download of ' +
          basename(url) +
          ' failed (HTTP ' +
          response.status +
          ').',
      )
    let received = 0
    async function* chunks() {
      for await (const bytes of response.body as unknown as AsyncIterable<Uint8Array>) {
        received += bytes.length
        if (received > (expectedBytes ?? 64 * 1024 * 1024))
          throw Error('Download exceeded its expected size.')
        hash.update(bytes)
        yield bytes
      }
    }
    await pipeline(
      chunks(),
      createWriteStream(archive, { flags: 'wx', mode: 0o600 }),
    )
    if (
      (expectedBytes !== undefined && received !== expectedBytes) ||
      hash.digest(algorithm === 'sha512' ? 'base64' : 'hex') !== digest
    )
      throw Error(
        'Checksum mismatch for ' + basename(url) + '. Run the install again.',
      )
    try {
      await run(
        'tar',
        ['-xf', archive, '--strip-components', '1', '-C', directory],
        { windowsHide: true, timeout: 180000 },
      )
    } catch (error) {
      if (error.code === 'ENOENT')
        throw Error(
          'Voice installation requires tar with bzip2 support on PATH.',
        )
      throw Error(
        'Could not extract ' + basename(url) + ' with tar: ' + error.message,
      )
    }
  } finally {
    await rm(download, { recursive: true, force: true })
  }
}

export async function installVoicePack(
  id: VoicePackId,
  progress: Progress = () => {},
): Promise<InstalledVoicePack> {
  const pack = paths(id),
    platform = platformKey()
  if (!Object.hasOwn(npmHashes, platform))
    throw Error(
      'Local voice synthesis has no prebuilt runtime for ' + platform + '.',
    )
  if (process.versions.node.split('.')[0] !== '24')
    throw Error('Voice installation requires Node 24.')
  await installVoiceDirectory(
    runtimeDirectory(),
    readyRuntime,
    async (staging) => {
      progress(
        'Installing sherpa-onnx ' +
          voiceRuntimeVersion +
          ' CPU runtime for ' +
          platform +
          '…',
      )
      const modules = join(staging, 'node_modules')
      await mkdir(modules)
      for (const key of ['node', platform]) {
        const name = 'sherpa-onnx-' + key
        await unpackVoiceArchive(
          'https://registry.npmjs.org/' +
            name +
            '/-/' +
            name +
            '-' +
            voiceRuntimeVersion +
            '.tgz',
          'sha512-' + npmHashes[key],
          join(modules, name),
        )
      }
      try {
        await run(
          process.execPath,
          [
            '-e',
            'if(typeof require(process.argv[1]).OfflineTts!=="function")process.exit(1)',
            packageEntry(staging),
          ],
          { windowsHide: true, timeout: 30000 },
        )
      } catch (error) {
        throw Error(
          'Could not load the ' +
            platform +
            ' native speech runtime. ' +
            error.message,
        )
      }
    },
  )
  const model = models[id]
  await installVoiceDirectory(
    pack.directory,
    (dir) => readyModel(dir, id),
    async (staging) => {
      progress(
        'Downloading ' +
          model.name +
          ' (' +
          (model.bytes / 1e6).toFixed(1) +
          ' MB)…',
      )
      await unpackVoiceArchive(
        'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/' +
          model.name +
          '.tar.bz2',
        'sha256-' + model.sha,
        staging,
        model.bytes,
      )
    },
  )
  return getInstalledVoicePack(id)
}
