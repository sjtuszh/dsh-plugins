/**
 * Durable `computer-use/*` session events.
 *
 * Log-only audit facts (NOT surface events, so no `surfaceOp`): every
 * observation, action, and stop the model drives is reconstructable from the
 * session log. This satisfies the harness's "model-visible ⟺ logged" invariant
 * — the model reads these facts only through the tool result, but a replay or
 * audit can rebuild the whole Computer Use trajectory from the log.
 * @module dsh-computer-use/events
 */

import type {} from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** A session was started against one provider. */
    'computer-use/session-started': {
      sessionId: string
      providerId: string
    }
    /** A fresh observation was captured for one target. */
    'computer-use/observed': {
      sessionId: string
      targetId: string
      observationId: string
      sequence: number
    }
    /** The model requested one action against a specific observation. */
    'computer-use/action-requested': {
      sessionId: string
      targetId: string
      observationId: string
      action: string
    }
    /** An action succeeded and produced a fresh observation. */
    'computer-use/action-completed': {
      sessionId: string
      targetId: string
      observationId: string
    }
    /** An action failed with a stable error code. */
    'computer-use/action-failed': {
      sessionId: string
      observationId: string
      code: string
    }
    /** A session was stopped. */
    'computer-use/session-stopped': {
      sessionId: string
    }
    /** A perception pass produced a structured result for one observation. */
    'computer-use/perceived': {
      sessionId: string
      observationId: string
      mode: string
    }
    /** The model handed control to the user for a manual step. */
    'computer-use/take-over': {
      sessionId: string
      reason: string
    }
    /** The model re-observed after the user finished a manual step. */
    'computer-use/resumed': {
      sessionId: string
      observationId: string
    }
  }
}

/** The `computer-use/*` event type names, for introspection and tests. */
export const COMPUTER_USE_EVENT_TYPES = [
  'computer-use/session-started',
  'computer-use/observed',
  'computer-use/action-requested',
  'computer-use/action-completed',
  'computer-use/action-failed',
  'computer-use/session-stopped',
] as const
