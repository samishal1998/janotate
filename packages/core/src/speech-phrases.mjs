// The browser packs these phrases into requests. The native worker uses the
// same boundaries to put the pauses in the audio itself.
const boundary =
  /(?:[.!?,:;…]+[”’"')\]}]*(?=\s|$)|[。！？、，；：]+[”’"')\]}]*)(\s*)|(\n\s*)/gu
export function endsWithAbbreviation(text) {
  return (
    /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|(?:[a-z]\.)+[a-z])\.$/iu.test(text) ||
    /\b[A-Z]\.$/u.test(text)
  )
}

function pauseDuration(mark, separator) {
  if (separator === '\n\n') return 700
  if (separator === '\n') return 450
  if (/^[,，、]/u.test(mark)) return 120
  if (/^[:;：；]/u.test(mark)) return 200
  if (/…|\.{3}/u.test(mark)) return 420
  return 300
}

export function speechPhrases(input) {
  const text = input.replace(/\r\n?|\u2028/g, '\n').replace(/\u2029/g, '\n\n')
  const phrases = []
  let start = 0
  for (const match of text.matchAll(boundary)) {
    const space = match[1] ?? match[2]
    const mark = match[0].slice(0, match[0].length - space.length)
    const end = match.index + mark.length
    const phrase = text.slice(start, end).trim()
    const newline = space.includes('\n')
    if (
      !newline &&
      mark === '.' &&
      end + space.length < text.length &&
      endsWithAbbreviation(phrase)
    )
      continue
    const paragraph = /\n[^\S\n]*\n/u.test(space)
    const separator = paragraph ? '\n\n' : newline ? '\n' : space ? ' ' : ''
    if (phrase)
      phrases.push({
        text: phrase,
        separator,
        pauseMs: pauseDuration(mark, separator),
      })
    start = match.index + match[0].length
  }
  const tail = text.slice(start).trim()
  if (tail) phrases.push({ text: tail, separator: '', pauseMs: 0 })
  return phrases
}
