import type { PrReport } from './pr-review.ts'
import { quoteOffset, type TextQuote } from './quote.ts'

export function prQuoteOffset(
  report: PrReport,
  quote: TextQuote & { section_id?: string },
) {
  const passage = quote.section_id && prPassage(report, quote.section_id)
  return passage ? quoteOffset(passage.text, quote, true) : -1
}

// The report ledger scopes array positions to the submitted report. Resolve
// only known fields, so user-supplied locations cannot address arbitrary data.
export function prPassage(report: PrReport, path: string) {
  const [prefix, area, id, field, key, ...rest] = path.split(':')
  if (prefix !== 'pr' || rest.length) return
  function entry(text: string | undefined | null, label: string) {
    return text ? { text, label } : undefined
  }
  function indexed(values: string[] | undefined, index: string, label: string) {
    if (!/^(0|[1-9]\d*)$/.test(index)) return
    return entry(values?.[Number(index)], label + ' ' + (Number(index) + 1))
  }
  if (area === 'summary' && key === undefined) {
    const s = report.summary
    if (id === 'unchanged' || id === 'scope')
      return indexed(
        s[id],
        field,
        id === 'scope' ? 'Scope point' : 'Unchanged behavior',
      )
    if (field !== undefined) return
    switch (id) {
      case 'essence':
        return entry(s.essence, 'Summary')
      case 'before':
        return entry(s.behaviorBefore, 'Before')
      case 'after':
        return entry(s.behaviorAfter, 'After')
      case 'problem':
        return entry(s.problem, 'Problem')
      case 'body':
        return entry(report.pr?.body, 'PR description')
    }
  }
  if (area === 'group') {
    const g = report.groups.find((g) => g.id === id)
    if (!g) return
    const label = g.title + ' · '
    if (key !== undefined) {
      if (field === 'why')
        return entry(
          g.hunks.find((h) => h.id === key)?.why,
          label + 'Evidence ' + key,
        )
      if (!/^(0|[1-9]\d*)$/.test(key)) return
      if (field === 'outlier')
        return entry(
          g.outliers?.[Number(key)]?.note,
          label + 'Exception ' + (Number(key) + 1),
        )
      if (field === 'story')
        return entry(
          g.story?.[Number(key)]?.say,
          label + 'Story step ' + (Number(key) + 1),
        )
      if (field === 'also')
        return entry(
          g.alsoTouched?.[Number(key)]?.say,
          label + 'Related change ' + (Number(key) + 1),
        )
    } else {
      if (field === 'title') return entry(g.title, 'Change group title')
      if (field === 'essence') return entry(g.essence, label + 'Explanation')
      if (field === 'pattern') return entry(g.pattern, label + 'Pattern')
    }
  }
  if (area === 'finding' && key === undefined) {
    const f = report.findings.find((f) => f.id === id)
    if (!f) return
    if (field === 'title') return entry(f.title, 'Finding title')
    if (field === 'explanation')
      return entry(f.explanation, f.title + ' · Explanation')
    if (field === 'direction')
      return entry(f.suggestedDirection, f.title + ' · Suggested change')
  }
}
