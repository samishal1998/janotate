import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  linkSync,
  rmSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { payloads } from '../../core/src/catalog.ts'
import type { tools } from '../../core/src/schema.ts'

export const toolHelp: Record<keyof typeof tools, string> = {
  decisions_query:
    'Search this project’s confirmed decisions before asking the reviewer again.',
  review_open:
    'Open related typed items together. Share the returned URL and keep the review and item IDs.',
  review_wait:
    'Wait for submission or new reviewer comments. Set after_comment to the last processed cursor, initially zero.',
  review_get:
    'Resume a review by ID or read its final answers, skipped items and anchored comments.',
  review_status:
    'Read review progress and the last activity time without waiting.',
  discussion_reply:
    'Reply to an anchored comment using its item and parent IDs.',
  item_update:
    'Revise an open item and explain the change in its thread. The item reopens for confirmation.',
}

const purposes = {
  decision: 'Choose between alternatives with explicit trade-offs.',
  claim: 'Verify individual claims and their evidence.',
  defaults: 'Confirm or override proposed defaults.',
  html: 'Collect a custom form response with a declared answer schema.',
  proposal: 'Annotate passages in a long-form document.',
  plan: 'Walk through nested stages, deliverables and their approval states.',
  diagram: 'Explore graph variants and play a sequence of highlighted nodes.',
  lottie: 'Play an animation and discuss a frame or frame range.',
  pr_review:
    'Review a pull request by reason for change, with evidence, findings and hunk coverage.',
  diff: 'Review patches and record a ruling for each step.',
  dbml: 'Discuss tables and columns and return a schema patch.',
  code: 'Edit a proposed source file.',
  function_overview: 'Discuss named blocks of code.',
  scope_board: 'Move work between scope columns.',
  matrix: 'Compare alternatives using weighted criteria.',
  ranking: 'Return a ranked list.',
  range: 'Set numeric values within a range.',
  digest: 'Review a summary of completed work and follow up.',
}

export const itemKinds = [
  'decision',
  'claim',
  'defaults',
  'html',
  ...Object.keys(payloads),
].sort()
export const catalog = {
  tools: toolHelp,
  items: itemKinds.map((kind) => ({
    kind,
    purpose: purposes[kind],
    uri: 'janotate://items/' + kind,
  })),
}
export const serverInstructions =
  'Use Janotate for browser reviews. Search decisions_query before opening a new review. Share the URL from review_open, then call review_wait with after_comment starting at zero to handle discussion and collect the submitted result. Read janotate://agent/workflow for the full workflow and janotate://agent/catalog to choose an item kind. Each janotate://items/<kind> resource includes authoring guidance. The CLI provides the same references with janotate context.'

// Installed builds include the same Markdown that developers edit in the checkout.
const packaged = new URL('./agent/', import.meta.url)
const skillFile = existsSync(packaged)
  ? new URL('janotate/SKILL.md', packaged)
  : new URL('../../../skills/janotate/SKILL.md', import.meta.url)
const interfaces = existsSync(packaged)
  ? new URL('interfaces/', packaged)
  : new URL('../../docs/src/content/docs/interfaces/', import.meta.url)

export function skillMarkdown() {
  return readFileSync(skillFile, 'utf8')
}
function withoutFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
}
export function workflowMarkdown() {
  return withoutFrontmatter(skillMarkdown())
}
export function itemMarkdown(kind: string) {
  if (!itemKinds.includes(kind))
    throw Error(
      'Unknown item kind. Run janotate context to list the supported kinds.',
    )
  const url = '/docs/interfaces/' + kind + '/'
  return (
    '# ' +
    kind +
    '\n\n' +
    withoutFrontmatter(readFileSync(new URL(kind + '.md', interfaces), 'utf8'))
      .replace(/^<img\b[^>]+>\s*$/gm, '')
      .replace(
        /\]\((\.\.?\/[^)]+)\)/g,
        (_, path) => '](' + new URL(path, 'http://local' + url).pathname + ')',
      )
      .trim() +
    '\n'
  )
}
export function contextText(topic?: string) {
  if (topic) return itemMarkdown(topic)
  return (
    workflowMarkdown() +
    '\n\n## Available items\n\n' +
    catalog.items.map((i) => '- ' + i.kind + ' — ' + i.purpose).join('\n') +
    '\n\nRead an item example with janotate context <kind>.\n'
  )
}

export function installProjectSkill(root: string) {
  const folder = resolve(root, '.agents/skills/janotate')
  const target = join(folder, 'SKILL.md')
  const content = skillMarkdown()
  mkdirSync(folder, { recursive: true })
  const temporary = join(folder, '.SKILL-' + randomUUID())
  try {
    writeFileSync(temporary, content, { flag: 'wx' })
    linkSync(temporary, target)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    if (readFileSync(target, 'utf8') !== content)
      throw Error(
        'A different skill exists at ' +
          target +
          '. Use janotate skill to print this version and compare them.',
      )
  } finally {
    rmSync(temporary, { force: true })
  }
  return target
}
