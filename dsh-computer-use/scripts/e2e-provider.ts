/**
 * End-to-end provider demo: drive the ACTUAL PlaywrightComputerUseProvider
 * (the plugin's real code) to open a public page, observe (screenshot +
 * accessibility), and run MiMo-V2.5 vision over the captured screenshot.
 * Proves the full computer-use loop works without the agent runtime.
 * @module dsh-computer-use/scripts
 */

import { PlaywrightComputerUseProvider } from '../src/providers/playwright.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readCredential(name: string): string {
  const text = readFileSync(resolve(process.env.USERPROFILE!, '.dsh', '.credentials.yaml'), 'utf8')
  const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))
  if (match === null) throw new Error(`missing credential ${name}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

const store = new Map<string, Uint8Array>()
const attachments = {
  async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
    const view = new DataView(input.data.buffer, input.data.byteOffset, input.data.byteLength)
    const attachmentId = `sha256:demo-${input.data.length}`
    store.set(attachmentId, input.data)
    return {
      attachmentId,
      mediaType: input.mediaType as 'image/png',
      bytes: input.data.length,
      width: view.getUint32(16),
      height: view.getUint32(20),
      name: input.name,
    }
  },
}

async function vision(data: Uint8Array): Promise<string> {
  const key = readCredential('XIAOMI_API_KEY')
  const resp = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this page and list its interactive elements as JSON: {"summary":"...","elements":[{"role","name","x","y","width","height","confidence"}]}.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(data).toString('base64')}` } },
        ],
      }],
    }),
  })
  return resp.text()
}

async function main(): Promise<void> {
  const provider = new PlaywrightComputerUseProvider(attachments as never)
  const session = await provider.start({ startUrl: 'https://example.com' })
  const target = session.targets[0]
  const obs = await provider.observe({
    sessionId: session.sessionId,
    targetId: target.targetId,
    include: { screenshot: true, accessibility: true },
  })

  console.log('=== observation (plugin provider) ===')
  console.log('url:', obs.url)
  console.log('title:', obs.title)
  console.log('screenshot:', obs.screenshot ? `${obs.screenshot.width}x${obs.screenshot.height} (${obs.screenshot.bytes}B) ref=${obs.screenshot.attachmentId}` : '(none)')
  console.log('a11y elements:', obs.accessibility?.elements.length)

  const shot = store.get(obs.screenshot!.attachmentId)!
  console.log('\n=== vision (mimo-v2.5 over the plugin screenshot) ===')
  const body = await vision(shot)
  const parsed = JSON.parse(body)
  const content = parsed.choices?.[0]?.message?.content ?? body
  console.log(String(content).slice(0, 700))

  await provider.stop({ sessionId: session.sessionId })
  await provider.dispose()
  console.log('\n=== provider stop + dispose OK ===')
}

main().catch((error) => {
  console.error('E2E PROVIDER FAILED:', error instanceof Error ? error.stack : error)
  process.exit(1)
})
