import { NativeSelect, NativeSelectOption } from './components/ui/native-select'
import React, { useMemo, useState } from 'react'
import GraphCanvas from './graph-canvas'
import CodeEditor from './code-editor'
import { Button } from './components/ui/button'
import { dbmlPatch } from '../../core/src/dbml-patch'
import { parseDbml, compareSchema } from './dbml-model'
import { Icon } from './components/icon'

function read(source: string) {
  try {
    return { schema: parseDbml(source), error: '' }
  } catch (e) {
    return { schema: null, error: e.message }
  }
}
const parentTable = (field: string) => field.slice(0, field.lastIndexOf('.'))
function PatchPreview({ patch }: { patch: string }) {
  const colors = {
    header: 'text-[var(--accent)] font-semibold',
    added: 'text-[var(--stage-teal)] bg-[var(--stage-teal-bg)]',
    removed: 'text-[var(--removed)] bg-[var(--removed-bg)]',
    context: 'text-[var(--muted)]',
  }
  const groups: { tone: keyof typeof colors; text: string }[] = []
  for (const [index, line] of (
    patch.match(/[^\n]*\n|[^\n]+$/g) ?? []
  ).entries()) {
    const tone =
      index < 2 || line.startsWith('@@')
        ? 'header'
        : line.startsWith('+')
          ? 'added'
          : line.startsWith('-')
            ? 'removed'
            : 'context'
    const last = groups.at(-1)
    if (last?.tone === tone) last.text += line
    else groups.push({ tone, text: line })
  }
  return (
    <pre
      className="max-h-80 overflow-auto p-2 text-xs leading-relaxed"
      tabIndex={0}
    >
      {groups.map(({ tone, text }, index) => (
        <span key={index} className={colors[tone]}>
          {text}
        </span>
      ))}
    </pre>
  )
}
export default function SchemaReview({
  item,
  source,
  change,
  open,
  anchor,
  selection,
  guideVisit,
}) {
  const [tab, setTab] = useState('Diagram'),
    [tableName, setTable] = useState('')
  const previewSource = React.useDeferredValue(source)
  const current = useMemo(() => read(previewSource), [previewSource]),
    before = useMemo(
      () => (item.baseline === undefined ? null : read(item.baseline)),
      [item.baseline],
    )
  const changes = useMemo(
    () =>
      before?.schema && current.schema
        ? compareSchema(before.schema, current.schema)
        : [],
    [before, current],
  )
  const model = useMemo(() => {
    const tables = current.schema?.tables ?? []
    const state = new Map(changes.map((c) => [c.path, c.state]))
    const visible = new Set(
      tables.flatMap((t) =>
        t.fields.slice(0, 6).map((f) => t.name + '.' + f.name),
      ),
    )
    return {
      nodes: tables.map((t, n) => ({
        id: 'table:' + t.name,
        label: t.name,
        kind: 'Table',
        tone: n % 3,
        fields: t.fields.slice(0, 6).map((f) => ({
          name: f.name,
          type: f.type,
          path: 'field:' + t.name + '.' + f.name,
          state: state.get('field:' + t.name + '.' + f.name),
        })),
        height: 32 + Math.min(6, t.fields.length) * 24,
      })),
      edges: (current.schema?.relations ?? []).map((r) => ({
        id: 'ref:' + r.id,
        sourcePort: visible.has(r.left) ? 'out:field:' + r.left : undefined,
        targetPort: visible.has(r.right) ? 'in:field:' + r.right : undefined,
        cardinality:
          r.operator.replaceAll('?', '') === '<'
            ? '1:n'
            : r.operator.replaceAll('?', '') === '>'
              ? 'n:1'
              : r.operator.includes('<>')
                ? 'n:n'
                : '1:1',
        from: 'table:' + r.sourceTable,
        to: 'table:' + r.targetTable,
      })),
    }
  }, [current, changes])
  const table =
    current.schema?.tables.find((t) => t.name === tableName) ??
    current.schema?.tables[0]
  const path = selection.type === 'node' ? selection.path : ''
  React.useEffect(() => {
    const dest = guideVisit?.anchor.path
    if (
      dest &&
      /^(table|field|ref):/.test(dest) &&
      !changes.some((c) => c.path === dest && c.state === 'Removed')
    )
      setTab('Diagram')
  }, [guideVisit])
  function pick(p) {
    anchor({ type: 'node', path: p })
  }
  React.useEffect(() => {
    if (!path) return
    if (
      path.startsWith('index:') ||
      changes.some((c) => c.path === path && c.state === 'Removed')
    ) {
      setTab('Changes')
      return
    }
    if (path.startsWith('field:') || path.startsWith('table:')) {
      const name = path.startsWith('field:')
        ? parentTable(path.slice(6))
        : path.slice(6)
      setTable(
        current.schema?.tables.find((t) =>
          t.fields.some((f) => 'field:' + t.name + '.' + f.name === path),
        )?.name ?? name,
      )
    }
  }, [path])
  const tabs = before ? ['Diagram', 'DBML', 'Changes'] : ['Diagram', 'DBML']
  const editing = tab === 'Edit'
  const patch = useMemo(
    () =>
      tab === 'Patch' && source.length <= 100000
        ? dbmlPatch(item, source).patch
        : '',
    [tab, source, item.source_text, item.revision, item.filename],
  )
  return (
    <div className="schema-workbench">
      <div className="workbench-bar">
        <span>
          <Icon name="database" />
          {item.filename ?? 'schema.dbml'}
        </span>
        <div className="workbench-tabs" role="group" aria-label="Schema views">
          {tabs.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
              {t === 'Changes' && current.schema && before?.schema
                ? ' · ' + changes.length
                : ''}
            </button>
          ))}
          {(source !== item.source_text ||
            item.value?.format === 'unified_diff' ||
            editing ||
            tab === 'Patch') && (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={tab === 'Patch'}
              onClick={() => setTab('Patch')}
            >
              Preview patch
            </Button>
          )}
        </div>
        {open && (
          <Button
            size="sm"
            variant="outline"
            aria-pressed={editing}
            onClick={() => setTab('Edit')}
          >
            <Icon name="code" />
            {editing ? 'Editing DBML' : 'Edit DBML'}
          </Button>
        )}
      </div>
      {tab === 'Patch' && (
        <div className="p-3" aria-label="Outgoing schema patch">
          {source.length > 100000 ? (
            <p>
              Shorten the edited schema to 100,000 characters to preview or
              save.
            </p>
          ) : patch ? (
            <PatchPreview patch={patch} />
          ) : (
            <p>No edits to the agent’s proposed schema.</p>
          )}
        </div>
      )}
      {(tab === 'DBML' || editing) && (
        <CodeEditor
          filename={item.filename ?? 'schema.dbml'}
          language="dbml"
          value={source}
          change={change}
          readOnly={!open || !editing}
        />
      )}
      {current.error && (
        <div role="status" className="schema-error">
          <strong>Diagram preview unavailable</strong>
          <p>{current.error}</p>
          {tab !== 'DBML' && (
            <button onClick={() => setTab('DBML')}>Open DBML source</button>
          )}
        </div>
      )}
      {tab !== 'Changes' && tab !== 'Patch' && current.schema && (
        <>
          <GraphCanvas
            horizontal
            nodes={model.nodes}
            edges={model.edges}
            onSelect={pick}
            selected={path}
            label="Database relationship diagram"
          />
          <div className="table-inspector">
            <div className="inspector-head" data-guide-path={'table:' + table.name}>
              <label>
                Table{' '}
                <NativeSelect
                  aria-label="Inspect table"
                  value={table.name}
                  onChange={(e) => pick('table:' + e.target.value)}
                >
                  {current.schema.tables.map((t) => (
                    <NativeSelectOption key={t.name}>
                      {t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <Button
                size="lg"
                variant="outline"
                onClick={() => pick('table:' + table.name)}
                aria-pressed={path === 'table:' + table.name}
              >
                <Icon name="chat" /> Discuss table
              </Button>
            </div>
            <div className="schema-fields">
              {table.fields.map((f) => {
                const id = 'field:' + table.name + '.' + f.name
                return (
                  <button
                    key={id}
                    data-guide-path={id}
                    aria-label={'Discuss ' + table.name + '.' + f.name}
                    aria-pressed={path === id}
                    onClick={() => pick(id)}
                  >
                    <strong>{f.name}</strong>
                    <code>{f.type}</code>
                    <small>{f.settings}</small>
                    <Icon name="chat" size={14} />
                  </button>
                )
              })}
            </div>
            {current.schema.relations.length > 0 && (
              <label className="edge-picker" data-guide-path={path.startsWith('ref:') ? path : undefined}>
                Relationship{' '}
                <NativeSelect
                  aria-label="Inspect relationship"
                  value={path.startsWith('ref:') ? path.slice(4) : ''}
                  onChange={(e) =>
                    e.target.value && pick('ref:' + e.target.value)
                  }
                >
                  <NativeSelectOption value="">
                    Select a relationship
                  </NativeSelectOption>
                  {current.schema.relations.map((r) => (
                    <NativeSelectOption key={r.id}>{r.id}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>
        </>
      )}
      {tab === 'Changes' && (
        <div className="schema-changes">
          {before?.error ? (
            <p>Baseline preview unavailable · {before.error}</p>
          ) : (
            current.schema &&
            (changes.length ? (
              changes.map((c) => (
                <button
                  key={c.path}
                  aria-pressed={path === c.path}
                  onClick={() => pick(c.path)}
                >
                  <span data-change={c.state}>{c.state}</span>
                  <div>
                    <code>{c.label}</code>
                    {!c.path.startsWith('table:') && (
                      <small className="change-detail">
                        {c.before && <del>{c.before}</del>}{' '}
                        {c.after && <ins>{c.after}</ins>}
                      </small>
                    )}
                  </div>
                  <Icon name="chat" size={14} />
                </button>
              ))
            ) : (
              <p>No table, column or relationship changes.</p>
            ))
          )}
        </div>
      )}
    </div>
  )
}
