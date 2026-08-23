/**
 * Length-prefixed framing for the native helper protocol.
 *
 * Every frame is a 4-byte little-endian unsigned length followed by that many
 * UTF-8 JSON bytes. Screenshots travel out of band (never in a frame), so one
 * small cap serves both directions. This is OUR framing — pure (no I/O) so it
 * unit-tests keyless.
 * @module dsh-computer-use/native/framing
 */

/** Single-frame cap (bytes). Oversized frames fail closed. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024 // 8 MiB

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Serialize one JSON value into a length-prefixed frame. */
export function encodeFrame(payload: unknown): Uint8Array {
  const bytes = encoder.encode(JSON.stringify(payload))
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new Error(`frame of ${bytes.length} bytes exceeds ${MAX_FRAME_BYTES}`)
  }
  const frame = new Uint8Array(4 + bytes.length)
  new DataView(frame.buffer).setUint32(0, bytes.length, true)
  frame.set(bytes, 4)
  return frame
}

/**
 * Decode one complete frame from the head of `buffer`.
 *
 * @returns `{ message, consumed }` when a full frame was parsed, or `null` when
 *          the buffer holds an incomplete frame (caller waits for more bytes).
 * @throws on an oversized declared length or malformed JSON.
 */
export function decodeFrame(buffer: Uint8Array): { message: unknown; consumed: number } | null {
  if (buffer.length < 4) return null
  const length = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(0, true)
  if (length > MAX_FRAME_BYTES) {
    throw new Error(`declared frame length ${length} exceeds ${MAX_FRAME_BYTES}`)
  }
  if (buffer.length < 4 + length) return null
  const json = decoder.decode(buffer.subarray(4, 4 + length))
  let message: unknown
  try {
    message = JSON.parse(json)
  } catch {
    throw new Error('malformed JSON frame')
  }
  return { message, consumed: 4 + length }
}
