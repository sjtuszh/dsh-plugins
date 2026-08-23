/**
 * Local cookie-bridge receiver + agent-driven request queue.
 *
 * Endpoints (all on 127.0.0.1):
 *   POST /request  {"domain":"x.com"}  → agent queues a domain for extraction
 *   GET  /pending                      → extension polls for a pending domain
 *   POST /import   {"domain","cookies"}→ extension returns cookies; saved + request cleared
 *
 * Cookies are merged across exports (deduped by domain|path|name) into a
 * Playwright storage-state JSON (`cookies.json`).
 *
 * Run:  pnpm exec tsx scripts/import-cookies-server.ts
 * @module dsh-computer-use/scripts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = Number(process.env.DSH_COOKIE_BRIDGE_PORT ?? 8765)
const OUT = resolve(process.cwd(), 'cookies.json')

interface BridgeCookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}

interface BridgePayload {
  domain: string
  cookies: BridgeCookie[]
}

interface PendingRequest {
  domain: string
  allowlist: string[]
}

let pending: PendingRequest | null = null

function readExisting(): BridgeCookie[] {
  try {
    const parsed = JSON.parse(readFileSync(OUT, 'utf8')) as { cookies?: BridgeCookie[] }
    return Array.isArray(parsed.cookies) ? parsed.cookies : []
  } catch {
    return []
  }
}

function merge(existing: BridgeCookie[], incoming: BridgeCookie[]): BridgeCookie[] {
  const map = new Map<string, BridgeCookie>()
  for (const c of [...existing, ...incoming]) {
    map.set(`${c.domain}|${c.path}|${c.name}`, c)
  }
  return [...map.values()]
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => { resolveBody(body) })
  })
}

const server = createServer((req, res) => {
  const url = req.url ?? '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end(); return
  }

  if (req.method === 'GET' && url === '/pending') {
    json(res, 200, pending ?? { domain: null, allowlist: [] })
    return
  }

  if (req.method === 'POST' && url === '/request') {
    void readBody(req).then((body) => {
      try {
        const parsed = JSON.parse(body) as { domain?: string; allowlist?: string[] }
        if (typeof parsed.domain !== 'string' || parsed.domain === '') { text(res, 400, 'domain required'); return }
        const allowlist = Array.isArray(parsed.allowlist)
          ? parsed.allowlist.map((d) => String(d).trim()).filter((d) => d !== '')
          : (parsed.domain !== 'all' ? [parsed.domain] : [])
        if (parsed.domain === 'all' && allowlist.length === 0) {
          text(res, 400, '"all" requires a non-empty allowlist'); return
        }
        pending = { domain: parsed.domain, allowlist }
        console.log(`[request] queued domain="${parsed.domain}" allowlist=[${allowlist.join(', ')}] — waiting for the extension…`)
        json(res, 200, { status: 'pending', domain: parsed.domain, allowlist })
      } catch {
        text(res, 400, 'bad JSON')
      }
    })
    return
  }

  if (req.method === 'POST' && url === '/import') {
    void readBody(req).then((body) => {
      let payload: BridgePayload
      try {
        payload = JSON.parse(body) as BridgePayload
      } catch {
        text(res, 400, 'bad JSON'); return
      }
      if (!Array.isArray(payload.cookies)) { text(res, 400, 'cookies must be an array'); return }

      const merged = merge(readExisting(), payload.cookies)
      writeFileSync(OUT, JSON.stringify({ cookies: merged }, null, 2))
      if (pending !== null && pending.domain === payload.domain) pending = null
      console.log(`[${payload.domain}] +${payload.cookies.length} cookies → total ${merged.length} saved to ${OUT}`)
      text(res, 200, `OK (${payload.cookies.length} cookies, total ${merged.length})`)
    })
    return
  }

  text(res, 404, 'not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cookie bridge listening on http://127.0.0.1:${PORT}`)
  console.log(`  agent:  POST /request {"domain":"x.com"}`)
  console.log(`  ext:    GET  /pending  →  POST /import`)
  console.log(`  saved:  ${OUT}`)
  console.log('Keep this running. The extension polls /pending automatically.')
})
