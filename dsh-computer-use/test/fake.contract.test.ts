/**
 * Contract tests for the Computer Use capability, driven entirely through the
 * deterministic `fake` provider — no browser, mouse, keyboard, network, or
 * vision model. These encode the plan's Phase 0 invariants:
 *
 * - full start → observe → act → observe → stop lifecycle;
 * - stale / wrong-target / unknown-session fail closed;
 * - ids are single-use and regenerate after every action;
 * - risk classification is deterministic and content-independent.
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeComputerUseProvider } from '../src/providers/fake.ts'
import { ComputerUseError } from '../src/errors.ts'
import { requiresApproval, riskLevelOfActionType } from '../src/risk.ts'
import { parseAction, perceiveAccessibility } from '../src/core.ts'
import type { ComputerUseObservation } from '../src/types.ts'

/** Start a session and capture one observation, for the common case. */
async function startAndObserve() {
  const provider = new FakeComputerUseProvider()
  const session = await provider.start({})
  const target = session.targets[0]
  const observation = await provider.observe({
    sessionId: session.sessionId,
    targetId: target.targetId,
    include: { screenshot: true, accessibility: true },
  })
  return { provider, session, target, observation }
}

test('start → observe → act → observe → stop lifecycle', async () => {
  const { provider, session, target, observation } = await startAndObserve()
  assert.ok(session.sessionId.length > 0)
  assert.equal(session.providerId, 'fake')
  assert.equal(session.targets.length, 1)
  assert.ok(observation.observationId.length > 0)
  assert.ok(observation.screenshot?.screenshotId.length)
  assert.ok((observation.accessibility?.elements.length ?? 0) > 0)

  const next = await provider.act({
    sessionId: session.sessionId,
    targetId: target.targetId,
    observationId: observation.observationId,
    action: { type: 'activate-target' },
  })
  assert.notEqual(next.observationId, observation.observationId)

  await provider.stop({ sessionId: session.sessionId })
})

test('act against a stale observation fails closed', async () => {
  const { provider, session, target, observation } = await startAndObserve()
  await provider.act({
    sessionId: session.sessionId,
    targetId: target.targetId,
    observationId: observation.observationId,
    action: { type: 'activate-target' },
  })
  // The old observation id is now stale.
  await assert.rejects(
    () => provider.act({
      sessionId: session.sessionId,
      targetId: target.targetId,
      observationId: observation.observationId,
      action: { type: 'activate-target' },
    }),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'STALE_OBSERVATION',
  )
})

test('wrong target fails closed', async () => {
  const { provider, session, observation } = await startAndObserve()
  await assert.rejects(
    () => provider.observe({
      sessionId: session.sessionId,
      targetId: 'other-target' as never,
      include: { screenshot: false, accessibility: false },
    }),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'TARGET_NOT_FOUND',
  )
  assert.ok(observation)
})

test('unknown session fails closed', async () => {
  const provider = new FakeComputerUseProvider()
  await assert.rejects(
    () => provider.observe({
      sessionId: 'missing' as never,
      targetId: 't' as never,
      include: { screenshot: false, accessibility: false },
    }),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'SESSION_NOT_FOUND',
  )
})

test('action regenerates screenshot and element ids', async () => {
  const { provider, session, target, observation } = await startAndObserve()
  const next = await provider.act({
    sessionId: session.sessionId,
    targetId: target.targetId,
    observationId: observation.observationId,
    action: { type: 'activate-target' },
  })
  assert.notEqual(next.screenshot?.screenshotId, observation.screenshot?.screenshotId)
  assert.notEqual(next.accessibility?.elements[0]?.elementId, observation.accessibility?.elements[0]?.elementId)
})

test('stop is idempotent and releases the session', async () => {
  const { provider, session } = await startAndObserve()
  await provider.stop({ sessionId: session.sessionId })
  await provider.stop({ sessionId: session.sessionId }) // no throw
  await assert.rejects(
    () => provider.listTargets(session.sessionId),
    (error: unknown) => error instanceof ComputerUseError && error.code === 'SESSION_NOT_FOUND',
  )
})

test('risk classification is deterministic and content-independent', () => {
  assert.equal(riskLevelOfActionType('scroll'), 'read')
  assert.equal(riskLevelOfActionType('activate-target'), 'read')
  assert.equal(riskLevelOfActionType('type-text'), 'local')
  assert.equal(riskLevelOfActionType('set-value'), 'local')
  assert.equal(riskLevelOfActionType('drag'), 'local')
  assert.equal(riskLevelOfActionType('click-element'), 'external')
  assert.equal(riskLevelOfActionType('click-coordinate'), 'external')
  assert.equal(riskLevelOfActionType('press-key'), 'external')
  assert.equal(riskLevelOfActionType('anything-else'), 'external')
  assert.equal(requiresApproval('read'), false)
  assert.equal(requiresApproval('local'), true)
  assert.equal(requiresApproval('external'), true)
})

test('parseAction maps model JSON onto the action union', () => {
  assert.deepEqual(parseAction({ type: 'click-element', elementId: 'e1' }), { type: 'click-element', elementId: 'e1' })
  assert.deepEqual(parseAction({ type: 'click-coordinate', screenshotId: 's1', x: 10, y: 20 }), { type: 'click-coordinate', screenshotId: 's1', x: 10, y: 20, button: 'left' })
  assert.deepEqual(parseAction({ type: 'click-coordinate', screenshotId: 's1', x: 1, y: 2, button: 'right' }), { type: 'click-coordinate', screenshotId: 's1', x: 1, y: 2, button: 'right' })
  assert.deepEqual(parseAction({ type: 'type-text', text: 'hi' }), { type: 'type-text', text: 'hi' })
  assert.deepEqual(parseAction({ type: 'press-key', keys: ['Control', 'A'] }), { type: 'press-key', keys: ['Control', 'A'] })
  assert.deepEqual(parseAction({ type: 'scroll', deltaX: 0, deltaY: 100 }), { type: 'scroll', deltaX: 0, deltaY: 100 })
  assert.deepEqual(parseAction({ type: 'set-value', elementId: 'e1', value: 'v' }), { type: 'set-value', elementId: 'e1', value: 'v' })
  assert.deepEqual(
    parseAction({ type: 'drag', screenshotId: 's1', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }),
    { type: 'drag', screenshotId: 's1', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
  )
  assert.deepEqual(parseAction({ type: 'activate-target' }), { type: 'activate-target' })
})

test('parseAction rejects non-actions and unknown types', () => {
  assert.throws(() => parseAction(null), (error: unknown) => error instanceof ComputerUseError && error.code === 'ACTION_NOT_SUPPORTED')
  assert.throws(() => parseAction('nope'), (error: unknown) => error instanceof ComputerUseError && error.code === 'ACTION_NOT_SUPPORTED')
  assert.throws(() => parseAction({ type: 'rm-rf' }), (error: unknown) => error instanceof ComputerUseError && error.code === 'ACTION_NOT_SUPPORTED')
})

test('perceiveAccessibility maps provider elements with accessibility source', async () => {
  const { observation } = await startAndObserve()
  const result = perceiveAccessibility(observation)
  assert.equal(result.observationId, observation.observationId)
  assert.ok(result.summary.length > 0)
  assert.equal(result.elements.length, 1)
  assert.equal(result.elements[0].source, 'accessibility')
  assert.ok(result.elements[0].elementId)
})

test('perceiveAccessibility warns without accessibility data', () => {
  const observation = { observationId: 'o1', title: 'no a11y' } as unknown as ComputerUseObservation
  const result = perceiveAccessibility(observation)
  assert.equal(result.elements.length, 0)
  assert.deepEqual(result.warnings, ['no accessibility data in this observation'])
})
