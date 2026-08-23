/**
 * Native helper transport tests (keyless): request correlation, error
 * responses, timeout, connection loss, and event fan-out — driven through an
 * in-memory {@link Connection} mock, no native binary or pipe required.
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFrame, encodeFrame } from '../src/native/framing.ts'
import { NativeHelperTransport, type Connection } from '../src/native/transport.ts'
import type { NativeRequest, NativeResponse } from '../src/native/protocol.ts'
import { ComputerUseError } from '../src/errors.ts'

class MockConnection implements Connection {
  private frameHandler?: (data: Uint8Array) => void
  private closeHandler?: () => void

  constructor(private readonly responder: (req: NativeRequest) => NativeResponse | undefined) {}

  send(data: Uint8Array): void {
    const request = decodeFrame(data)!.message as NativeRequest
    const response = this.responder(request)
    if (response !== undefined) {
      queueMicrotask(() => this.frameHandler?.(encodeFrame(response)))
    }
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

  /** Test-only: push an inbound frame from the "helper". */
  deliver(data: Uint8Array): void {
    this.frameHandler?.(data)
  }

  /** Test-only: simulate the helper process exiting. */
  triggerClose(): void {
    this.closeHandler?.()
  }
}

test('request resolves with the correlated helper result', async () => {
  const conn = new MockConnection(req => ({ id: req.id, ok: true, result: { hello: 'world' } }))
  const transport = new NativeHelperTransport(conn)
  assert.deepEqual(await transport.request('ping', {}), { hello: 'world' })
})

test('request rejects on a helper error response', async () => {
  const conn = new MockConnection(req => ({ id: req.id, ok: false, error: { code: 'TARGET_NOT_ALLOWED', message: 'nope' } }))
  const transport = new NativeHelperTransport(conn)
  await assert.rejects(
    () => transport.request('act', {}),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'TARGET_NOT_ALLOWED',
  )
})

test('request times out when the helper never responds', async () => {
  const conn = new MockConnection(() => undefined)
  const transport = new NativeHelperTransport(conn, 20)
  await assert.rejects(
    () => transport.request('ping', {}),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'PROVIDER_TIMEOUT',
  )
})

test('connection loss fails in-flight requests', async () => {
  const conn = new MockConnection(() => undefined)
  const transport = new NativeHelperTransport(conn, 1000)
  const pending = transport.request('ping', {})
  conn.triggerClose()
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof ComputerUseError && error.code === 'PROVIDER_CRASHED',
  )
})

test('malformed frame fails pending requests with PROTOCOL_MISMATCH', async () => {
  const conn = new MockConnection(() => undefined)
  const transport = new NativeHelperTransport(conn, 1000)
  const pending = transport.request('ping', {})
  // Declare a length that exceeds the cap.
  const bad = new Uint8Array(4)
  new DataView(bad.buffer).setUint32(0, 0xffffffff, true)
  conn.deliver(bad)
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof ComputerUseError && error.code === 'PROTOCOL_MISMATCH',
  )
})

test('events fan out to onEvent subscribers', async () => {
  const conn = new MockConnection(() => undefined)
  const transport = new NativeHelperTransport(conn)
  const seen: string[] = []
  transport.onEvent(event => seen.push(event.event))
  conn.deliver(encodeFrame({ event: 'target-changed', data: {} }))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(seen, ['target-changed'])
})
