/**
 * Framing unit tests (keyless): round-trip, incomplete frames, oversized
 * length, malformed JSON, and oversized payload.
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFrame, encodeFrame, MAX_FRAME_BYTES } from '../src/native/framing.ts'

test('encodeFrame/decodeFrame round-trips JSON', () => {
  const payload = { id: 1, method: 'observe', params: { x: 1, ok: true } }
  const frame = encodeFrame(payload)
  assert.equal(frame.length, 4 + new TextEncoder().encode(JSON.stringify(payload)).length)
  assert.deepEqual(decodeFrame(frame), { message: payload, consumed: frame.length })
})

test('decodeFrame returns null on an incomplete frame', () => {
  const frame = encodeFrame({ hello: 'world' })
  assert.equal(decodeFrame(frame.subarray(0, 2)), null)
  assert.equal(decodeFrame(frame.subarray(0, 4)), null) // header only, no body yet
  assert.equal(decodeFrame(frame.subarray(0, frame.length - 1)), null) // missing last byte
})

test('decodeFrame rejects an oversized declared length', () => {
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint32(0, MAX_FRAME_BYTES + 1, true)
  assert.throws(() => decodeFrame(header), /exceeds/)
})

test('decodeFrame rejects malformed JSON', () => {
  const bytes = new TextEncoder().encode('{ not json')
  const frame = new Uint8Array(4 + bytes.length)
  new DataView(frame.buffer).setUint32(0, bytes.length, true)
  frame.set(bytes, 4)
  assert.throws(() => decodeFrame(frame), /malformed JSON/)
})

test('encodeFrame rejects an oversized payload', () => {
  assert.throws(() => encodeFrame('x'.repeat(MAX_FRAME_BYTES + 1)), /exceeds/)
})

test('unicode payloads round-trip byte-exactly', () => {
  const payload = { text: '中文 𝄞 🔒', emoji: '✅' }
  const decoded = decodeFrame(encodeFrame(payload))
  assert.deepEqual(decoded, { message: payload, consumed: encodeFrame(payload).length })
})
