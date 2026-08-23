/**
 * Native helper protocol vocabulary (v1). Pure types and constants — no
 * harness dependencies, so it is shared by the TypeScript client and unit tests.
 * @module dsh-computer-use/native/protocol
 */

export const PROTOCOL_VERSION = 1

export const NATIVE_METHODS = [
  'handshake',
  'listTargets',
  'observe',
  'act',
  'stop',
  'ping',
  'close',
] as const

export type NativeMethod = (typeof NATIVE_METHODS)[number]

/** client → helper */
export interface NativeRequest {
  id: number
  method: NativeMethod
  params: Record<string, unknown>
}

/** helper → client (correlated by id) */
export interface NativeResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

/** helper → client (unsolicited) */
export interface NativeEvent {
  event: string
  data: Record<string, unknown>
}
