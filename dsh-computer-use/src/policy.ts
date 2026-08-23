/**
 * Action approval gate.
 *
 * A `tools/pre-execute` listener that risk-classifies each `computer_act` and
 * asks for one-shot confirmation for anything above `read`. The tools pipeline
 * services the `{ kind: 'ask' }` decision through `ctx.approval`; with no
 * answerer it fails closed to deny.
 *
 * The decision is deterministic on the action type only — it never reads page
 * text or accessibility content, so a page cannot grant itself permission.
 * @module dsh-computer-use/policy
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { requiresApproval, riskLevelOfActionType } from './risk.ts'

/** Approval-gate options. */
export interface ApprovalGateConfig {
  /** Ask before risky `computer_act` calls. Defaults to true (fail-safe). */
  confirmActions?: boolean
}

/**
 * Register the risk-based confirmation gate for Computer Use actions.
 * `computer_observe` / `computer_perceive` (read-only) and `computer_stop` are
 * always allowed; `computer_act` asks unless its action type is `read`.
 */
export function applyApprovalGate(ctx: Context, config: ApprovalGateConfig = {}): void {
  if (config.confirmActions === false) return
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (exec.name !== 'computer_act') return next()
    const action = (exec.arguments as { action?: unknown } | undefined)?.action as { type?: string } | undefined
    const level = riskLevelOfActionType(action?.type ?? '')
    if (!requiresApproval(level)) return next()
    return { kind: 'ask', reason: `Confirm this Computer Use action (risk level: ${level}).` }
  })
}
