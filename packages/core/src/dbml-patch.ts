import {
  applyPatch,
  createTwoFilesPatch,
  FILE_HEADERS_ONLY,
  formatPatch,
  parsePatch,
} from 'diff'

export type DbmlPatch = {
  format: 'unified_diff'
  patch: string
  base_revision: number
}
type Source = { source_text: string; filename?: string; revision: number }

function filePath(filename: string | undefined) {
  if (
    !filename ||
    [...filename].some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    /["\\:]/.test(filename) ||
    filename
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  )
    return 'schema.dbml'
  return filename
}

export function dbmlPatch(item: Source, edited: string): DbmlPatch {
  if (edited.length > 100000)
    throw Error('DBML must be at most 100,000 characters')
  const result: DbmlPatch = {
    format: 'unified_diff',
    base_revision: item.revision,
    patch: '',
  }
  if (item.source_text === edited) return result
  const name = filePath(item.filename),
    oldName = 'a/' + name,
    newName = 'b/' + name
  const patch = createTwoFilesPatch(
    oldName,
    newName,
    item.source_text,
    edited,
    undefined,
    undefined,
    {
      context: 3,
      headerOptions: FILE_HEADERS_ONLY,
      maxEditLength: 1024,
    },
  )
  if (patch !== undefined) return { ...result, patch }

  // Bound the edit search for large rewrites. Keep a single replacement hunk
  // between the common prefix and suffix, including three context lines.
  const lines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const oldLines = lines(item.source_text),
    newLines = lines(edited)
  let start = 0,
    tail = 0
  while (start < oldLines.length && oldLines[start] === newLines[start]) start++
  while (
    tail < Math.min(oldLines.length, newLines.length) - start &&
    oldLines[oldLines.length - tail - 1] ===
      newLines[newLines.length - tail - 1]
  )
    tail++
  const from = Math.max(0, start - 3),
    endContext = Math.min(3, tail)
  const hunkLines: string[] = []
  function append(prefix: string, block: string[]) {
    for (const line of block) {
      if (line.endsWith('\n')) hunkLines.push(prefix + line.slice(0, -1))
      else hunkLines.push(prefix + line, '\\ No newline at end of file')
    }
  }
  append(' ', oldLines.slice(from, start))
  append('-', oldLines.slice(start, oldLines.length - tail))
  append('+', newLines.slice(start, newLines.length - tail))
  append(
    ' ',
    oldLines.slice(oldLines.length - tail, oldLines.length - tail + endContext),
  )
  return {
    ...result,
    patch: formatPatch(
      {
        oldFileName: oldName,
        newFileName: newName,
        oldHeader: undefined,
        newHeader: undefined,
        hunks: [
          {
            oldStart: from + 1,
            newStart: from + 1,
            oldLines: oldLines.length - tail + endContext - from,
            newLines: newLines.length - tail + endContext - from,
            lines: hunkLines,
          },
        ],
      },
      FILE_HEADERS_ONLY,
    ),
  }
}

export function dbmlText(item: Source, value: DbmlPatch) {
  if (value.base_revision !== item.revision)
    throw Error('The schema changed. Reload the latest revision before saving.')
  if (!value.patch) return item.source_text
  const filename = filePath(item.filename)
  const files = parsePatch(value.patch)
  const file = files[0]
  if (
    files.length !== 1 ||
    !file.hunks.length ||
    file.oldFileName !== 'a/' + filename ||
    file.newFileName !== 'b/' + filename
  )
    throw Error('Invalid DBML patch header')
  const edited = applyPatch(item.source_text, file, {
    autoConvertLineEndings: false,
  })
  if (edited === false || edited.length > 100000)
    throw Error('The DBML patch does not apply to this revision.')
  return edited
}
