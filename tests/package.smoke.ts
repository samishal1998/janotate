import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { chromium } from 'playwright'
const root = mkdtempSync(join(tmpdir(), 'janotate-packed-')),
  lock = join(root, '.janotate/server.json')
const client = new Client({ name: 'package-test', version: '1' }),
  browser = await chromium.launch()
try {
  const pack = execFileSync(
    'npm',
    ['pack', '--silent', '--pack-destination', root],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .at(-1)
  writeFileSync(join(root, 'package.json'), '{"private":true}')
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(root, pack),
    ],
    { cwd: root },
  )
  assert(!existsSync(join(root, 'node_modules/astro')))
  const started = Date.now(),
    origin = execFileSync('npx', ['--offline', 'janotate', '--no-open'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', origin)),
  )
  const { structuredContent } = await client.callTool({
    name: 'review_open',
    arguments: {
      title: 'Packaged review',
      items: [
        {
          kind: 'decision',
          title: 'Continue?',
          options: [{ id: 'yes', label: 'Yes', tradeoffs: 'Proceed' }],
        },
      ],
    },
  })
  const page = await browser.newPage()
  await page.goto(structuredContent.url)
  await page.getByRole('radio').waitFor()
  const elapsed = Date.now() - started
  assert(elapsed < 10000)
  await page.getByRole('link', { name: 'Documentation' }).click()
  await page.getByRole('heading', { name: 'Quick start' }).waitFor()
  console.log(
    'Packed npx to rendered decision:',
    elapsed,
    'ms; packaged documentation rendered',
  )
} finally {
  await client.close()
  await browser.close()
  if (existsSync(lock)) {
    process.kill(JSON.parse(readFileSync(lock, 'utf8')).pid, 'SIGTERM')
    for (let n = 0; existsSync(lock) && n < 80; n++) await delay(25)
  }
  rmSync(root, { recursive: true, force: true })
}
