/**
 * Agent-side helper: request cookies from the running Chrome extension via the
 * local receiver, and wait until they are extracted and returned.
 *
 * Usage:
 *   pnpm exec tsx scripts/request-cookies.ts <domain>
 *   pnpm exec tsx scripts/request-cookies.ts all <comma,separated,allowlist>
 *
 * Examples:
 *   request-cookies.ts x.com                              # one domain
 *   request-cookies.ts all x.com,xiaohongshu.com          # every cookie, filtered to these domains
 * @module dsh-computer-use/scripts
 */

const BASE = 'http://127.0.0.1:8765'

async function main(): Promise<void> {
  const domain = process.argv[2]?.trim()
  if (domain === undefined || domain === '') {
    console.error('usage: request-cookies.ts <domain> | request-cookies.ts all <allowlist>')
    process.exit(1)
  }
  const allowlist = (process.argv[3] ?? '').split(',').map((d) => d.trim()).filter((d) => d !== '')

  console.log(`Requesting cookies (domain=${domain}${allowlist.length ? `, allowlist=[${allowlist.join(', ')}]` : ''})…`)

  const resp = await fetch(`${BASE}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, allowlist }),
  })
  if (!resp.ok) {
    console.error(`receiver responded ${resp.status}: ${await resp.text()}`)
    process.exit(1)
  }
  console.log('Request queued. Waiting for the extension to extract…')

  const deadline = Date.now() + 120_000
  let done = false
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const pending = await fetch(`${BASE}/pending`).then((r) => r.json()) as { domain: string | null }
      if (pending.domain === null) { done = true; break }
    } catch {
      // receiver down — keep waiting
    }
  }

  if (!done) {
    console.error('Timed out waiting for the extension. Is the DSH Cookie Bridge extension (v2) installed and Chrome running?')
    process.exit(1)
  }

  console.log('Done — cookies saved to cookies.json.')
  console.log('Plugin config:  importCookies: true, cookiesFile: "<…>/cookies.json"')
}

main().catch((error) => {
  console.error('REQUEST FAILED:', error instanceof Error ? error.message : error)
  process.exit(1)
})
