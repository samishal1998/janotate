import {
  endsWithAbbreviation,
  speechPhrases,
} from '../../core/src/speech-phrases.mjs'

// Aim for responsive first audio while allowing a long word to stay intact.
// Leave room under the endpoint's 800-code-point limit for a paragraph break.
export function speechChunks(text: string): string[] {
  const chunks: string[] = []
  let chunk = ''
  let length = 0
  function flush() {
    if (chunk) chunks.push(chunk.replace(/[ \t]+$/u, ''))
    chunk = ''
    length = 0
  }
  for (const phrase of speechPhrases(text.trim())) {
    const words = phrase.text.split(/\s+/u)
    const size = Array.from(phrase.text).length
    if (length && length + size > 320) flush()
    for (const [index, word] of words.entries()) {
      const chars = Array.from(word)
      const limit =
        index === words.length - 1 ? 800 - phrase.separator.length : 800
      const needed = length + Number(index > 0) + chars.length
      if (
        length &&
        (needed > limit || (needed > 320 && !endsWithAbbreviation(chunk)))
      )
        flush()
      if (index && chunk) {
        chunk += ' '
        length++
      }
      for (let i = 0; i < chars.length; i += limit) {
        if (i) flush()
        const part = chars.slice(i, i + limit)
        chunk += part.join('')
        length += part.length
      }
    }
    chunk += phrase.separator
    length += phrase.separator.length
  }
  flush()
  return chunks
}
