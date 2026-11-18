import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'
const data = mkdtempSync(join(tmpdir(), 'janotate-screens-')),
  service = await start(data, 0, true, resolve('dist'))
const browser = await chromium.launch(),
  client = new Client({ name: 'documentation', version: '1' })
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', service.origin)),
  )
  const page = await browser.newPage({
    viewport: { width: 960, height: 900 },
    colorScheme: 'light',
  })
  const dir = 'packages/docs/src/content/docs/interfaces',
    out = 'packages/docs/public/screenshots'
  mkdirSync(out, { recursive: true })
  for (const file of readdirSync(dir)) {
    const doc = readFileSync(join(dir, file), 'utf8'),
      call = JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)[1])
    const r = await client.callTool(call)
    if (r.isError) throw Error(JSON.stringify(r.content))
    await page.goto(r.structuredContent.url)
    if (file === 'html.md')
      await page.frameLocator('iframe').getByRole('button').waitFor()
    await page
      .locator('fieldset')
      .screenshot({ path: join(out, file.replace('.md', '.png')) })
  }
} finally {
  await client.close()
  await browser.close()
  service.close()
  rmSync(data, { recursive: true })
}
