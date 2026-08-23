/**
 * Perception tests (keyless): JSON extraction/parsing from vision-model output,
 * plus the full `perceiveWithVision` pipeline driven through a mock `ctx.llm`
 * that emits a fixed text stream (no vision model or key required).
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJson, parsePerceptionResult } from '../src/core.ts'
import { perceiveWithVision } from '../src/perception.ts'
import { ComputerUseError } from '../src/errors.ts'
import type { ComputerUseObservation } from '../src/types.ts'

test('extractJson strips markdown fences and surrounding prose', () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}')
  assert.equal(extractJson('Here you go: {"a":1} — hope it helps'), '{"a":1}')
  assert.equal(extractJson('no braces at all'), 'no braces at all')
})

test('parsePerceptionResult parses a clean vision result', () => {
  const result = parsePerceptionResult('o1' as never, JSON.stringify({
    summary: 'a login form',
    elements: [{ role: 'button', name: 'Submit', x: 10, y: 20, width: 80, height: 24, confidence: 0.95 }],
  }))
  assert.equal(result.observationId, 'o1')
  assert.equal(result.summary, 'a login form')
  assert.equal(result.elements.length, 1)
  assert.equal(result.elements[0].source, 'vision')
  assert.equal(result.elements[0].name, 'Submit')
  assert.equal(result.elements[0].bounds.x, 10)
  assert.equal(result.elements[0].confidence, 0.95)
})

test('parsePerceptionResult tolerates missing summary and elements', () => {
  const result = parsePerceptionResult('o1' as never, '{}')
  assert.equal(result.summary, '')
  assert.deepEqual(result.elements, [])
})

test('parsePerceptionResult rejects non-JSON output', () => {
  assert.throws(
    () => parsePerceptionResult('o1' as never, 'definitely not json'),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'PROVIDER_CRASHED',
  )
})

test('perceiveWithVision assembles the stream and projects the screenshot as an image block', async () => {
  let captured: { provider: string; model: string; messages: Array<{ content: Array<{ type: string; attachment?: { attachmentId: string } }> }> } | undefined
  const mockLlm = {
    async * stream(options: typeof captured) {
      captured = options
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '{"summary":"ok","elements":[]}' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const ctx = { get: (name: string) => (name === 'llm' ? mockLlm : undefined) } as never
  const observation = {
    observationId: 'o1',
    screenshot: { screenshotId: 's1', width: 100, height: 50, attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 10 },
  } as unknown as ComputerUseObservation

  const result = await perceiveWithVision(ctx, observation, { provider: 'vision', model: 'qwen-vl' })

  assert.equal(result.summary, 'ok')
  assert.ok(captured)
  assert.equal(captured.provider, 'vision')
  assert.equal(captured.model, 'qwen-vl')
  const imageBlocks = captured.messages[0].content.filter(block => block.type === 'image')
  assert.equal(imageBlocks.length, 1)
  assert.equal(imageBlocks[0].attachment?.attachmentId, 'sha256:abc')
})

test('perceiveWithVision fails closed without a configured route', async () => {
  const ctx = { get: () => undefined } as never
  const observation = { observationId: 'o1' } as unknown as ComputerUseObservation
  await assert.rejects(
    () => perceiveWithVision(ctx, observation, {}),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'VISION_ROUTE_UNAVAILABLE',
  )
})
