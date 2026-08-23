/**
 * Windows provider contract test (keyless): a mock native helper answers the
 * protocol, and the provider's request mapping + error propagation is verified
 * end-to-end without a native binary or pipe.
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { access, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeFrame, encodeFrame } from '../src/native/framing.ts'
import type { Connection } from '../src/native/transport.ts'
import type { NativeRequest, NativeResponse } from '../src/native/protocol.ts'
import { WindowsComputerUseProvider } from '../src/providers/windows.ts'
import { ComputerUseError } from '../src/errors.ts'

function makeObservation(sessionId: string, targetId: string, observationId: string, sequence: number) {
  return {
    sessionId,
    targetId,
    observationId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    sequence,
    title: 'Notepad',
    viewport: { width: 1280, height: 800, dpr: 1 },
    screenshot: { screenshotId: `shot-${sequence}`, width: 1280, height: 800, attachmentId: `sha256:${sequence}`, mediaType: 'image/png', bytes: 1 },
    accessibility: {
      tree: `[0] button "OK"`,
      elements: [{ elementId: `el-${sequence}`, role: 'button', name: 'OK', bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    },
  }
}

class MockHelperConnection implements Connection {
  private frameHandler?: (data: Uint8Array) => void
  private closeHandler?: () => void

  send(data: Uint8Array): void {
    const request = decodeFrame(data)!.message as NativeRequest
    const response = this.respond(request)
    if (response !== undefined) queueMicrotask(() => this.frameHandler?.(encodeFrame(response)))
  }

  onFrame(handler: (data: Uint8Array) => void): void {
    this.frameHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  async close(): Promise<void> {
    this.closeHandler?.()
  }

  private respond(request: NativeRequest): NativeResponse | undefined {
    switch (request.method) {
      case 'handshake':
        return { id: request.id, ok: true, result: { helperVersion: '0.1.0', protocolVersion: 1 } }
      case 'listTargets':
        return { id: request.id, ok: true, result: { targets: [{ targetId: 't1', kind: 'window', title: 'Notepad' }] } }
      case 'observe': {
        const params = request.params as Record<string, string>
        return { id: request.id, ok: true, result: { observation: makeObservation(params.sessionId, params.targetId, 'o1', 1) } }
      }
      case 'act': {
        const params = request.params as Record<string, string>
        return { id: request.id, ok: true, result: { observation: makeObservation(params.sessionId, params.targetId, 'o2', 2) } }
      }
      case 'stop':
        return { id: request.id, ok: true, result: {} }
      default:
        return { id: request.id, ok: false, error: { code: 'ACTION_NOT_SUPPORTED', message: 'unknown method' } }
    }
  }
}

test('windows: start → listTargets → observe → act → stop lifecycle', async () => {
  const provider = new WindowsComputerUseProvider(new MockHelperConnection())
  const session = await provider.start({})
  assert.equal(session.providerId, 'windows')
  assert.equal(session.targets.length, 1)
  assert.equal(session.targets[0].title, 'Notepad')

  const observation = await provider.observe({
    sessionId: session.sessionId,
    targetId: session.targets[0].targetId,
    include: { screenshot: true, accessibility: true },
  })
  assert.equal(observation.sequence, 1)
  assert.equal(observation.accessibility?.elements[0].name, 'OK')

  const next = await provider.act({
    sessionId: session.sessionId,
    targetId: session.targets[0].targetId,
    observationId: observation.observationId,
    action: { type: 'activate-target' },
  })
  assert.equal(next.sequence, 2)

  await provider.stop({ sessionId: session.sessionId })
})

test('windows: helper errors propagate with their code', async () => {
  const failing = new (class implements Connection {
    private frameHandler?: (data: Uint8Array) => void
    send(data: Uint8Array): void {
      const request = decodeFrame(data)!.message as NativeRequest
      let response: NativeResponse
      if (request.method === 'act') {
        response = { id: request.id, ok: false, error: { code: 'STALE_OBSERVATION', message: 're-observe' } }
      } else if (request.method === 'handshake') {
        response = { id: request.id, ok: true, result: { helperVersion: '0.1.0', protocolVersion: 1 } }
      } else if (request.method === 'listTargets') {
        response = { id: request.id, ok: true, result: { targets: [{ targetId: 't1', kind: 'window', title: 'Notepad' }] } }
      } else {
        response = { id: request.id, ok: true, result: {} }
      }
      queueMicrotask(() => this.frameHandler?.(encodeFrame(response)))
    }
    onFrame(h: (d: Uint8Array) => void): void { this.frameHandler = h }
    onClose(): void {}
    async close(): Promise<void> {}
  })()
  const provider = new WindowsComputerUseProvider(failing)
  const session = await provider.start({})
  const target = session.targets[0]
  await assert.rejects(
    () => provider.act({ sessionId: session.sessionId, targetId: target.targetId, observationId: 'o1' as never, action: { type: 'activate-target' } }),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'STALE_OBSERVATION',
  )
})

test('windows: verifies, stores, and deletes an out-of-band native screenshot', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const path = join(tmpdir(), `dsh-computer-use-test-${randomUUID()}.png`)
  await writeFile(path, png)
  let saved = false
  const attachments = {
    async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
      saved = true
      assert.deepEqual(Buffer.from(input.data), png)
      return {
        attachmentId: 'sha256:verified-native-shot',
        mediaType: 'image/png' as const,
        bytes: png.byteLength,
        width: 2,
        height: 2,
        name: input.name,
      }
    },
  }
  const native = new (class implements Connection {
    private frameHandler?: (data: Uint8Array) => void
    send(data: Uint8Array): void {
      const request = decodeFrame(data)!.message as NativeRequest
      let response: NativeResponse
      if (request.method === 'handshake') {
        response = { id: request.id, ok: true, result: { helperVersion: '0.1.0', protocolVersion: 1 } }
      } else if (request.method === 'listTargets') {
        response = { id: request.id, ok: true, result: { targets: [{ targetId: 't1', kind: 'window', title: 'Test' }] } }
      } else if (request.method === 'observe') {
        response = {
          id: request.id,
          ok: true,
          result: {
            observation: {
              ...makeObservation('native-session', 't1', 'native-observation', 1),
              screenshot: {
                screenshotId: 'native-shot',
                width: 2,
                height: 2,
                filePath: path,
                sha256: createHash('sha256').update(png).digest('hex'),
                mediaType: 'image/png',
                bytes: png.byteLength,
              },
            },
          },
        }
      } else {
        response = { id: request.id, ok: true, result: {} }
      }
      queueMicrotask(() => this.frameHandler?.(encodeFrame(response)))
    }
    onFrame(handler: (data: Uint8Array) => void): void { this.frameHandler = handler }
    onClose(): void {}
    async close(): Promise<void> {}
  })()

  try {
    const provider = new WindowsComputerUseProvider(native, { attachments: attachments as never })
    const session = await provider.start({ sessionId: 'native-session' as never })
    const observation = await provider.observe({
      sessionId: session.sessionId,
      targetId: session.targets[0].targetId,
      include: { screenshot: true, accessibility: false },
    })
    assert.equal(saved, true)
    assert.equal(observation.screenshot?.attachmentId, 'sha256:verified-native-shot')
    await assert.rejects(access(path))
    await provider.dispose()
  } finally {
    await unlink(path).catch(() => {})
  }
})
