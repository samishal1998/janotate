import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'
import { chromium, type Locator } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { start } from '../packages/server/src/http.ts'

const { values } = parseArgs({
  options: {
    assets: { type: 'string', default: 'dist' },
    out: { type: 'string', default: 'packages/docs/public/screenshots' },
  },
})
const docs = 'packages/docs/src/content/docs'
function example(path: string) {
  const markdown = readFileSync(join(docs, path + '.md'), 'utf8')
  return JSON.parse(markdown.match(/```json\n([\s\S]*?)\n```/)[1]).arguments
}

const workspace = mkdtempSync(join(tmpdir(), 'janotate-screens-'))
// Keep installed packs and credentials from the operator's workspace out of the examples.
process.env.JANOTATE_VOICE_DIR = join(workspace, 'voices')
const staging = join(workspace, 'screenshots')
mkdirSync(staging)
const service = await start(workspace, 0, true, resolve(values.assets))
const browser = await chromium.launch()
const client = new Client({ name: 'documentation', version: '1' })
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', service.origin)),
  )
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1.25,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  })
  page.setDefaultTimeout(7000)
  const captures = new Set<string>()
  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args })
    if (result.isError) throw Error(JSON.stringify(result.content))
    return result.structuredContent
  }
  async function open(args: Record<string, unknown>) {
    const review = await call('review_open', args)
    await page.goto(review.url as string)
    await page.locator('.question-card').first().waitFor()
    return review
  }
  async function photograph(name: string, subject: Locator, heading?: Locator) {
    if (captures.has(name)) throw Error('Duplicate capture: ' + name)
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const options = {
      path: join(staging, name + '.png'),
      animations: 'disabled' as const,
      caret: 'hide' as const,
    }
    if (heading) {
      await heading.evaluate((element) =>
        element.scrollIntoView({ block: 'center' }),
      )
      const first = await heading.boundingBox(),
        last = await subject.boundingBox()
      const clip = {
        x: first.x - 6,
        y: first.y - 6,
        width: first.width + 12,
        height: last.y + last.height - first.y + 12,
      }
      if (clip.y < 0 || clip.y + clip.height > page.viewportSize().height)
        throw Error('The screenshot would clip ' + name)
      await page.screenshot({ ...options, clip })
    } else await subject.screenshot(options)
    captures.add(name)
  }
  async function selectText(passage: Locator, text: string) {
    await passage.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node: Node
      while ((node = walker.nextNode())) {
        const at = node.textContent.indexOf(text)
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + text.length)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      throw Error('Passage missing: ' + text)
    }, text)
  }
  async function discuss(id: unknown, question: string, answer?: string) {
    const discussion = page.locator('.discussion')
    await discussion.getByRole('textbox').fill(question)
    await discussion.getByRole('button', { name: 'Add comment' }).click()
    await discussion.getByText(question, { exact: true }).waitFor()
    if (!answer) return
    const event = await call('review_wait', {
      review_id: id,
      after_comment: 0,
      wait_seconds: 2,
    })
    const comment = (
      event.comments as { id: string; item_id: string; body: string }[]
    ).find((c) => c.body === question)
    await call('discussion_reply', {
      review_id: id,
      item_id: comment.item_id,
      parent_id: comment.id,
      reply: answer,
    })
    await discussion.getByText(answer, { exact: true }).waitFor()
  }
  async function fitGraph() {
    await page.locator('.react-flow__node').first().waitFor()
    await page.getByRole('button', { name: 'Fit diagram' }).click()
  }
  const card = page.locator('.question-card')
  const button = (name: string | RegExp) =>
    card.getByRole('button', { name, exact: typeof name === 'string' })
  const plan = example('interfaces/plan')
  for (const kind of ['plan', 'lottie', 'dbml']) {
    const args = example('interfaces/' + kind)
    await call('review_open', {
      ...args,
      title: args.items[0].title,
      mode: kind === 'lottie' ? 'session' : 'workspace',
    })
  }
  await page.setViewportSize({ width: 1240, height: 740 })
  await page.goto(service.origin)
  await page.getByRole('link', { name: 'Resume latest review' }).waitFor()
  const connection = page.locator('details.connect-agent')
  if (!(await connection.evaluate((el: HTMLDetailsElement) => el.open)))
    await connection.locator('summary').click()
  await connection.getByRole('textbox', { name: 'MCP endpoint' }).waitFor()
  await photograph('workspace-home', page.locator('.home'))
  await photograph('connect-agent', connection)
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const file of readdirSync(join(docs, 'interfaces'))
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const kind = basename(file, '.md')
    const args =
      kind === 'pr_review'
        ? {
            title: 'Field Notes',
            items: [
              {
                kind,
                title: 'Review receipt retries',
                report: JSON.parse(
                  readFileSync(
                    'packages/docs/public/examples/receipt-review.json',
                    'utf8',
                  ),
                ),
              },
            ],
          }
        : example('interfaces/' + kind)
    const { review_id } = await open(args)
    let subject = card
    switch (kind) {
      case 'claim':
        for (const [i, verdict] of [
          'verified',
          'verified',
          'research',
        ].entries())
          await card.getByRole('combobox').nth(i).selectOption(verdict)
        break
      case 'code': {
        const editor = card.locator('.cm-content')
        await editor.fill(
          args.items[0].code.replace('attempts: 3', 'attempts: 5'),
        )
        break
      }
      case 'dbml': {
        await fitGraph()
        await card.getByLabel('Inspect table').selectOption({ label: 'notes' })
        await photograph(kind, card.locator('.schema-workbench'))
        await button('Edit DBML').click()
        const source = args.items[0].source_text
        await card
          .locator('.cm-content[contenteditable=true]')
          .fill(
            source.replace(
              'accepted_at timestamp [not null]',
              'accepted_at timestamp [not null]\n  replay_count int [default: 0]',
            ),
          )
        await button('Preview patch').click()
        await card.getByText(/replay_count int/).waitFor()
        await photograph('dbml-patch', card.locator('.schema-workbench'))
        continue
      }
      case 'decision':
        await card.getByRole('radio', { name: /^Markdown/ }).check()
        await card.getByText('confirmed', { exact: true }).waitFor()
        break
      case 'defaults':
        await card.getByLabel('Keep local receipts for').fill('14 days')
        break
      case 'diagram':
        await button('Lost receipt').click()
        await button('Next walkthrough step').click()
        await fitGraph()
        subject = card.locator('.diagram-view')
        break
      case 'diff':
        await card.locator('summary').first().click()
        await button('split').click()
        await card.locator('.diff-split').waitFor()
        break
      case 'digest':
        await card
          .getByLabel('Answer')
          .last()
          .fill('Verify the retry after the next shift.')
        break
      case 'function_overview':
        await card.getByText('Page title', { exact: true }).click()
        await card.locator('details[open] .cm-content').waitFor()
        break
      case 'html':
        await page.frameLocator('iframe').getByLabel('Name').fill('Neovim')
        await card.getByText('Awaiting form submission').waitFor()
        break
      case 'lottie': {
        const frame = card.getByRole('slider', { name: 'Animation frame' })
        await card.locator('.motion-stage svg').waitFor()
        await frame.fill('10')
        await button('Mark range start').click()
        await frame.fill('22')
        break
      }
      case 'matrix':
        await card.getByRole('radio', { name: 'Markdown' }).check()
        await card.getByRole('spinbutton', { name: 'Readability' }).fill('3')
        break
      case 'plan':
        await button(/Replay a lost receipt/).click()
        await card
          .getByRole('combobox', { name: /Status/ })
          .selectOption('revise')
        break
      case 'pr_review': {
        await button(/^Findings/).click()
        const detail = card.getByRole('region', { name: 'Review finding' })
        await selectText(
          detail.locator(
            '[data-pr-location="pr:finding:two-writes:explanation"]',
          ),
          'the receipt write fails',
        )
        await card.getByRole('button', { name: 'Comment on passage' }).click()
        await discuss(
          review_id,
          'What happens if the receipt write fails after the insert?',
        )
        await detail.locator('mark').waitFor()
        await photograph(kind, detail, card.locator('.pr-tabs'))
        const evidence = card.getByRole('region', { name: 'Diff evidence' })
        await evidence.getByRole('button', { name: 'Select lines' }).click()
        await evidence
          .getByRole('button', { name: 'Comment on new line 22', exact: true })
          .click()
        await evidence
          .getByRole('button', { name: 'Comment on new line 24', exact: true })
          .click()
        await discuss(
          review_id,
          'Can these writes share a transaction?',
          'Yes. The note and its receipt should commit together.',
        )
        await evidence
          .getByRole('button', { name: /Open discussion on new lines 22/ })
          .waitFor()
        await photograph('pr-review-lines', evidence)
        await photograph(
          'pr-review-thread',
          page
            .locator('.discussion .thread')
            .filter({ hasText: 'Can these writes share a transaction?' }),
        )
        continue
      }
      case 'proposal': {
        const paragraph = card.locator('[data-section=release]').first()
        await selectText(paragraph, 'local receipt for each note')
        await card.getByText('Comment on passage', { exact: true }).click()
        await discuss(
          review_id,
          'Does the same receipt survive a retry?',
          'Yes. Reuse its identifier until the server acknowledges it.',
        )
        await card.locator('mark').first().waitFor()
        await photograph(
          kind,
          card.locator('[data-guide-path="section:release"]'),
        )
        await photograph(
          'proposal-thread',
          page.locator('.discussion .thread').first(),
        )
        continue
      }
      case 'range':
        await card
          .getByRole('slider', { name: 'Tablets in the first cohort' })
          .fill('8')
        break
      case 'ranking':
        await button('Move Inspect simultaneous edits up').click()
        break
      case 'scope_board':
        await card.getByLabel('Overnight alerts').selectOption('in scope')
        break
      default:
        throw Error('Choose a representative state for ' + kind)
    }
    await photograph(kind, subject)
  }
  for (const [guide, variant] of [
    ['infrastructure', 'GitHub Actions'],
    ['retry-trace', 'Lost receipt and retry'],
  ]) {
    await open(example('guides/' + guide))
    await button(variant).click()
    await button('Next walkthrough step').click()
    await fitGraph()
    await photograph(guide, card.locator('.diagram-view'))
  }
  await open(plan)
  const guide = page.getByRole('navigation', { name: 'Guided review' })
  await guide.getByRole('button', { name: 'Start guide' }).click()
  await guide.getByRole('button', { name: 'Float guide' }).click()
  await guide.getByRole('button', { name: 'Browse stops' }).click()
  await guide.getByRole('group', { name: 'Guide stops' }).waitFor()
  await photograph('guided-review', guide)
  await page.getByRole('button', { name: 'Voice', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Read-aloud voice' })
  await dialog.getByRole('radio', { name: /Kitten/ }).waitFor()
  await photograph('voice-settings', dialog)
  await dialog.getByRole('radio', { name: 'ElevenLabs-compatible' }).check()
  await photograph('voice-provider', dialog.locator('.voice-provider-fields'))
  mkdirSync(values.out, { recursive: true })
  for (const name of captures)
    cpSync(join(staging, name + '.png'), join(values.out, name + '.png'))
  console.log('Captured ' + captures.size + ' review and guide images.')
} finally {
  await client.close()
  await browser.close()
  service.close()
  rmSync(workspace, { recursive: true, force: true })
}
