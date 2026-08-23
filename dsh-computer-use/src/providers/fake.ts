/**
 * Deterministic in-memory provider for contract tests and keyless demos.
 *
 * Produces a stable fake target and observation, enforces the
 * "one observation, one action" invariant (an act against a stale or expired
 * observation throws STALE_OBSERVATION), and regenerates ids after every
 * action — so the whole start → observe → act → observe → stop cycle runs with
 * no mouse, keyboard, or network.
 * @module dsh-computer-use/providers/fake
 */

import type {
  ActRequest,
  ComputerUseObservation,
  ComputerUseProvider,
  ComputerUseSession,
  ComputerUseTarget,
  ObserveRequest,
  StartRequest,
  StopRequest,
} from '../types.ts'
import { brand } from '../ids.ts'
import type {
  ComputerUseElementId,
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from '../ids.ts'
import { ComputerUseError } from '../errors.ts'

/** Observation short-lifetime (ms): actions after this window fail closed. */
const OBSERVATION_TTL_MS = 30_000

interface FakeSessionState {
  target: ComputerUseTarget
  observation: ComputerUseObservation
}

/**
 * The fake provider. State is keyed by session id so contract tests can drive
 * several sessions in one process without them colliding.
 */
export class FakeComputerUseProvider implements ComputerUseProvider {
  readonly id = 'fake'

  private sequence = 0
  private readonly sessions = new Map<string, FakeSessionState>()

  available(): boolean {
    return true
  }

  async start(request: StartRequest): Promise<ComputerUseSession> {
    const sessionId = request.sessionId ?? brand<ComputerUseSessionId>(`fake-session-${++this.sequence}`)
    const url = request.startUrl ?? 'https://example.com'
    const target: ComputerUseTarget = {
      targetId: brand<ComputerUseTargetId>('fake-target'),
      kind: 'browser-page',
      title: 'Fake example page',
      url,
    }
    const observation = this.freshObservation(sessionId, target)
    this.sessions.set(sessionId, { target, observation })
    return { sessionId, providerId: this.id, targets: [target] }
  }

  async listTargets(sessionId: ComputerUseSessionId): Promise<readonly ComputerUseTarget[]> {
    const state = this.sessions.get(sessionId)
    if (!state) throw new ComputerUseError('unknown fake session', 'SESSION_NOT_FOUND')
    return [state.target]
  }

  async observe(request: ObserveRequest): Promise<ComputerUseObservation> {
    const state = this.sessions.get(request.sessionId)
    if (!state) throw new ComputerUseError('unknown fake session', 'SESSION_NOT_FOUND')
    if (state.target.targetId !== request.targetId) {
      throw new ComputerUseError('target does not belong to this session', 'TARGET_NOT_FOUND')
    }
    return state.observation
  }

  async act(request: ActRequest): Promise<ComputerUseObservation> {
    const state = this.sessions.get(request.sessionId)
    if (!state) throw new ComputerUseError('unknown fake session', 'SESSION_NOT_FOUND')
    if (state.observation.observationId !== request.observationId) {
      throw new ComputerUseError('observation is stale; re-observe before acting', 'STALE_OBSERVATION')
    }
    if (state.observation.expiresAt !== undefined && Date.now() > new Date(state.observation.expiresAt).getTime()) {
      throw new ComputerUseError('observation expired; re-observe before acting', 'STALE_OBSERVATION')
    }
    // A real provider would validate the action against the target here.
    // The fake provider regenerates ids to prove the short-lifetime invariant.
    const next = this.freshObservation(request.sessionId, state.target)
    state.observation = next
    return next
  }

  async stop(request: StopRequest): Promise<void> {
    this.sessions.delete(request.sessionId)
  }

  private freshObservation(sessionId: ComputerUseSessionId, target: ComputerUseTarget): ComputerUseObservation {
    const sequence = ++this.sequence
    const observationId = brand<ComputerUseObservationId>(`fake-obs-${sequence}`)
    const screenshotId = brand<ComputerUseScreenshotId>(`fake-shot-${sequence}`)
    const elementId = brand<ComputerUseElementId>(`fake-el-${sequence}`)
    return {
      sessionId,
      targetId: target.targetId,
      observationId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + OBSERVATION_TTL_MS).toISOString(),
      sequence,
      title: target.title,
      url: target.url,
      viewport: { width: 1280, height: 800, dpr: 1 },
      screenshot: { screenshotId, width: 1280, height: 800, attachmentId: `sha256:fake-${sequence}`, mediaType: 'image/png', bytes: 0 },
      accessibility: {
        tree: `[0] link "Learn more" {x:100,y:100,w:80,h:20}`,
        focusedElement: 'link "Learn more"',
        elements: [{ elementId, role: 'link', name: 'Learn more', bounds: { x: 100, y: 100, width: 80, height: 20 } }],
      },
    }
  }
}
