import { rolldown } from 'rolldown'
import {
  cpSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
const bundle = await rolldown({
  input: {
    server: 'packages/server/src/cli.ts',
    'voice-worker': 'packages/server/src/voice-worker.mjs',
  },
  platform: 'node',
  external: (id) => !id.startsWith('.') && !id.startsWith('/'),
})
await bundle.write({ dir: 'dist', entryFileNames: '[name].mjs', format: 'esm' })
await bundle.close()
cpSync('skills/janotate', 'dist/agent/janotate', { recursive: true })
cpSync('packages/docs/src/content/docs/interfaces', 'dist/agent/interfaces', { recursive: true })
for (const pkg of ['ui', 'docs']) {
  rmSync('dist/' + pkg, { recursive: true, force: true })
  cpSync('packages/' + pkg + '/dist', 'dist/' + pkg, { recursive: true })
}
for (const entry of readdirSync('dist/docs', { recursive: true }).filter((f) =>
  f.endsWith('.html'),
)) {
  const file = join('dist/docs', entry),
    html = readFileSync(file, 'utf8')
  for (const [, attr] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(
      attr,
      'http://local/docs/' + entry.replace(/index\.html$/, ''),
    )
    if (url.origin !== 'http://local') continue
    let target = join('dist', decodeURIComponent(url.pathname))
    if (
      !existsSync(target) ||
      (statSync(target).isDirectory() &&
        !existsSync(join(target, 'index.html')))
    )
      throw Error(file + ' links to ' + attr)
    if (url.hash.length > 1) {
      if (statSync(target).isDirectory()) target = join(target, 'index.html')
      if (
        target.endsWith('.html') &&
        !readFileSync(target, 'utf8').includes(
          'id="' + decodeURIComponent(url.hash.slice(1)) + '"',
        )
      )
        throw Error(file + ' links to missing anchor ' + attr)
    }
  }
}
