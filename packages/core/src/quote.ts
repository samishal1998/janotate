export type TextQuote = {
  exact: string
  start?: number
  prefix?: string
  suffix?: string
}

// Reattach only when the position or surrounding text identifies one passage.
export function quoteOffset(
  body: string,
  { exact, start, prefix, suffix }: TextQuote,
  strictContext = false,
): number {
  if (!exact) return -1
  function hasContext(at: number) {
    const end = at + exact.length
    if (
      strictContext &&
      ((prefix === '' && at !== 0) || (suffix === '' && end !== body.length))
    )
      return false
    return (
      (!prefix || body.slice(Math.max(0, at - prefix.length), at) === prefix) &&
      (!suffix || body.slice(end, end + suffix.length) === suffix)
    )
  }
  if (start !== undefined && body.startsWith(exact, start) && hasContext(start))
    return start
  let matches = 0,
    contextualMatches = 0,
    last = -1,
    lastInContext = -1
  for (
    let at = body.indexOf(exact);
    at !== -1;
    at = body.indexOf(exact, at + 1)
  ) {
    matches++
    last = at
    if (hasContext(at)) {
      contextualMatches++
      lastInContext = at
    }
  }
  return !strictContext && matches === 1
    ? last
    : contextualMatches === 1
      ? lastInContext
      : -1
}
