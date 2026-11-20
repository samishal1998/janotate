import { z } from 'zod'
import { prPassage } from './pr-passage.ts'

const prose = z.string().min(1).max(4000)
const title = z.string().min(1).max(200)
const slug = z
  .string()
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const hunkId = z
  .string()
  .max(16)
  .regex(/^h\d{3,}$/)
const fileId = z
  .string()
  .max(16)
  .regex(/^f\d{3,}$/)
const count = z.int().nonnegative()
const optionalText = prose.nullish()
const url = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .nullish()
const showPattern = /^(h\d{3,})(?::(old|new):(\d+)-(\d+))?$/
const ids = (s: typeof slug) => z.array(s).max(4096)
const group = z.object({
  id: slug,
  title,
  kind: z.enum(['semantic', 'mechanical', 'incidental']),
  layer: z.enum([
    'shared',
    'backend',
    'frontend',
    'data',
    'infra',
    'tests',
    'copy',
    'other',
  ]),
  essence: prose,
  tags: z.array(z.string().min(1).max(32)).max(256).optional(),
  fileIds: ids(fileId).min(1),
  dependents: ids(slug),
  auto: z.boolean(),
  stats: z.object({
    hunks: count,
    files: count,
    additions: count,
    deletions: count,
    findings: count,
    outliers: count,
  }),
  dependsOn: ids(slug).optional(),
  hunks: z
    .array(z.object({ id: hunkId, why: prose.optional() }))
    .min(1)
    .max(4096),
  related: ids(hunkId).optional(),
  pattern: prose.optional(),
  story: z
    .array(
      z.object({
        say: prose,
        show: ids(z.string().max(80).regex(showPattern)).min(1),
      }),
    )
    .max(4096)
    .optional(),
  alsoTouched: z
    .array(z.object({ say: prose, hunks: ids(hunkId).min(1) }))
    .max(4096)
    .optional(),
  outliers: z
    .array(z.object({ hunkId, note: prose }))
    .max(4096)
    .optional(),
})
const finding = z.object({
  id: slug,
  title,
  type: z.enum([
    'blocking',
    'risk',
    'question',
    'simplification',
    'observation',
  ]),
  explanation: prose,
  suggestedDirection: prose.optional(),
  groupIds: ids(slug).optional(),
  hunkIds: ids(hunkId).optional(),
  anchor: z
    .object({ hunkId, side: z.enum(['old', 'new']), line: count.positive() })
    .optional(),
})
const hunk = z.object({
  id: hunkId,
  fileId,
  kind: z.enum([
    'text',
    'binary',
    'rename',
    'copy',
    'mode',
    'empty',
    'too_large',
    'no_patch',
  ]),
  oldStart: count.nullish(),
  newStart: count.nullish(),
  oldLines: count.nullish(),
  newLines: count.nullish(),
  hash: z
    .string()
    .regex(/^[a-f0-9]{8}$/)
    .nullish(),
  symbol: z.string().max(100000).nullish(),
  header: optionalText,
  note: optionalText,
  additions: count,
  deletions: count,
  redacted: count,
  groupId: slug.nullable(),
  relatedGroupIds: ids(slug),
  lines: z
    .array(
      z
        .string()
        .max(100000)
        .regex(/^[ +\\-][^\n]*$/),
    )
    .max(50000),
  truncated: z.boolean(),
  omittedLines: count,
})
const coverage = z.object({
  totalFiles: count,
  reviewedFiles: count,
  totalHunks: count,
  classifiedHunks: count,
  unclassifiedHunks: count,
  noiseHunks: count,
  fileLevelHunks: count,
})
const report = z.object({
  version: z.literal(2),
  tool: z.object({ name: prose, version: prose }),
  generatedAt: z.string().max(50).nullish(),
  size: z.enum(['tiny', 'normal', 'huge']),
  ledgerId: z.string().regex(/^[0-9a-f]{12}$/),
  source: z.object({
    kind: z.enum(['pr', 'range', 'file']),
    via: z.enum(['gh-diff', 'gh-files', 'git', 'file', 'stdin']),
    repo: optionalText,
    number: count.positive().nullish(),
    url,
    baseRef: optionalText,
    headRef: optionalText,
    baseOid: optionalText,
    headOid: optionalText,
    range: optionalText,
  }),
  pr: z
    .object({
      title: optionalText,
      author: optionalText,
      body: z.string().max(100000).nullish(),
      commits: z
        .array(
          z.object({
            oid: z.string().regex(/^[0-9a-f]{7,40}$/),
            headline: z.string().max(10000),
          }),
        )
        .max(10000)
        .optional(),
      closingIssues: z
        .array(
          z.object({
            number: count.positive(),
            title: z.string().max(10000).nullish(),
            url,
          }),
        )
        .max(10000)
        .optional(),
    })
    .nullish(),
  summary: z.object({
    essence: prose,
    problem: prose.optional(),
    behaviorBefore: prose.optional(),
    behaviorAfter: prose.optional(),
    unchanged: z.array(prose).max(16).optional(),
    scope: z.array(prose).max(128).optional(),
    diagram: z
      .object({
        kind: z.literal('mermaid'),
        source: z.string().min(1).max(20000),
        title: title.optional(),
      })
      .optional(),
    categories: z
      .array(
        z.enum([
          'behavioral',
          'bugfix',
          'refactor',
          'interface',
          'schema',
          'migration',
          'performance',
          'compatibility',
          'observability',
          'configuration',
          'test-only',
          'dependency',
        ]),
      )
      .min(1)
      .max(3),
  }),
  coverage,
  groups: z.array(group).max(1024),
  findings: z.array(finding).max(2048),
  unclassified: z.array(z.object({ hunkId, reason: prose.min(10) })).max(4096),
  files: z
    .array(
      z.object({
        id: fileId,
        path: prose,
        oldPath: optionalText,
        status: z.enum(['added', 'modified', 'deleted', 'renamed', 'copied']),
        noise: optionalText,
        similarity: count.max(100).nullish(),
        oldMode: z.string().max(6).nullish(),
        newMode: z.string().max(6).nullish(),
        binary: z.boolean().optional(),
        submodule: z.boolean().optional(),
        language: optionalText,
        crlf: z.boolean().optional(),
        groupIds: ids(slug),
        reviewed: z.boolean(),
        additions: count,
        deletions: count,
        hunkIds: ids(hunkId).min(1),
      }),
    )
    .min(1)
    .max(4096),
  hunks: z.array(hunk).min(1).max(4096),
})
export type PrReport = z.infer<typeof report>
export type PrHunk = PrReport['hunks'][number]
export type DiffSide = 'old' | 'new'

export function numberedLines(hunk: PrHunk) {
  let old = hunk.oldStart ?? 0,
    next = hunk.newStart ?? 0
  return hunk.lines.map((text) => ({
    text,
    old: text[0] === '-' || text[0] === ' ' ? old++ : null,
    new: text[0] === '+' || text[0] === ' ' ? next++ : null,
  }))
}

function integrityError(r: PrReport) {
  const files = new Map(r.files.map((f) => [f.id, f]))
  const hunks = new Map(r.hunks.map((h) => [h.id, h]))
  const groups = new Map(r.groups.map((g) => [g.id, g]))
  if (
    files.size !== r.files.length ||
    hunks.size !== r.hunks.length ||
    groups.size !== r.groups.length ||
    new Set(r.findings.map((f) => f.id)).size !== r.findings.length
  )
    return 'Report IDs must be unique within each collection'
  const filed = new Set<string>(),
    assigned = new Set<string>()
  const sameMembers = (reported: string[], expected: Set<string>) =>
    reported.length === expected.size &&
    new Set(reported).size === expected.size &&
    reported.every((id) => expected.has(id))
  for (const file of r.files) {
    const owners = new Set<string>()
    for (const id of file.hunkIds) {
      if (filed.has(id) || hunks.get(id)?.fileId !== file.id)
        return 'Invalid file membership for ' + id
      filed.add(id)
      const owner = hunks.get(id).groupId
      if (owner) owners.add(owner)
    }
    if (!file.reviewed || !sameMembers(file.groupIds, owners))
      return 'File coverage disagrees for ' + file.id
  }
  if (filed.size !== hunks.size) return 'Every hunk must appear under its file'
  const lineBounds = new Map<string, Record<DiffSide, [number, number]>>()
  for (const h of r.hunks) {
    if (h.kind !== 'text' && h.lines.length)
      return 'File-level hunks cannot contain diff lines'
    if (h.truncated !== h.omittedLines > 0)
      return 'Omitted line count disagrees with truncation for ' + h.id
    const old = h.oldStart ?? 0,
      next = h.newStart ?? 0
    const bounds: Record<DiffSide, [number, number]> = {
      old: [old, old - 1],
      new: [next, next - 1],
    }
    let adds = 0,
      removes = 0
    for (const line of h.lines) {
      if (line[0] === ' ' || line[0] === '-') bounds.old[1]++
      if (line[0] === ' ' || line[0] === '+') bounds.new[1]++
      if (line[0] === '-') removes++
      if (line[0] === '+') adds++
    }
    if (
      adds > h.additions ||
      removes > h.deletions ||
      (!h.truncated &&
        (adds !== h.additions || removes !== h.deletions) &&
        h.kind === 'text')
    )
      return 'Diff line totals disagree for ' + h.id
    if ((bounds.old[1] >= old && !old) || (bounds.new[1] >= next && !next))
      return 'Missing file line numbers for ' + h.id
    lineBounds.set(h.id, bounds)
  }
  function hasLines(id: string, side: DiffSide, start: number, end: number) {
    const range = lineBounds.get(id)?.[side]
    return (
      range && start > 0 && start <= end && start >= range[0] && end <= range[1]
    )
  }
  const visited = new Set<string>(),
    visiting = new Set<string>()
  function cycle(id: string): boolean {
    if (visiting.has(id)) return true
    if (visited.has(id) || !groups.has(id)) return false
    visiting.add(id)
    if (groups.get(id).dependsOn?.some(cycle)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  if (r.groups.some((g) => cycle(g.id)))
    return 'Circular change group dependency'
  const findingCounts = new Map<string, number>()
  for (const f of r.findings) {
    const implicated = new Set(f.groupIds ?? [])
    for (const id of [...(f.hunkIds ?? []), f.anchor?.hunkId]) {
      const owner = hunks.get(id)?.groupId
      if (owner) implicated.add(owner)
    }
    for (const id of implicated)
      findingCounts.set(id, (findingCounts.get(id) ?? 0) + 1)
  }
  for (const g of r.groups) {
    const touched = new Set<string>()
    let additions = 0,
      deletions = 0
    for (const { id } of g.hunks) {
      if (assigned.has(id) || hunks.get(id)?.groupId !== g.id)
        return 'Invalid group membership for ' + id
      assigned.add(id)
      const h = hunks.get(id)
      touched.add(h.fileId)
      additions += h.additions
      deletions += h.deletions
    }
    const stats = {
      files: touched.size,
      hunks: g.hunks.length,
      additions,
      deletions,
      findings: findingCounts.get(g.id) ?? 0,
      outliers: g.outliers?.length ?? 0,
    }
    if (
      !sameMembers(g.fileIds, touched) ||
      Object.entries(stats).some(([k, n]) => g.stats[k] !== n)
    )
      return 'Change group totals disagree for ' + g.id
    if (g.dependsOn?.some((id) => id === g.id || !groups.has(id)))
      return 'Unknown or circular prerequisite on ' + g.id
    if (
      g.related?.some((id) => !hunks.has(id) || hunks.get(id).groupId === g.id)
    )
      return 'Invalid related hunk on ' + g.id
    if (g.kind === 'semantic' && !g.story?.length)
      return 'A semantic group needs a story with evidence'
    for (const step of g.story ?? []) {
      for (const ref of step.show) {
        const parsed = showPattern.exec(ref)
        if (!parsed) return 'Invalid story reference'
        const [, id, side, start, end] = parsed
        if (
          hunks.get(id)?.groupId !== g.id ||
          (side && !hasLines(id, side as DiffSide, +start, +end))
        )
          return 'Story evidence does not exist in its group: ' + ref
      }
    }
    for (const { hunks: ids } of g.alsoTouched ?? [])
      if (ids.some((id) => hunks.get(id)?.groupId !== g.id))
        return 'Invalid side-effect hunk on ' + g.id
    for (const { hunkId: id } of g.outliers ?? [])
      if (hunks.get(id)?.groupId !== g.id) return 'Invalid outlier on ' + g.id
  }
  for (const { hunkId: id } of r.unclassified) {
    if (assigned.has(id) || hunks.get(id)?.groupId !== null)
      return 'Invalid unclassified hunk ' + id
    assigned.add(id)
  }
  if (assigned.size !== hunks.size)
    return 'Every hunk needs exactly one group or an unclassified reason'
  const totalHunks = hunks.size,
    totalFiles = files.size,
    unclassifiedHunks = r.unclassified.length
  const actual = {
    totalFiles,
    reviewedFiles: totalFiles,
    totalHunks,
    classifiedHunks: totalHunks - unclassifiedHunks,
    unclassifiedHunks,
    noiseHunks: r.hunks.filter((h) => h.groupId && files.get(h.fileId).noise)
      .length,
    fileLevelHunks: r.hunks.filter((h) => h.kind !== 'text').length,
  }
  if (Object.entries(actual).some(([key, n]) => r.coverage[key] !== n))
    return 'Reported coverage disagrees with the file and hunk ledger'
  for (const f of r.findings) {
    if (!f.anchor && !f.groupIds?.length && !f.hunkIds?.length)
      return 'Finding needs evidence: ' + f.id
    if (
      f.hunkIds?.some((id) => !hunks.has(id)) ||
      f.groupIds?.some((id) => !groups.has(id))
    )
      return 'Unknown finding evidence on ' + f.id
    if (
      f.anchor &&
      !hasLines(f.anchor.hunkId, f.anchor.side, f.anchor.line, f.anchor.line)
    )
      return 'Finding line does not exist on ' + f.id
  }
}

export const prReport = report.superRefine((value, ctx) => {
  const error = integrityError(value)
  if (error) ctx.addIssue({ code: 'custom', message: error })
})

export type PrLineRange = {
  id: string
  side: DiffSide
  first: number
  last: number
}

export function prLineRange(path: string): PrLineRange | undefined {
  const match =
    /^pr:(line|lines):(h\d{3,}):(old|new):([1-9]\d*)(?:-([1-9]\d*))?$/.exec(
      path,
    )
  if (!match) return
  const [, kind, id, side, from, to] = match
  const first = Number(from),
    last = to ? Number(to) : first
  if (
    (kind === 'lines') !== Boolean(to) ||
    !Number.isSafeInteger(last) ||
    (to && last <= first)
  )
    return
  return { id, side: side as DiffSide, first, last }
}

export function prLinePath({ id, side, first, last }: PrLineRange) {
  return (
    (first === last ? 'pr:line:' : 'pr:lines:') +
    id +
    ':' +
    side +
    ':' +
    first +
    (first === last ? '' : '-' + last)
  )
}

export function prLocation(report: PrReport, path: string) {
  const passage = prPassage(report, path)
  if (passage) return passage.label
  const [prefix, kind, id, ...suffix] = path.split(':')
  if (prefix !== 'pr' || (!['line', 'lines'].includes(kind) && suffix.length))
    return
  if (kind === 'group') return report.groups.find((g) => g.id === id)?.title
  if (kind === 'finding') return report.findings.find((f) => f.id === id)?.title
  if (kind === 'file') return report.files.find((f) => f.id === id)?.path
  const hunk = report.hunks.find((h) => h.id === id),
    file = report.files.find((f) => f.id === hunk?.fileId)
  if (!file) return
  if (kind === 'hunk') return file.path + ' · ' + id
  const range = prLineRange(path)
  if (!range || hunk.kind !== 'text') return
  const start = range.side === 'old' ? hunk.oldStart : hunk.newStart
  if (!start || range.first < start) return
  const indicator = range.side === 'old' ? '-' : '+'
  // A truncated report only carries the prefix of the hunk. Count visible lines
  // on this side so a saved range can never include an omitted line.
  let next = start
  for (const raw of hunk.lines) {
    if (raw[0] !== ' ' && raw[0] !== indicator) continue
    if (next++ === range.last)
      return (
        file.path +
        ' · ' +
        range.side +
        (range.first === range.last
          ? ' line ' + range.first
          : ' lines ' + range.first + '–' + range.last)
      )
  }
}
