import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-json'

export type DiffToken =
  | { type: 'text'; value: string }
  | { type: 'syntax'; className: string; children: DiffToken[] }
function token(t): DiffToken {
  return typeof t === 'string'
    ? { type: 'text', value: t }
    : {
        type: 'syntax',
        className: 'token ' + t.type,
        children: (Array.isArray(t.content) ? t.content : [t.content]).map(
          token,
        ),
      }
}

export function diffTokens(line: string, language: string): DiffToken[] {
  const grammar = Prism.languages[language]
  return (
    grammar && line.length < 4000 ? Prism.tokenize(line, grammar) : [line]
  ).map(token)
}
