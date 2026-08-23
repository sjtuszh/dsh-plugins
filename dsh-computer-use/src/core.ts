/**
 * Pure Computer Use core logic with no harness dependencies: action parsing and
 * accessibility-only perception. Kept harness-free so contract tests can
 * exercise them with no `@deepseek-ai/*` imports.
 * @module dsh-computer-use/core
 */

import type {
  ComputerUseAction,
  ComputerUseObservation,
  PerceptionResult,
  PerceivedElement,
} from './types.ts'
import { brand } from './ids.ts'
import type { ComputerUseElementId, ComputerUseObservationId, ComputerUseScreenshotId } from './ids.ts'
import { ComputerUseError } from './errors.ts'

/**
 * Validate a free-form model-provided action against the closed
 * {@link ComputerUseAction} union. The tool DSL does not express the
 * discriminated union cleanly, so the canonical value is a JSON string and the
 * union is checked here.
 */
export function parseAction(raw: unknown): ComputerUseAction {
  if (typeof raw !== 'object' || raw === null) {
    throw new ComputerUseError('action must be an object', 'ACTION_NOT_SUPPORTED')
  }
  const action = raw as Record<string, unknown>
  switch (action.type) {
    case 'click-element':
      return { type: 'click-element', elementId: brand<ComputerUseElementId>(String(action.elementId)) }
    case 'click-coordinate':
      return {
        type: 'click-coordinate',
        screenshotId: brand<ComputerUseScreenshotId>(String(action.screenshotId)),
        x: Number(action.x),
        y: Number(action.y),
        button: action.button === 'right' ? 'right' : 'left',
      }
    case 'type-text':
      return { type: 'type-text', text: String(action.text) }
    case 'press-key':
      return { type: 'press-key', keys: Array.isArray(action.keys) ? action.keys.map(String) : [] }
    case 'scroll':
      return { type: 'scroll', deltaX: Number(action.deltaX), deltaY: Number(action.deltaY) }
    case 'set-value':
      return { type: 'set-value', elementId: brand<ComputerUseElementId>(String(action.elementId)), value: String(action.value) }
    case 'drag': {
      const from = (action.from ?? {}) as Record<string, unknown>
      const to = (action.to ?? {}) as Record<string, unknown>
      return {
        type: 'drag',
        screenshotId: brand<ComputerUseScreenshotId>(String(action.screenshotId)),
        from: { x: Number(from.x), y: Number(from.y) },
        to: { x: Number(to.x), y: Number(to.y) },
      }
    }
    case 'activate-target':
      return { type: 'activate-target' }
    default:
      throw new ComputerUseError(`unsupported action type: ${String(action.type)}`, 'ACTION_NOT_SUPPORTED')
  }
}

/**
 * Build a PerceptionResult from the observation's accessibility tree, with no
 * vision call. Elements keep their short-lived provider element ids.
 */
export function perceiveAccessibility(observation: ComputerUseObservation): PerceptionResult {
  const accessibility = observation.accessibility
  if (accessibility === undefined) {
    return {
      observationId: observation.observationId,
      summary: observation.title,
      elements: [],
      warnings: ['no accessibility data in this observation'],
    }
  }
  const elements: PerceivedElement[] = accessibility.elements.map(element => ({
    elementId: element.elementId,
    role: element.role,
    name: element.name,
    bounds: element.bounds,
    confidence: 1,
    source: 'accessibility',
  }))
  return { observationId: observation.observationId, summary: accessibility.tree, elements, warnings: [] }
}

/** Extract the first balanced `{...}` JSON object from a model reply. */
export function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

/** Parse vision JSON output into a PerceptionResult (fail loud on garbage). */
export function parsePerceptionResult(observationId: ComputerUseObservationId, text: string): PerceptionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    throw new ComputerUseError('vision model returned non-JSON output', 'PROVIDER_CRASHED')
  }
  const root = parsed as Record<string, unknown>
  const summary = String(root.summary ?? '')
  const rawElements = Array.isArray(root.elements) ? root.elements : []
  const elements: PerceivedElement[] = rawElements.map((raw) => {
    const e = raw as Record<string, unknown>
    return {
      role: String(e.role ?? 'element'),
      name: e.name === undefined ? undefined : String(e.name),
      bounds: { x: Number(e.x), y: Number(e.y), width: Number(e.width), height: Number(e.height) },
      confidence: Number(e.confidence ?? 1),
      source: 'vision' as const,
    }
  })
  return { observationId, summary, elements, warnings: [] }
}
