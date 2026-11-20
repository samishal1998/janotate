import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  prLineRange,
  prLocation,
  type DiffSide,
  type PrReport,
} from '../../core/src/pr-review'
import { Button } from './components/ui/button'
import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import { Icon } from './components/icon'
import { graph } from '../../core/src/catalog'
import { AnnotationMode } from './annotation-tool'
import { PrNarrative, PrText, PrThreadPins } from './pr-passage'
import { EvidenceView, type Evidence } from './pr-evidence'
import './pr-review.css'
const GraphCanvas = React.lazy(() => import('./graph-canvas'))

function ChangeMap({
  diagram,
  select,
}: {
  diagram: NonNullable<PrReport['summary']['diagram']>
  select: (node: string) => void
}) {
  const [open, setOpen] = useState(false)
  const map = useMemo(() => {
    try {
      const parsed = graph(diagram.source)
      if (parsed.nodes.length > 100 || parsed.edges.length > 300) return null
      return {
        horizontal: parsed.horizontal,
        nodes: parsed.nodes.map(([id, label]) => ({ id, label })),
        edges: parsed.edges.map(([from, to], i) => ({
          id: 'connection-' + i,
          from,
          to,
        })),
      }
    } catch {
      return null
    }
  }, [diagram.source])
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="network" size={15} />
        {diagram.title ?? 'Change map'}
        <Icon name="chevron-down" size={13} />
      </summary>
      {open &&
        (map ? (
          <div
            onKeyDownCapture={(event) => {
              const node = event.target as HTMLElement
              if (
                (event.key === 'Enter' || event.key === ' ') &&
                node.matches('.react-flow__node[data-id]')
              ) {
                event.preventDefault()
                event.stopPropagation()
                select(node.dataset.id)
              }
            }}
          >
            <React.Suspense fallback={<p>Opening change map…</p>}>
              <GraphCanvas
                {...map}
                onSelect={select}
                label={diagram.title ?? 'Change map'}
              />
            </React.Suspense>
          </div>
        ) : (
          <pre className="pr-map-source">{diagram.source}</pre>
        ))}
    </details>
  )
}

type Tab = 'groups' | 'findings' | 'coverage'
function ReportPicker({
  label,
  entries,
  id,
  select,
  children,
}: {
  label: string
  entries: { id: string; title: string }[]
  id: string
  select: (id: string) => void
  children: React.ReactNode
}) {
  const index = entries.findIndex((entry) => entry.id === id)
  return (
    <div className="pr-stepper">
      <div className="pr-stepper-context">
        <span className="pr-position">
          {label} {index + 1} of {entries.length}
        </span>
        {children}
      </div>
      {entries.length > 2 && (
        <NativeSelect
          size="sm"
          aria-label={label}
          value=""
          onChange={(e) => select(e.target.value)}
        >
          <NativeSelectOption value="" disabled>
            Jump to…
          </NativeSelectOption>
          {entries.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {e.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {entries.length > 1 && (
        <div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={'Previous ' + label.toLowerCase()}
            disabled={index === 0}
            onClick={() => select(entries[index - 1].id)}
          >
            <Icon name="arrow" style={{ transform: 'rotate(180deg)' }} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={'Next ' + label.toLowerCase()}
            disabled={index === entries.length - 1}
            onClick={() => select(entries[index + 1].id)}
          >
            <Icon name="arrow" />
          </Button>
        </div>
      )}
    </div>
  )
}
function evidenceRef(ref: string): Evidence {
  const [id, side, range] = ref.split(':')
  if (!side) return { id }
  const [first, last] = range.split('-').map(Number)
  return { id, side: side as DiffSide, first, last }
}
const plural = (n: number, word: string) =>
  n + ' ' + word + (n === 1 ? '' : 's')

export default function PrReview({
  item,
  threads,
  values,
  change,
  anchor,
  selection,
  open,
}) {
  const annotating = React.useContext(AnnotationMode)
  const report: PrReport = item.report
  const [tab, setTab] = useState<Tab>(
    report.groups.length ? 'groups' : 'coverage',
  )
  const [groupId, setGroup] = useState(report.groups[0]?.id)
  const [findingId, setFinding] = useState(report.findings[0]?.id)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [chosen, setEvidence] = useState<Evidence | null>(null)
  const evidencePanel = useRef<HTMLDivElement>(null)
  const group = report.groups.find((g) => g.id === groupId) ?? report.groups[0]
  const finding =
    report.findings.find((f) => f.id === findingId) ?? report.findings[0]
  const defaultRef =
    tab === 'groups' && group
      ? evidenceRef(group.story?.[0]?.show[0] ?? group.hunks[0].id)
      : tab === 'findings' && finding?.anchor
        ? {
            id: finding.anchor.hunkId,
            side: finding.anchor.side,
            first: finding.anchor.line,
            last: finding.anchor.line,
          }
        : {
            id:
              tab === 'findings' ? finding?.hunkIds?.[0] : report.hunks[0]?.id,
          }
  const active = chosen ?? defaultRef
  const hunks = useMemo(
    () => new Map(report.hunks.map((h) => [h.id, h])),
    [report.hunks],
  )
  const files = useMemo(
    () => new Map(report.files.map((f) => [f.id, f])),
    [report.files],
  )
  const activeHunk = hunks.get(active.id)
  const summary = report.summary,
    coverage = report.coverage
  const historical =
    selection?.ledger_id && selection.ledger_id !== report.ledgerId
  const removed = useMemo(
    () =>
      !historical &&
      selection?.type === 'node' &&
      !prLocation(report, selection.path),
    [historical, report, selection],
  )
  const selectedPath =
    historical || removed
      ? ''
      : ((selection?.type === 'text'
          ? selection.section_id
          : selection?.path) ?? '')
  const annotate = (path: string) =>
    anchor({ type: 'node', path, ledger_id: report.ledgerId })
  useEffect(() => {
    if (!selectedPath?.startsWith('pr:')) return
    const [, kind, id] = selectedPath.split(':')
    if (kind === 'group' || kind === 'finding') {
      setTab(kind === 'group' ? 'groups' : 'findings')
      if (kind === 'group') setGroup(id)
      else setFinding(id)
      setEvidence(null)
    } else if (kind === 'file' && files.has(id)) {
      setTab('coverage')
      setExpandedFile(id)
      setEvidence({ id: files.get(id).hunkIds[0] })
    } else if (['hunk', 'line', 'lines'].includes(kind) && hunks.has(id)) {
      const h = hunks.get(id)
      // When returning to a thread, keep a finding open if it already explains this hunk.
      if (
        !(
          tab === 'findings' &&
          (finding?.anchor?.hunkId === id || finding?.hunkIds?.includes(id))
        ) &&
        tab !== 'coverage'
      ) {
        if (h.groupId) {
          setTab('groups')
          setGroup(h.groupId)
        } else setTab('coverage')
      }
      setEvidence(
        kind === 'hunk' ? { id } : (prLineRange(selectedPath) ?? null),
      )
    }
  }, [selection])
  function show(ref: string) {
    setEvidence(evidenceRef(ref))
    requestAnimationFrame(() =>
      evidencePanel.current?.scrollIntoView({ block: 'nearest' }),
    )
  }
  function evidenceLink(ref: string) {
    const e = evidenceRef(ref),
      h = hunks.get(e.id)
    const path = files.get(h.fileId).path
    const location = e.side
      ? e.side + ' ' + e.first + (e.last === e.first ? '' : '–' + e.last)
      : e.id
    return (
      <button
        key={ref}
        className="pr-ref"
        type="button"
        aria-label={path + ' · ' + location}
        onClick={() => show(ref)}
      >
        <Icon name="code" size={13} />
        <span>{path}</span>
        <span className="pr-ref-location">{location}</span>
      </button>
    )
  }
  function go(next: Tab) {
    setTab(next)
    setEvidence(null)
  }
  function discuss(path: string, label: string) {
    return (
      open && (
        <Button
          size="sm"
          variant="outline"
          data-annotation-target
          onClick={() => annotate(path)}
        >
          <Icon name="chat" />
          {label}
        </Button>
      )
    )
  }
  function goGroup(id: string) {
    go('groups')
    setGroup(id)
  }
  const source = [
    report.source.repo,
    report.source.number && '#' + report.source.number,
    report.source.range ??
      ([report.source.baseRef, report.source.headRef]
        .filter(Boolean)
        .join(' → ') ||
        report.source.headOid?.slice(0, 10)),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <PrNarrative {...{ item, threads, selection, anchor, open }}>
      {historical && (
        <p role="status" tabIndex={-1} data-pr-stale>
          This thread refers to an earlier diff ({selection.ledger_id}).
        </p>
      )}
      {removed && (
        <p role="status" tabIndex={-1} data-pr-stale>
          This location was removed from the report. Its thread is still
          available.
        </p>
      )}
      <div className="pr-overview">
        <div className="pr-meta">
          <span>
            <Icon name="layers" />
            {summary.categories.join(' · ')}
          </span>
          {source && <span>{source}</span>}
        </div>
        <p className="pr-essence">
          <PrText path="pr:summary:essence" />
        </p>
        {(summary.behaviorBefore || summary.behaviorAfter) && (
          <dl className="pr-before-after">
            {summary.behaviorBefore && (
              <div data-phase="before">
                <dt>Before</dt>
                <dd>
                  <PrText path="pr:summary:before" />
                </dd>
              </div>
            )}
            {summary.behaviorAfter && (
              <div data-phase="after">
                <dt>After</dt>
                <dd>
                  <PrText path="pr:summary:after" />
                </dd>
              </div>
            )}
          </dl>
        )}
        <div className="pr-disclosures">
          {summary.diagram && (
            <ChangeMap
              diagram={summary.diagram}
              select={(node) => {
                if (
                  node.startsWith('g_') &&
                  report.groups.some((g) => g.id === node.slice(2))
                ) {
                  if (annotating && open) annotate('pr:group:' + node.slice(2))
                  else goGroup(node.slice(2))
                }
                if (
                  node.startsWith('f_') &&
                  report.findings.some((f) => f.id === node.slice(2))
                ) {
                  if (annotating && open)
                    annotate('pr:finding:' + node.slice(2))
                  else {
                    go('findings')
                    setFinding(node.slice(2))
                  }
                }
              }}
            />
          )}
          {(summary.problem ||
            summary.scope?.length > 0 ||
            summary.unchanged?.length > 0 ||
            report.pr?.body) && (
            <details>
              <summary>
                <Icon name="book" size={15} />
                Change context
                <Icon name="chevron-down" size={13} />
              </summary>
              {summary.problem && (
                <p>
                  <PrText path="pr:summary:problem" />
                </p>
              )}
              {summary.unchanged?.map((_, index) => (
                <p key={index}>
                  <PrText path={'pr:summary:unchanged:' + index} />
                </p>
              ))}
              {summary.scope?.map((_, index) => (
                <p key={index}>
                  <PrText path={'pr:summary:scope:' + index} />
                </p>
              ))}
              {report.pr?.body && (
                <p>
                  <PrText path="pr:summary:body" />
                </p>
              )}
            </details>
          )}
        </div>
      </div>
      <nav className="pr-tabs" aria-label="Pull request views">
        {(
          [
            ['groups', 'Change groups', report.groups.length],
            ['findings', 'Findings', report.findings.length],
            ['coverage', 'Coverage', coverage.totalHunks],
          ] as const
        ).map(([id, label, n]) => (
          <Button
            variant={tab === id ? 'secondary' : 'ghost'}
            key={id}
            aria-pressed={tab === id}
            aria-label={label + ' ' + n}
            onClick={() => go(id)}
          >
            {id === 'groups' ? (
              <span className="pr-tab-label">
                <span className="pr-tab-prefix">Change </span>groups
              </span>
            ) : (
              <span className="pr-tab-label">{label}</span>
            )}
            <span>{n}</span>
          </Button>
        ))}
      </nav>
      {tab === 'groups' &&
        (group ? (
          <section
            aria-label="Change group"
            className="pr-detail"
            data-guide-path={'pr:group:' + group.id}
            tabIndex={-1}
          >
            <ReportPicker
              label="Change group"
              entries={report.groups}
              id={group.id}
              select={goGroup}
            >
              <div className="pr-meta">
                <span>{group.layer}</span>
                <span>{group.kind}</span>
                <span>{plural(group.hunks.length, 'hunk')}</span>
              </div>
            </ReportPicker>
            <h3>
              <PrText path={'pr:group:' + group.id + ':title'} />
            </h3>
            <p>
              <PrText path={'pr:group:' + group.id + ':essence'} />
            </p>
            {group.pattern && (
              <p>
                <PrText path={'pr:group:' + group.id + ':pattern'} />
              </p>
            )}
            {group.dependsOn?.length > 0 && (
              <div className="pr-cross">
                <span>Builds on</span>
                {group.dependsOn.map((id) => (
                  <button key={id} onClick={() => goGroup(id)}>
                    {report.groups.find((g) => g.id === id)?.title}
                  </button>
                ))}
              </div>
            )}
            {group.story?.length > 0 && (
              <ol className="pr-story">
                {group.story.map((s, n) => (
                  <li key={n}>
                    <p>
                      <PrText path={'pr:group:' + group.id + ':story:' + n} />
                    </p>
                    <div>{s.show.map(evidenceLink)}</div>
                  </li>
                ))}
              </ol>
            )}
            {group.alsoTouched?.map((s, n) => (
              <div key={n}>
                <p>
                  <PrText path={'pr:group:' + group.id + ':also:' + n} />
                </p>
                {s.hunks.map(evidenceLink)}
              </div>
            ))}
            {group.outliers?.map((o, index) => (
              <div key={index}>
                <strong>Exception</strong>
                <p>
                  <PrText path={'pr:group:' + group.id + ':outlier:' + index} />
                </p>
                {evidenceLink(o.hunkId)}
              </div>
            ))}
            <details>
              <summary>All evidence in this group</summary>
              {group.hunks.map((h) => (
                <div key={h.id}>
                  {evidenceLink(h.id)}
                  {h.why && (
                    <small>
                      <PrText path={'pr:group:' + group.id + ':why:' + h.id} />
                    </small>
                  )}
                </div>
              ))}
              {group.related?.length > 0 && (
                <div>Related evidence {group.related.map(evidenceLink)}</div>
              )}
            </details>
            {discuss('pr:group:' + group.id, 'Discuss group')}
          </section>
        ) : (
          <p>
            No change groups. See the coverage ledger for unclassified hunks.
          </p>
        ))}
      {tab === 'findings' &&
        (finding ? (
          <section
            aria-label="Review finding"
            className="pr-detail"
            data-guide-path={'pr:finding:' + finding.id}
            tabIndex={-1}
          >
            <ReportPicker
              label="Finding"
              entries={report.findings}
              id={finding.id}
              select={(id) => {
                setFinding(id)
                setEvidence(null)
              }}
            >
              <span className="pr-severity" data-severity={finding.type}>
                {finding.type}
              </span>
            </ReportPicker>
            <h3>
              <PrText path={'pr:finding:' + finding.id + ':title'} />
            </h3>
            <p>
              <PrText path={'pr:finding:' + finding.id + ':explanation'} />
            </p>
            {finding.suggestedDirection && (
              <div className="pr-direction">
                <strong>Suggested change</strong>
                <p>
                  <PrText path={'pr:finding:' + finding.id + ':direction'} />
                </p>
              </div>
            )}
            {finding.groupIds?.length > 0 && (
              <div className="pr-cross">
                <span>Change groups</span>
                {finding.groupIds.map((id) => (
                  <button key={id} onClick={() => goGroup(id)}>
                    {report.groups.find((g) => g.id === id)?.title}
                  </button>
                ))}
              </div>
            )}
            <div>
              {finding.anchor &&
                evidenceLink(
                  finding.anchor.hunkId +
                    ':' +
                    finding.anchor.side +
                    ':' +
                    finding.anchor.line +
                    '-' +
                    finding.anchor.line,
                )}
              {finding.hunkIds
                ?.filter((id) => id !== finding.anchor?.hunkId)
                .map(evidenceLink)}
            </div>
            {discuss('pr:finding:' + finding.id, 'Discuss finding')}
          </section>
        ) : (
          <p>No findings in this report.</p>
        ))}
      {tab === 'coverage' && (
        <section aria-label="Change coverage" className="pr-detail">
          <h3>Change coverage</h3>
          <div className="pr-coverage-summary">
            <p>
              {plural(coverage.totalFiles, 'file')} · {coverage.classifiedHunks}{' '}
              of {plural(coverage.totalHunks, 'hunk')} grouped ·{' '}
              {coverage.unclassifiedHunks} unclassified
            </p>
            {coverage.totalHunks > 0 && (
              <progress
                aria-label="Hunks assigned to a change group"
                value={coverage.classifiedHunks}
                max={coverage.totalHunks}
              />
            )}
          </div>
          <div className="pr-files">
            {report.files.map((f) => (
              <details
                key={f.id}
                open={expandedFile === f.id}
                onToggle={(event) => {
                  if (event.currentTarget.open) setExpandedFile(f.id)
                  else
                    setExpandedFile((current) =>
                      current === f.id ? null : current,
                    )
                }}
              >
                <summary
                  data-pr-location={'pr:file:' + f.id}
                  data-annotation-target={open || undefined}
                  data-pr-current={
                    selectedPath === 'pr:file:' + f.id || undefined
                  }
                  onClick={(e) => {
                    if (annotating && open) {
                      e.preventDefault()
                      annotate('pr:file:' + f.id)
                    }
                  }}
                >
                  <Icon name="chevron-down" size={14} />
                  <strong>{f.path}</strong>{' '}
                  <span>
                    {f.status} · {plural(f.hunkIds.length, 'hunk')}
                  </span>
                </summary>
                {expandedFile === f.id && (
                  <div className="pr-file-comment">
                    {discuss('pr:file:' + f.id, 'Discuss file')}
                    <PrThreadPins path={'pr:file:' + f.id} />
                  </div>
                )}
                {expandedFile === f.id &&
                  f.hunkIds.map((id) => {
                    const h = hunks.get(id),
                      g = report.groups.find((gr) => gr.id === h.groupId)
                    return (
                      <div className="pr-ledger-row" key={id}>
                        {evidenceLink(id)}
                        <small>
                          {g?.title ??
                            report.unclassified.find((u) => u.hunkId === id)
                              ?.reason}
                        </small>
                      </div>
                    )
                  })}
              </details>
            ))}
          </div>
        </section>
      )}
      <div ref={evidencePanel}>
        {activeHunk && (
          <EvidenceView
            key={report.ledgerId + ':' + activeHunk.id}
            hunk={activeHunk}
            file={files.get(activeHunk.fileId)}
            evidence={active}
            requested={chosen}
            open={open}
            annotate={annotate}
            selected={selectedPath}
            threads={threads}
            ledgerId={report.ledgerId}
            visitThread={(thread) => {
              anchor(thread.anchor, { focusComposer: false })
              requestAnimationFrame(() =>
                document.getElementById('thread-' + thread.id)?.focus(),
              )
            }}
          />
        )}
      </div>
      <label className="pr-picker pr-verdict">
        <span>Your review</span>
        <NativeSelect
          disabled={!open}
          value={values.verdict ?? ''}
          onChange={(e) =>
            change(e.target.value ? { verdict: e.target.value } : {})
          }
        >
          <NativeSelectOption value="">Choose a verdict</NativeSelectOption>
          <NativeSelectOption value="approve">Approve</NativeSelectOption>
          <NativeSelectOption value="request_changes">
            Request changes
          </NativeSelectOption>
          <NativeSelectOption value="comment">Comment only</NativeSelectOption>
        </NativeSelect>
      </label>
    </PrNarrative>
  )
}
