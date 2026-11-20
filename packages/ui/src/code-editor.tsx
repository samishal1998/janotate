import React, { useEffect, useRef } from 'react'
import { EditorState, Compartment, Annotation } from '@codemirror/state'
import {
  EditorView,
  type ViewUpdate,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from '@codemirror/view'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
const dbmlSyntax = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (
      stream.match(
        /^(Table|Ref|Enum|Note|Indexes|Project|TableGroup|TablePartial)\b/i,
      )
    )
      return 'keyword'
    if (stream.match(/^"[^"]*"|^'[^']*'/)) return 'string'
    if (
      stream.match(
        /^(int|integer|text|varchar|boolean|timestamp|uuid|date|decimal)\b/i,
      )
    )
      return 'typeName'
    if (stream.match(/^[\w.]+/)) return 'variableName'
    stream.next()
    return 'punctuation'
  },
})
const external = Annotation.define<boolean>()

// CodeMirror indexes newlines as one character. Map its edits back to the
// original DBML so untouched lines keep their exact line endings in the patch.
function editDbml(source: string, update: ViewUpdate) {
  const starts = [0]
  const endings = /\r\n?|\n/g
  for (const match of source.matchAll(endings))
    starts.push(match.index + match[0].length)
  const separator = source.match(endings)?.[0] ?? '\n'
  const offset = (pos: number) => {
    const line = update.startState.doc.lineAt(pos)
    return starts[line.number - 1] + pos - line.from
  }
  const chunks: string[] = []
  let next = 0
  update.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
    chunks.push(
      source.slice(next, offset(from)),
      inserted.sliceString(0, inserted.length, separator),
    )
    next = offset(to)
  })
  return chunks.join('') + source.slice(next)
}

export default function CodeEditor({
  filename,
  language,
  value,
  change,
  readOnly,
}) {
  const root = useRef<HTMLDivElement>(null),
    view = useRef<EditorView>(null),
    callback = useRef(change),
    rawValue = useRef<string>(value),
    access = useRef(new Compartment())
  callback.current = change
  const permissions = () => [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ]
  useEffect(() => {
    const editor = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          syntaxHighlighting(classHighlighter),
          language === 'dbml'
            ? dbmlSyntax
            : language === 'json'
              ? json()
              : language === 'text'
                ? []
                : javascript({ typescript: language === 'typescript' }),
          access.current.of(permissions()),
          EditorView.contentAttributes.of({
            'aria-label': filename,
            role: 'textbox',
            'aria-multiline': 'true',
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.state.readOnly &&
              !update.transactions.some((tr) => tr.annotation(external))
            ) {
              rawValue.current =
                language === 'dbml'
                  ? editDbml(rawValue.current, update)
                  : update.state.doc.toString()
              callback.current?.(rawValue.current)
            }
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [filename, language])
  useEffect(() => {
    view.current?.dispatch({
      effects: access.current.reconfigure(permissions()),
    })
  }, [readOnly])
  useEffect(() => {
    const e = view.current
    rawValue.current = value
    if (
      e &&
      e.state.doc.toString() !==
        (language === 'dbml' ? value.replace(/\r\n?/g, '\n') : value)
    )
      e.dispatch({
        changes: { from: 0, to: e.state.doc.length, insert: value },
        annotations: external.of(true),
      })
  }, [value, language])
  return (
    <div className="source-pane">
      <div className="code-bar">
        <strong>{filename}</strong>
        <span>{language}</span>
      </div>
      <div ref={root} />
    </div>
  )
}
