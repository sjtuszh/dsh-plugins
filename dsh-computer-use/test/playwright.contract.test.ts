/**
 * Playwright provider contract test — the same lifecycle/invariant contract the
 * fake provider passes, run against a real isolated Chromium.
 *
 * Requires `playwright` + the Chromium browser (`npx playwright install
 * chromium`). When either is absent the whole suite reports `skipped` rather
 * than failing, so `pnpm test` still passes on a keyless machine.
 *
 * The page fixture is a `data:` URL (no network); screenshots go to an in-memory
 * mock of `ctx.attachments`.
 * @module dsh-computer-use/test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const FIXTURE = 'data:text/html,' + encodeURIComponent(
  '<html><body><button>Click me</button><a href="https://example.com">link</a></body></html>',
)

/** Resolve the provider and verify Chromium actually launches. */
let providerCtor: (new (...args: any[]) => any) | undefined
try {
  const [providerModule, playwright] = await Promise.all([
    import('../src/providers/playwright.ts'),
    import('playwright'),
  ])
  const probe = await playwright.chromium.launch({ headless: true })
  await probe.close()
  providerCtor = providerModule.PlaywrightComputerUseProvider
} catch {
  providerCtor = undefined
}

const available = providerCtor !== undefined
const skip = available ? false : 'playwright or Chromium is not installed (npx playwright install chromium)'

/** In-memory stand-in for `ctx.attachments.saveImage`. */
const mockAttachments = {
  async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
    return {
      attachmentId: `sha256:test-${input.data.length}`,
      mediaType: input.mediaType,
      bytes: input.data.length,
      width: 1280,
      height: 800,
      name: input.name,
    }
  },
}

async function startWithButton() {
  const provider = new providerCtor!(mockAttachments)
  const session = await provider.start({ startUrl: FIXTURE })
  const target = session.targets[0]
  const observation = await provider.observe({
    sessionId: session.sessionId,
    targetId: target.targetId,
    include: { screenshot: true, accessibility: true },
  })
  return { provider, session, target, observation }
}

test('playwright: start → observe → act → observe → stop lifecycle', { skip }, async () => {
  const { provider, session, target, observation } = await startWithButton()
  try {
    assert.ok(observation.screenshot?.attachmentId.startsWith('sha256:'))
    assert.ok((observation.accessibility?.elements.length ?? 0) >= 1)
    const button = observation.accessibility!.elements[0]
    const next = await provider.act({
      sessionId: session.sessionId,
      targetId: target.targetId,
      observationId: observation.observationId,
      action: { type: 'click-element', elementId: button.elementId },
    })
    assert.notEqual(next.observationId, observation.observationId)
    await provider.stop({ sessionId: session.sessionId })
  } finally {
    await provider.dispose()
  }
})

test('playwright: stale observation fails closed', { skip }, async () => {
  const { provider, session, target, observation } = await startWithButton()
  try {
    await provider.act({
      sessionId: session.sessionId,
      targetId: target.targetId,
      observationId: observation.observationId,
      action: { type: 'activate-target' },
    })
    await assert.rejects(
      () => provider.act({
        sessionId: session.sessionId,
        targetId: target.targetId,
        observationId: observation.observationId,
        action: { type: 'activate-target' },
      }),
      (error: unknown) => (error as { code?: string }).code === 'STALE_OBSERVATION',
    )
  } finally {
    await provider.dispose()
  }
})

test('playwright: domain allowlist blocks out-of-allowlist targets', { skip }, async () => {
  const provider = new providerCtor!(mockAttachments, { allowedDomains: ['allowed.example'] })
  try {
    const session = await provider.start({ startUrl: FIXTURE })
    const target = session.targets[0]
    const observation = await provider.observe({
      sessionId: session.sessionId,
      targetId: target.targetId,
      include: { screenshot: true, accessibility: false },
    })
    await assert.rejects(
      () => provider.act({
        sessionId: session.sessionId,
        targetId: target.targetId,
        observationId: observation.observationId,
        action: { type: 'activate-target' },
      }),
      (error: unknown) => (error as { code?: string }).code === 'TARGET_NOT_ALLOWED',
    )
  } finally {
    await provider.dispose()
  }
})
