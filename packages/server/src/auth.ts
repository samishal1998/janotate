import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
export type Hosting = {
  host: string
  uiToken: string
  mcpToken: string
  publicOrigin?: string
  frameOrigin?: string
  framePort?: number
}
export function hosted(config: Hosting) {
  const equal = (a: string, b: string) =>
    timingSafeEqual(
      createHash('sha256').update(a).digest(),
      createHash('sha256').update(b).digest(),
    )
  if (
    !config.uiToken ||
    !config.mcpToken ||
    equal(config.uiToken, config.mcpToken)
  )
    throw Error(
      'Hosted mode requires distinct JANOTATE_UI_TOKEN and JANOTATE_MCP_TOKEN',
    )
  const session = randomBytes(32).toString('hex')
  return (req, res, origin) => {
    const url = new URL(req.url, origin)
    if (url.origin !== origin) {
      res.writeHead(400).end()
      return false
    }
    if (url.pathname === '/mcp') {
      if (equal(req.headers.authorization ?? '', 'Bearer ' + config.mcpToken))
        return true
    } else {
      if (
        req.method === 'GET' &&
        equal(url.searchParams.get('token') ?? '', config.uiToken)
      ) {
        url.searchParams.delete('token')
        res
          .writeHead(303, {
            Location: url.href,
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'Set-Cookie':
              'janotate_session=' +
              session +
              '; HttpOnly; SameSite=Strict; Path=/' +
              (url.protocol === 'https:' ? '; Secure' : ''),
          })
          .end()
        return false
      }
      if (
        (req.headers.cookie ?? '')
          .split(';')
          .some((v) => equal(v.trim(), 'janotate_session=' + session))
      )
        return true
    }
    res
      .writeHead(401, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'unauthorized' }))
    return false
  }
}
