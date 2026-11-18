import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import Ajv from 'ajv'
export async function frames(
  locate,
  appOrigin,
  bind = '127.0.0.1',
  publicOrigin?: string,
  port = 0,
) {
  const tickets = new Map(),
    messages = new Map()
  let origin = ''
  const server = createServer(async (req, res) => {
    const deny = (status) =>
      res.writeHead(status, { 'Cache-Control': 'no-store' }).end()
    if (req.headers.host !== new URL(origin).host) return deny(403)
    const t = tickets.get(req.url)
    if (!t || t.expires < Date.now()) return deny(404)
    const store = locate(t.review),
      review = store.get(t.review),
      item = review.items.find((i) => i.id === t.key)
    if (review.state !== 'open' || item?.revision !== t.revision)
      return deny(409)
    const endpoint = origin + req.url
    if (req.method === 'GET') {
      const allow = (key) =>
        item.assets?.[key]?.map((s) => new URL(s).href).join(' ') ?? ''
      const policy = [
        'sandbox allow-scripts allow-forms',
        "default-src 'none'",
        "script-src 'unsafe-inline' " + allow('scripts'),
        "style-src 'unsafe-inline' " + allow('styles'),
        'img-src ' + (allow('images') || "'none'"),
        "base-uri 'none'",
        'frame-ancestors ' + appOrigin(),
        'form-action ' + endpoint,
        'connect-src ' + endpoint,
      ].join('; ')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': policy,
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      return res.end('<!doctype html><meta charset="utf-8">' + item.html)
    }
    if (req.headers.origin !== 'null') return deny(403)
    res.setHeader('Access-Control-Allow-Origin', 'null')
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
      return deny(204)
    }
    if (req.method !== 'POST' || t.used) return deny(409)
    try {
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > 131072) return deny(413)
        chunks.push(chunk)
      }
      const raw = Buffer.concat(chunks).toString()
      const form = req.headers['content-type']?.startsWith(
        'application/x-www-form-urlencoded',
      )
      const value = form
        ? Object.fromEntries(new URLSearchParams(raw))
        : JSON.parse(raw)
      if (!t.validate(value))
        throw Error('Invalid answer: ' + t.validate.errors?.[0]?.message)
      if (t.used || tickets.get(req.url) !== t) return deny(409)
      store.acceptHtml(t.review, t.key, t.revision, value)
      t.used = true
      messages.set(t.key, 'Answer accepted')
      return deny(204)
    } catch (e) {
      messages.set(t.key, e.message)
      // A 204 leaves a plain form visible so the reviewer can correct it.
      return deny(req.headers['sec-fetch-mode'] === 'navigate' ? 204 : 422)
    }
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(port, bind, ok)
  })
  origin = publicOrigin
    ? new URL(publicOrigin).origin
    : 'http://' + bind + ':' + (server.address() as AddressInfo).port
  return {
    origin,
    issue(review, item) {
      const validate = new Ajv({
        removeAdditional: 'all',
        strict: false,
        ownProperties: true,
      }).compile(item.expects)
      const now = Date.now()
      for (const [path, t] of tickets)
        if (t.key === item.id || t.expires < now) tickets.delete(path)
      const path = '/html/' + item.id + '/' + randomBytes(32).toString('hex')
      tickets.set(path, {
        key: item.id,
        review,
        revision: item.revision,
        validate,
        expires: now + 3600000,
        used: false,
      })
      messages.delete(item.id)
      return origin + path
    },
    status(key) {
      return messages.get(key) ?? 'Awaiting form submission'
    },
    close() {
      server.closeAllConnections()
      server.close()
    },
  }
}
