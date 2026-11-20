import { z } from 'zod'

const name = z.string().max(240)
const frame = z.int().min(0).max(100000)
const dimension = z.int().min(1).max(4096)
const vectorTypes = new Set(['el', 'rc', 'sh', 'gr', 'fl', 'st', 'tr', 'tm'])
const unsupported = new Set([
  'assets',
  'refId',
  'fonts',
  'chars',
  'xlink:href',
  'href',
  'scripts',
  'ef',
  'masksProperties',
  'segments',
  'ln',
  'cl',
  'sid',
  '__proto__',
  'prototype',
  'constructor',
])

// Geometry is inline numeric data. Shape names and solid hex fills are the
// only free strings passed on to the SVG light player.
function safeGeometry(layers: unknown[]) {
  let entries = 0
  function visit(value: unknown, key: string, depth: number): boolean {
    if (
      ++entries > 30000 ||
      depth > 24 ||
      unsupported.has(key) ||
      key.length > 64
    )
      return false
    if (typeof value === 'string')
      return (
        ((key === 'nm' || key === 'mn') && value.length <= 240) ||
        (key === 'ty' && vectorTypes.has(value)) ||
        (key === 'sc' && /^#[\da-f]{6}$/i.test(value))
      )
    if (typeof value === 'number')
      return Number.isFinite(value) && Math.abs(value) <= 100000
    if (value == null || typeof value === 'boolean') return true
    if (Array.isArray(value))
      return value.length <= 4096 && value.every((v) => visit(v, '', depth + 1))
    if (typeof value !== 'object') return false
    return Object.entries(value).every(([k, v]) => visit(v, k, depth + 1))
  }
  return visit(layers, '', 0)
}

const record = z.record(z.string(), z.unknown())
const layer = z
  .object({
    ty: z.union([z.literal(1), z.literal(3), z.literal(4)]),
    ind: z.int().nonnegative(),
    nm: name.optional(),
    ip: frame,
    op: frame,
    st: z.number().optional(),
    sr: z.number().positive().optional(),
    ks: record,
    shapes: z.array(record).max(256).optional(),
    sw: dimension.optional(),
    sh: dimension.optional(),
    sc: z
      .string()
      .regex(/^#[\da-f]{6}$/i)
      .optional(),
    hd: z.boolean().optional(),
    ddd: z.literal(0).optional(),
    ao: z.union([z.literal(0), z.literal(1)]).optional(),
    bm: z.literal(0).optional(),
    hasMask: z.literal(false).optional(),
  })
  .strict()
  .refine(
    (l) =>
      l.op > l.ip &&
      (l.ty !== 1 || (l.sw && l.sh && l.sc)) &&
      (l.ty !== 4 || l.shapes?.length),
    'Expected a visible frame span and geometry for the layer',
  )

export const lottieAnimation = z
  .object({
    v: z.string().regex(/^\d{1,2}\.\d{1,2}\.\d{1,2}$/),
    fr: z.number().min(1).max(120),
    ip: frame,
    op: frame,
    w: dimension,
    h: dimension,
    nm: name.optional(),
    ddd: z.literal(0).optional(),
    meta: z
      .object({
        g: name.optional(),
        a: name.optional(),
        k: name.optional(),
        d: name.optional(),
        tc: name.optional(),
      })
      .optional(),
    markers: z
      .array(
        z.object({ tm: z.number(), cm: name, dr: z.number().nonnegative() }),
      )
      .max(128)
      .optional(),
    assets: z.array(z.never()).max(0).optional(),
    layers: z.array(layer).min(1).max(96),
  })
  .strict()
  .refine(
    (a) => a.op > a.ip && a.op - a.ip <= 120 * a.fr,
    'Use a nonempty composition up to two minutes long',
  )
  .refine(
    (a) => new Set(a.layers.map((l) => l.ind)).size === a.layers.length,
    'Layer indices must be unique',
  )
  .refine(
    (a) => safeGeometry(a.layers),
    'Use inline vector geometry within the supported complexity limits. External assets, expressions and effects are unsupported.',
  )
