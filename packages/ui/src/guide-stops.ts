import { flatten, graph } from '../../core/src/catalog.ts'
import type { Schema } from './dbml-model'

export type GuideStop = {
  id: string
  item: string
  title: string
  kind: string
  label: string
  status: string
  narration: string
  anchor: { type: string; path?: string }
  thread?: string
  media?: string
}

export function motionMarkers(animation) {
  return (animation.markers ?? []).flatMap((marker) => {
    const start = Math.max(animation.ip, Math.ceil(marker.tm))
    const end = Math.min(
      animation.op - 1,
      Math.max(start, Math.ceil(marker.tm + marker.dr) - 1),
    )
    if (
      !marker.cm.trim() ||
      start > end ||
      marker.tm + marker.dr < animation.ip
    )
      return []
    return [
      {
        label: marker.cm,
        start,
        end,
        path: start === end ? 'frame:' + start : 'frames:' + start + '-' + end,
      },
    ]
  })
}
export function diagramPrefix(id: string) {
  return id ? 'variant:' + encodeURIComponent(id) + '/' : ''
}

export function itemStops(i, staged, schema?: Schema): GuideStop[] {
  const draft =
    staged && staged.revision === i.revision ? staged.value : undefined
  const entries = buildStops(i, draft, schema)
  if (draft) {
    const saved = new Map(
      buildStops(i, undefined, schema).map((stop) => [stop.id, stop]),
    )
    for (const stop of entries) {
      const previous = saved.get(stop.id)
      if (
        stop.status !== previous?.status ||
        stop.narration !== previous?.narration ||
        i.kind === 'dbml'
      )
        stop.status += ' · draft'
    }
  }
  return entries
}

function buildStops(i, draft, schema?: Schema): GuideStop[] {
  const values = draft?.values ?? i.value ?? {}
  const verdict = i.kind === 'pr_review' && values.verdict?.replaceAll('_', ' ')
  const standard =
    i.skipped && !draft
      ? 'Skipped'
      : verdict ||
        (values.review === 'reviewed'
          ? 'Reviewed'
          : i.status === 'asked'
            ? 'Open'
            : i.status)
  const entries: GuideStop[] = []
  function add(
    label: string,
    path?: string,
    description?: string,
    status = standard,
    media?: string,
  ) {
    entries.push({
      id: JSON.stringify([
        i.id,
        path,
        i.kind === 'lottie' ? entries.length : null,
      ]),
      item: i.id,
      title: i.title,
      kind: i.kind,
      label,
      status: i.skipped && !draft ? 'Skipped' : status || 'Open',
      narration: [label, description].filter(Boolean).join('\n\n'),
      anchor: path ? { type: 'node', path } : { type: 'item' },
      media,
    })
  }
  switch (i.kind) {
    case 'decision': {
      const chosen = draft ? draft.option : i.value
      for (const o of i.options)
        add(
          o.label,
          'option:' + o.id,
          o.tradeoffs,
          o.id === chosen
            ? 'Selected'
            : !draft && i.status === 'defaulted' && i.default === o.id
              ? 'Default'
              : o.recommended
                ? 'Recommended'
                : 'Available',
        )
      const other = draft
        ? draft.other
        : i.value && !i.options.some((o) => o.id === i.value)
          ? i.value
          : undefined
      if (other) add('Other answer', 'other', other, 'Selected')
      break
    }
    case 'proposal':
      for (const s of i.sections) add(s.label, 'section:' + s.id, s.body)
      break
    case 'plan':
      for (const n of flatten(i.nodes))
        add(
          n.label,
          'node:' + n.id,
          [n.description, n.deliverable].filter(Boolean).join('\n\n'),
          values[n.id] ?? 'Proposed',
        )
      break
    case 'claim':
      for (const c of i.claims)
        add(c.label, 'claim:' + c.id, c.evidence, values[c.id] ?? 'Unanswered')
      break
    case 'defaults':
      for (const d of i.defaults)
        add(d.label, 'default:' + d.id, undefined, values[d.id] ?? d.value)
      break
    case 'ranking':
      for (const [index, e] of [...i.entries]
        .sort((a, b) => Number(values[a.id]) - Number(values[b.id]))
        .entries())
        add(e.label, 'rank:' + e.id, e.description, 'Rank ' + (index + 1))
      break
    case 'range':
      for (const s of i.scales)
        add(
          s.label,
          'scale:' + s.id,
          undefined,
          [values[s.id] ?? s.initial, s.unit]
            .filter((v) => v !== undefined)
            .join(' '),
        )
      break
    case 'scope_board':
      for (const c of i.cards)
        add(c.label, 'card:' + c.id, c.reason, values[c.id] ?? c.column)
      break
    case 'matrix':
      for (const o of i.options)
        add(
          o.label,
          'option:' + o.id,
          undefined,
          values.option === o.id ? 'Selected' : 'Available',
        )
      for (const c of i.criteria)
        add(
          c.label,
          'weight:' + c.id,
          undefined,
          'Weight ' + (values['weight:' + c.id] ?? c.weight),
        )
      break
    case 'digest':
      for (const e of i.entries)
        add(
          e.label,
          'entry:' + e.id,
          e.summary,
          values[e.id]?.replace(/^answer:/, '') ?? 'Unanswered',
        )
      break
    case 'function_overview':
      for (const b of i.blocks) add(b.label, 'block:' + b.id)
      break
    case 'diff':
      for (const s of i.steps) {
        for (const [n, h] of [...s.patch.matchAll(/^@@[^\n]*/gm)].entries())
          add(
            s.label + ' · Hunk ' + (n + 1),
            'hunk:' + s.id + ':' + n,
            h[0],
            values[s.id] ?? 'Unreviewed',
          )
      }
      break
    case 'diagram':
      for (const v of [{ ...i, id: '' }, ...(i.variants ?? [])]) {
        const prefix = diagramPrefix(v.id),
          qualifier = i.variants?.length
            ? (v.label ?? i.base_label ?? 'Original') + ' · '
            : ''
        if (v.walkthrough?.length)
          v.walkthrough.forEach((s, index) =>
            add(
              qualifier + s.label,
              prefix + 'walkthrough:' + index,
              s.description,
              'Ready to play',
              prefix + 'walkthrough',
            ),
          )
        else
          for (const [id, label] of graph(v.spec).nodes)
            add(
              qualifier + label,
              prefix + 'node:' + id,
              v.resources?.[id]?.detail,
            )
      }
      break
    case 'lottie': {
      const markers = motionMarkers(i.animation)
      if (markers.length)
        for (const m of markers)
          add(m.label, m.path, i.caption, 'Ready to play', 'animation')
      else
        add(
          i.animation.nm ?? i.title,
          'frame:' + i.animation.ip,
          i.caption,
          'Ready to play',
          'animation',
        )
      break
    }
    case 'dbml':
      if (schema) {
        for (const t of schema.tables) {
          add(t.name, 'table:' + t.name, undefined, t.fields.length + ' fields')
          for (const f of t.fields)
            add(
              t.name + '.' + f.name,
              'field:' + t.name + '.' + f.name,
              undefined,
              f.type,
            )
        }
        for (const r of schema.relations)
          add(
            r.left + ' → ' + r.right,
            'ref:' + r.id,
            undefined,
            'Relationship',
          )
      }
      break
    case 'pr_review':
      for (const g of i.report.groups)
        add(g.title, 'pr:group:' + g.id, g.essence, verdict || 'Unreviewed')
      for (const f of i.report.findings ?? [])
        add(f.title, 'pr:finding:' + f.id, f.explanation, f.type)
      break
  }
  if (!entries.length)
    add(
      i.filename ?? i.title,
      undefined,
      undefined,
      i.kind === 'code' && draft?.code !== undefined ? 'Edited' : standard,
    )
  return entries
}
