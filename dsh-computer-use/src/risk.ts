/**
 * Action risk classification (Phase 4).
 *
 * Deterministic and page-content-independent: the classifier reads only the
 * action type, never page text, accessibility names, or screenshot content.
 * That is the prompt-injection boundary — nothing a webpage says can raise or
 * lower a risk level.
 *
 * `destructive` / `financial` / `auth` are policy/domain determinations that
 * require the future Harness permission extension, not type-derivable, so v0.1
 * classifies to `read` / `local` / `external`.
 * @module dsh-computer-use/risk
 */

export type RiskLevel = 'read' | 'local' | 'external' | 'destructive' | 'financial' | 'auth'

const READ_ACTIONS = new Set(['scroll', 'activate-target'])
const LOCAL_ACTIONS = new Set(['type-text', 'set-value', 'drag'])

/** Classify an action by its `type` field; unknown types default to external. */
export function riskLevelOfActionType(type: string): RiskLevel {
  if (READ_ACTIONS.has(type)) return 'read'
  if (LOCAL_ACTIONS.has(type)) return 'local'
  return 'external' // click-element / click-coordinate / press-key / unknown
}

/** Whether the level requires one-shot confirmation before the action runs. */
export function requiresApproval(level: RiskLevel): boolean {
  return level !== 'read'
}
