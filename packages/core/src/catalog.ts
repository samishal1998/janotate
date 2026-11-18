import { z } from 'zod'
const text = z.string().trim().min(1).max(10000)
const entry = z.object({ id: text, label: text })
const list = (s) =>
  z
    .array(s)
    .min(1)
    .refine(
      (a) => new Set(a.map((v) => v.id)).size === a.length,
      'Duplicate id',
    )
export const columns = ['in scope', 'deferred', 'out of scope'] as const
export const states = ['proposed', 'approved', 'revise'] as const
const node: z.ZodType<any> = z.lazy(() =>
  entry.extend({ children: z.array(node).optional() }),
)
export const payloads = {
  digest: { entries: list(entry.extend({ summary: text })) },
  diagram: {
    spec: text.refine((s) => {
      try {
        graph(s)
        return true
      } catch {
        return false
      }
    }, 'Expected flowchart with named nodes and arrows'),
  },
  diff: {
    steps: list(
      entry.extend({
        patch: z
          .string()
          .max(2000000)
          .refine((s) => /^@@ /m.test(s), 'Expected unified diff hunks'),
      }),
    ),
  },
  function_overview: { blocks: list(entry.extend({ code: text })) },
  plan: { nodes: list(node) },
  matrix: {
    options: list(entry.extend({ scores: z.record(z.string(), z.number()) })),
    criteria: list(entry.extend({ weight: z.number().nonnegative() })),
  },
  scope_board: {
    cards: list(entry.extend({ column: z.enum(columns), reason: text })),
  },
}
export function graph(source: string) {
  const [header, ...lines] = source
    .trim()
    .split(/[;\n]/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!/^(flowchart|graph) (TD|TB|LR)$/.test(header))
    throw Error('Invalid flowchart direction')
  const nodes = new Map<string, string>(),
    edges = []
  function parse(raw: string) {
    const m = /^([\w-]+)(?:\[([^\]]+)\])?$/.exec(raw.trim())
    if (!m) throw Error('Invalid node')
    if (m[2] || !nodes.has(m[1])) nodes.set(m[1], m[2] ?? m[1])
    return m[1]
  }
  for (const line of lines) {
    const ids = line.split('-->').map(parse)
    for (let n = 1; n < ids.length; n++) edges.push([ids[n - 1], ids[n]])
  }
  if (!nodes.size) throw Error('Empty diagram')
  return { nodes: [...nodes], edges, horizontal: header.endsWith('LR') }
}
export function flatten(nodes) {
  return nodes.flatMap((n) => [n, ...flatten(n.children ?? [])])
}
export function catalogAnswer(item, value) {
  const keys = (rows, allowed) =>
    rows.every((r) => Object.hasOwn(value, r.id) && allowed(value[r.id])) &&
    Object.keys(value).length === rows.length
  switch (item.kind) {
    case 'digest':
      return keys(
        item.entries,
        (v) =>
          v === 'approve' ||
          v === 'reverse' ||
          (v.startsWith('answer:') && v.slice(7).trim().length > 0),
      )
    case 'diff':
      return keys(item.steps, (v) => ['approved', 'revise'].includes(v))
    case 'scope_board':
      return keys(item.cards, (v) => columns.includes(v))
    case 'plan':
      return keys(flatten(item.nodes), (v) => states.includes(v))
    case 'matrix':
      return (
        item.options.some((o) => o.id === value.option) &&
        item.criteria.every(
          (c) =>
            Number.isFinite(Number(value['weight:' + c.id])) &&
            Number(value['weight:' + c.id]) >= 0,
        ) &&
        Object.keys(value).length === item.criteria.length + 1
      )
    case 'diagram':
    case 'function_overview':
      return value.review === 'reviewed' && Object.keys(value).length === 1
    default:
      return false
  }
}
