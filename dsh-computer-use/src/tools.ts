/**
 * Model-facing Computer Use tools (`computer_observe` / `computer_act` /
 * `computer_stop`) over `ctx.computerUse`.
 *
 * The tool layer owns schemas and human-readable presentation; it never owns a
 * concrete provider. Sessions persist across calls by the `sessionId` argument,
 * so the model drives one session without the tool holding process-global
 * state. The step-by-step state that matters (observations, targets, actions)
 * reaches the model through the tool result; no `computer-use/*` session events
 * are written, because this harness's session reader does not recognize those
 * out-of-repo event types and would refuse to load the session log.
 * @module dsh-computer-use/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderJson } from './render.ts'
import { brand } from './ids.ts'
import type {
  ComputerUseObservationId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from './ids.ts'
import { parseAction } from './core.ts'
import type {} from './events.ts'

/** Register `computer_observe`. */
export function applyObserveTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'computer_observe',
    description: 'Start a Computer Use session (no sessionId), list its targets, or capture a fresh observation of a target. Returns structured JSON; element and screenshot ids are valid only until the next action.',
    parameters: {
      sessionId: { type: 'string', description: 'Session id from a prior computer_observe result; omit to start a new session.' },
      targetId: { type: 'string', description: 'Target id to observe; omit when starting a session.' },
      includeScreenshot: { type: 'boolean', description: 'Capture a screenshot (default true).' },
      includeAccessibility: { type: 'boolean', description: 'Capture the accessibility tree (default false).' },
      startUrl: { type: 'string', description: 'URL to open when starting a new session (ignored when sessionId is provided).' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: args.sessionId === undefined ? 'Computer Use: start session' : args.targetId === undefined ? 'Computer Use: list targets' : 'Computer Use: observe',
      kind: 'read',
      rawInput: { sessionId: args.sessionId, targetId: args.targetId },
    }),
    async execute(args, exec) {
      if (args.sessionId === undefined) {
        const session = await ctx.computerUse.start({ startUrl: args.startUrl }, exec.signal)
        return JSON.stringify({ sessionId: session.sessionId, targets: session.targets }, null, 2)
      }
      if (args.targetId === undefined) {
        const targets = await ctx.computerUse.listTargets(brand<ComputerUseSessionId>(args.sessionId), exec.signal)
        return JSON.stringify({ sessionId: args.sessionId, targets }, null, 2)
      }
      const observation = await ctx.computerUse.observe({
        sessionId: brand<ComputerUseSessionId>(args.sessionId),
        targetId: brand<ComputerUseTargetId>(args.targetId),
        include: { screenshot: args.includeScreenshot ?? true, accessibility: args.includeAccessibility ?? false },
      }, exec.signal)
      return JSON.stringify(observation, null, 2)
    },
  }))
}

/** Register `computer_act`. */
export function applyActTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'computer_act',
    description: 'Perform exactly one action against the observation it references, then return the fresh observation. Element ids, screenshot ids, and coordinates are only valid for the observation that produced them.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Session id from computer_observe.' },
      targetId: { type: 'string', required: true, description: 'Target id from computer_observe.' },
      observationId: { type: 'string', required: true, description: 'Observation id the action references.' },
      action: { type: 'json', required: true, description: 'One action: {type:"click-element",elementId}|{type:"click-coordinate",screenshotId,x,y,button}|{type:"type-text",text}|{type:"press-key",keys}|{type:"scroll",deltaX,deltaY}|{type:"set-value",elementId,value}|{type:"drag",screenshotId,from:{x,y},to:{x,y}}|{type:"activate-target"}.' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Computer Use action',
      kind: 'execute',
      rawInput: args.action,
    }),
    async execute(args, exec) {
      const action = parseAction(args.action)
      try {
        const observation = await ctx.computerUse.act({
          sessionId: brand<ComputerUseSessionId>(args.sessionId),
          targetId: brand<ComputerUseTargetId>(args.targetId),
          observationId: brand<ComputerUseObservationId>(args.observationId),
          action,
        }, exec.signal)
        return JSON.stringify(observation, null, 2)
      } catch (error) {
        throw error
      }
    },
  }))
}

/** Register `computer_stop`. */
export function applyStopTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'computer_stop',
    description: 'Stop a Computer Use session and release its target.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Session id to stop.' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    async execute(args, exec) {
      await ctx.computerUse.stop({ sessionId: brand<ComputerUseSessionId>(args.sessionId) })
      return JSON.stringify({ sessionId: args.sessionId, stopped: true })
    },
  }))
}

/** Register `computer_take_over`. */
export function applyTakeOverTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'computer_take_over',
    description: 'Pause Computer Use and hand control to the user for a manual step (login, CAPTCHA, a security prompt). Stop issuing actions until the user asks you to resume.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Session to pause.' },
      reason: { type: 'string', description: 'Why the user should take over.' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Computer Use: take over',
      kind: 'other',
      rawInput: { reason: args.reason },
    }),
    async execute(args, exec) {
      return JSON.stringify({ sessionId: args.sessionId, takenOver: true, next: 'Wait for the user, then call computer_resume.' })
    },
  }))
}

/** Register `computer_resume`. */
export function applyResumeTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'computer_resume',
    description: 'Re-observe the target after the user performed a manual step, returning a fresh observation so Computer Use can continue.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Session id.' },
      targetId: { type: 'string', required: true, description: 'Target id.' },
      includeScreenshot: { type: 'boolean', description: 'Capture a screenshot (default true).' },
      includeAccessibility: { type: 'boolean', description: 'Capture the accessibility tree (default false).' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Computer Use: resume',
      kind: 'read',
      rawInput: { targetId: args.targetId },
    }),
    async execute(args, exec) {
      const observation = await ctx.computerUse.observe({
        sessionId: brand<ComputerUseSessionId>(args.sessionId),
        targetId: brand<ComputerUseTargetId>(args.targetId),
        include: { screenshot: args.includeScreenshot ?? true, accessibility: args.includeAccessibility ?? false },
      }, exec.signal)
      return JSON.stringify(observation, null, 2)
    },
  }))
}
