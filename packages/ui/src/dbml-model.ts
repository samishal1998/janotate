import {
  Compiler,
  Filepath,
  MemoryProjectLayout,
  getRelationshipOp,
  addDoubleQuoteIfNeeded,
} from '@dbml/parse'
export type Field = { name: string; type: string; settings: string }
export type Table = {
  name: string
  fields: Field[]
  indexes: { id: string; definition: string }[]
}
export type Relation = {
  id: string
  left: string
  right: string
  sourceTable: string
  targetTable: string
  rules: string
  operator: string
}
export type Schema = { tables: Table[]; relations: Relation[] }

function qualified(schema: string | null, name: string) {
  return [schema, name]
    .filter(Boolean)
    .map((n) => addDoubleQuoteIfNeeded(n))
    .join('.')
}
export function parseDbml(source: string): Schema {
  const file = Filepath.from('/review.dbml'),
    compiler = new Compiler(new MemoryProjectLayout({ '/review.dbml': source }))
  const issue = compiler
    .initMonacoServices()
    .diagnosticsProvider.provideErrors(file)[0]
  if (issue) throw Error('Line ' + issue.startRow + ' · ' + issue.text)
  const db = compiler.interpretFile(file).getValue()
  if (!db?.tables.length)
    throw Error('Add a table to preview its relationships.')
  const tables = db.tables.map((t) => ({
    name: qualified(t.schemaName, t.name),
    indexes: t.indexes.map((index) => {
      const cols = index.columns
        .map((c) => c.value + (c.sortOrder ? ' ' + c.sortOrder : ''))
        .join(', ')
      return {
        id: index.name ?? '(' + cols + ')',
        definition: [
          index.pk ? 'primary key' : index.unique ? 'unique index' : 'index',
          '(' + cols + ')',
          index.type,
        ]
          .filter(Boolean)
          .join(' '),
      }
    }),
    fields: t.fields.map((f) => ({
      name: addDoubleQuoteIfNeeded(f.name),
      type: qualified(f.type.schemaName, f.type.type_name).replace(
        /^"([^"]+)"$/,
        '$1',
      ),
      settings: [
        f.pk && 'pk',
        f.unique && 'unique',
        f.not_null && 'not null',
        f.increment && 'increment',
        f.dbdefault &&
          'default: ' +
            (f.dbdefault.type === 'string'
              ? JSON.stringify(f.dbdefault.value)
              : f.dbdefault.value),
        f.note?.value && 'note: ' + f.note.value,
      ]
        .filter(Boolean)
        .join(', '),
    })),
  }))
  const relations = db.refs.map((r) => {
    const [a, b] = r.endpoints,
      sourceTable = qualified(a.schemaName, a.tableName),
      targetTable = qualified(b.schemaName, b.tableName)
    const fields = (names: string[]) =>
      names.map((n) => addDoubleQuoteIfNeeded(n)).join(', ')
    const left = sourceTable + '.' + fields(a.fieldNames),
      right = targetTable + '.' + fields(b.fieldNames),
      operator = getRelationshipOp(a.relation, b.relation)
    return {
      left,
      right,
      operator,
      rules: [
        r.onDelete && 'on delete ' + r.onDelete,
        r.onUpdate && 'on update ' + r.onUpdate,
      ]
        .filter(Boolean)
        .join(', '),
      sourceTable,
      targetTable,
      id: left + ' ' + operator + ' ' + right,
    }
  })
  return { tables, relations }
}
export function compareSchema(before: Schema, after: Schema) {
  const changes: {
    path: string
    label: string
    state: string
    before?: string
    after?: string
  }[] = []
  const compare = (left: Map<string, string>, right: Map<string, string>) => {
    for (const path of new Set([...left.keys(), ...right.keys()])) {
      if (left.get(path) === right.get(path)) continue
      changes.push({
        path,
        before: left.get(path),
        after: right.get(path),
        label: path.slice(path.indexOf(':') + 1),
        state: left.has(path)
          ? right.has(path)
            ? 'Changed'
            : 'Removed'
          : 'Added',
      })
    }
  }
  function entries(schema: Schema) {
    const out = new Map<string, string>()
    for (const t of schema.tables) {
      out.set('table:' + t.name, t.name)
      for (const index of t.indexes)
        out.set('index:' + t.name + '.' + index.id, index.definition)
      for (const f of t.fields)
        out.set(
          'field:' + t.name + '.' + f.name,
          f.type + (f.settings ? ' [' + f.settings + ']' : ''),
        )
    }
    for (const r of schema.relations)
      out.set('ref:' + r.id, r.id + (r.rules ? ' [' + r.rules + ']' : ''))
    return out
  }
  compare(entries(before), entries(after))
  return changes
}
