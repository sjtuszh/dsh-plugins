/**
 * Manual Windows provider E2E: spawns the REAL compiled native helper via
 * `PipeConnection`, drives it through `WindowsComputerUseProvider`, and prints
 * enumerated targets plus one real observation (WGC screenshot + UIA tree).
 *
 * Read-only: it never calls `act`, so no clicks or keystrokes are injected.
 * Run with: pnpm exec tsx scripts/e2e-windows.ts
 * @module dsh-computer-use/scripts
 */

import { resolve } from 'node:path'
import { PipeConnection } from '../src/native/connection.ts'
import { WindowsComputerUseProvider } from '../src/providers/windows.ts'

const HELPER = resolve(process.cwd(), 'native', 'windows-helper', 'bin', 'Release', 'net9.0-windows10.0.26100.0', 'win-x64', 'dsh-computer-use-helper.exe')

/** Parse PNG IHDR width/height so the mock attachment matches the real capture. */
function pngSize(data: Uint8Array): { width: number; height: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const attachments = {
  async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
    const { width, height } = pngSize(input.data)
    return {
      attachmentId: `sha256:e2e-${input.data.length}`,
      mediaType: input.mediaType as 'image/png',
      bytes: input.data.length,
      width,
      height,
      name: input.name,
    }
  },
}

async function main(): Promise<void> {
  const connection = new PipeConnection(HELPER)
  connection.start()
  const provider = new WindowsComputerUseProvider(connection, {
    attachments: attachments as never,
    timeoutMs: 15_000,
  })

  try {
    const session = await provider.start({})
    console.log('[e2e] session:', session.sessionId, 'provider:', session.providerId)
    console.log('[e2e] targets:', session.targets.length)
    for (const target of session.targets) {
      console.log(`  - ${target.targetId}  title=${JSON.stringify(target.title)}  process=${target.process ?? '(none)'}`)
    }

    if (session.targets.length > 0) {
      const target = session.targets[0]
      const obs = await provider.observe({
        sessionId: session.sessionId,
        targetId: target.targetId,
        include: { screenshot: true, accessibility: true },
      })
      console.log('[e2e] observation:', obs.observationId, 'seq', obs.sequence)
      console.log('  title:', JSON.stringify(obs.title))
      console.log('  screenshot:', obs.screenshot ? `${obs.screenshot.attachmentId} ${obs.screenshot.width}x${obs.screenshot.height} ${obs.screenshot.bytes}B` : '(none)')
      console.log('  a11y elements:', obs.accessibility?.elements.length ?? 0)
      const tree = obs.accessibility?.tree ?? ''
      console.log('  a11y tree (first 300 chars):\n' + tree.slice(0, 300).split('\n').map(line => '    ' + line).join('\n'))
    }

    await provider.stop({ sessionId: session.sessionId })
    console.log('[e2e] OK')
  } finally {
    await provider.dispose()
  }
}

main().catch((error) => {
  console.error('[e2e] FAILED:', error instanceof Error ? error.stack : error)
  process.exit(1)
})
