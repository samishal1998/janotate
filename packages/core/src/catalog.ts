import { z } from 'zod'
import { lottieAnimation } from './lottie.ts'
import { prReport } from './pr-review.ts'
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
  entry.extend({
    description: text.optional(),
    deliverable: text.optional(),
    children: z.array(node).optional(),
  }),
)
const flowchart = text.refine((s) => {
  try {
    graph(s)
    return true
  } catch {
    return false
  }
}, 'Expected flowchart with named nodes and arrows')
const walkthrough = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(100),
      description: z.string().trim().min(1).max(600),
      targets: z
        .array(
          z
            .string()
            .max(160)
            .regex(/^(node:[\w-]+|edge:[\w-]+->[\w-]+)$/),
        )
        .min(1)
        .max(12)
        .refine(
          (targets) => new Set(targets).size === targets.length,
          'Duplicate walkthrough target',
        ),
    }),
  )
  .min(1)
  .max(32)
export type WalkthroughStep = z.infer<typeof walkthrough>[number]
export function walkthroughTargetsExist(version: {
  spec?: string
  walkthrough?: WalkthroughStep[]
}) {
  if (!version.walkthrough) return true
  try {
    const { nodes, edges } = graph(version.spec)
    const paths = new Set([
      ...nodes.map(([id]) => 'node:' + id),
      ...edges.map(([a, b]) => 'edge:' + a + '->' + b),
    ])
    return version.walkthrough.every((step) =>
      step.targets.every((target) => paths.has(target)),
    )
  } catch {
    return false
  }
}
const resources = z.record(
  z.string(),
  z.object({
    kind: z.enum([
      'Ingress',
      'Service',
      'Deployment',
      'Pod',
      'Job',
      'Workflow',
      'Trigger',
      'Action',
      'Environment',
    ]),
    detail: text.optional(),
  }),
)
export const languages = z.enum(['javascript', 'typescript', 'json', 'text'])
export const payloads = {
  pr_review: { report: prReport },
  dbml: {
    source_text: z.string().min(1).max(100000),
    baseline: z.string().max(100000).optional(),
    filename: text.optional(),
  },
  proposal: {
    sections: list(entry.extend({ body: z.string().min(1).max(100000) })),
  },
  ranking: { entries: list(entry.extend({ description: text.optional() })) },
  range: {
    scales: list(
      entry
        .extend({
          min: z.int(),
          max: z.int(),
          step: z.int().positive().default(1),
          initial: z.int(),
          unit: text.optional(),
        })
        .refine(
          (s) =>
            s.min < s.max &&
            s.initial >= s.min &&
            s.initial <= s.max &&
            (s.initial - s.min) % s.step === 0 &&
            (s.max - s.min) % s.step === 0,
          'Invalid range bounds or step',
        ),
    ),
  },
  code: { filename: text, language: languages, code: z.string().max(100000) },
  digest: { entries: list(entry.extend({ summary: text })) },
  lottie: {
    animation: lottieAnimation,
    caption: z.string().trim().min(1).max(2000).optional(),
  },
  diagram: {
    spec: flowchart,
    resources: resources.optional(),
    walkthrough: walkthrough.optional(),
    base_label: text.optional(),
    variants: list(
      entry
        .extend({
          spec: flowchart,
          resources: resources.optional(),
          walkthrough: walkthrough.optional(),
          description: text.optional(),
        })
        .refine(walkthroughTargetsExist, {
          path: ['walkthrough'],
          message: 'Walkthrough targets must exist in this diagram variant',
        }),
    ).optional(),
  },
  diff: {
    steps: list(
      entry.extend({
        language: languages.optional(),
        patch: z
          .string()
          .max(2000000)
          .refine((s) => /^@@ /m.test(s), 'Expected unified diff hunks'),
      }),
    ),
  },
  function_overview: {
    blocks: list(entry.extend({ code: text, language: languages.optional() })),
  },
  plan: {
    nodes: list(node).refine(
      (nodes) =>
        new Set(flatten(nodes).map((n) => n.id)).size === flatten(nodes).length,
      'Plan node ids must be unique',
    ),
  },
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
    case 'pr_review':
      return (
        ['approve', 'request_changes', 'comment'].includes(value.verdict) &&
        Object.keys(value).length === 1
      )
    case 'ranking': {
      const ranks = item.entries.map((e) => value[e.id])
      return (
        keys(
          item.entries,
          (v) => /^[1-9]\d*$/.test(v) && Number(v) <= ranks.length,
        ) && new Set(ranks).size === ranks.length
      )
    }
    case 'range':
      return (
        item.scales.every(
          (s) =>
            Object.hasOwn(value, s.id) &&
            String(Number(value[s.id])) === value[s.id] &&
            Number.isSafeInteger(Number(value[s.id])) &&
            Number(value[s.id]) >= s.min &&
            Number(value[s.id]) <= s.max &&
            (Number(value[s.id]) - s.min) % s.step === 0,
        ) && Object.keys(value).length === item.scales.length
      )
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
    case 'proposal':
    case 'lottie':
    case 'diagram':
    case 'function_overview':
      return value.review === 'reviewed' && Object.keys(value).length === 1
    default:
      return false
  }
}
