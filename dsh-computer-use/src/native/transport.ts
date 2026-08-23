/**
 * Client transport for the native helper protocol: request-id correlation,
 * per-request timeout, event fan-out, and fail-closed teardown on malformed
 * frames or connection loss. The wire connection is injected via
 * {@link Connection}, so the transport tests keyless against a mock helper.
 * @module dsh-computer-use/native/transport
 */

import { decodeFrame, encodeFrame } from './framing.ts'
import type { NativeEvent, NativeMethod, NativeResponse } from './protocol.ts'
import { ComputerUseError } from '../errors.ts'
import type { ComputerUseErrorCode } from '../errors.ts'

/** A raw bidirectional wire channel the transport drives with framed bytes. */
export interface Connection {
  send(data: Uint8Array): void
  onFrame(handler: (data: Uint8Array) => void): void
  onClose(handler: () => void): void
  close(): Promise<void>
}

interface Pending {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Correlates JSON-RPC-style requests over a framed {@link Connection}. One
 * transport per helper process; not thread-safe by construction (single host
 * event loop).
 */
export class NativeHelperTransport {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly eventHandlers = new Set<(event: NativeEvent) => void>()
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  private closed = false

  constructor(private readonly connection: Connection, private readonly timeoutMs = 10_000) {
    connection.onFrame(data => this.onData(data))
    connection.onClose(() => this.failAll(new ComputerUseError('native helper disconnected', 'PROVIDER_CRASHED')))
  }

  /** Subscribe to helper-pushed events; returns the disposer. */
  onEvent(handler: (event: NativeEvent) => void): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  /** Send one request and await its correlated response. */
  request(method: NativeMethod, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new ComputerUseError('native helper transport is closed', 'PROVIDER_CRASHED'))
    }
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new ComputerUseError(`native helper request "${method}" timed out`, 'PROVIDER_TIMEOUT'))
      }, this.timeoutMs)
      const onAbort = () => {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new ComputerUseError(`native helper request "${method}" aborted`, 'USER_INTERRUPTED'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, { resolve, reject, timer })
      this.connection.send(encodeFrame({ id, method, params }))
    })
  }

  /** Fail all in-flight requests and close the connection. */
  async close(): Promise<void> {
    this.failAll(new ComputerUseError('native helper transport closed', 'PROVIDER_CRASHED'))
    await this.connection.close()
  }

  private onData(data: Uint8Array): void {
    this.buffer = concat(this.buffer, data)
    while (this.buffer.length > 0) {
      let frame
      try {
        frame = decodeFrame(this.buffer)
      } catch {
        this.failAll(new ComputerUseError('malformed native helper frame', 'PROTOCOL_MISMATCH'))
        return
      }
      if (frame === null) break
      this.buffer = this.buffer.subarray(frame.consumed)
      this.onMessage(frame.message)
    }
  }

  private onMessage(message: unknown): void {
    const m = message as Partial<NativeResponse> & Partial<NativeEvent>
    if (typeof m.id === 'number') {
      const pending = this.pending.get(m.id)
      if (pending === undefined) return // late/unknown id — ignore
      this.pending.delete(m.id)
      clearTimeout(pending.timer)
      const response = m as NativeResponse
      if (response.ok) {
        pending.resolve(response.result)
      } else {
        pending.reject(new ComputerUseError(
          response.error?.message ?? 'native helper error',
          (response.error?.code ?? 'PROVIDER_CRASHED') as ComputerUseErrorCode,
        ))
      }
      return
    }
    if (typeof m.event === 'string') {
      const event = m as NativeEvent
      for (const handler of this.eventHandlers) handler(event)
    }
  }

  private failAll(error: Error): void {
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
