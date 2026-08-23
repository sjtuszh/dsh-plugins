/**
 * Service Definition for the Computer Use capability seam.
 *
 * A provider-neutral contract for "observe a target, act once, re-observe".
 * Providers (fake / playwright / windows) implement {@link ComputerUseProvider};
 * the runtime (`ctx.computerUse`) selects one and the tool layer consumes it.
 * No provider or model type leaks into these interfaces.
 * @module dsh-computer-use/types
 */

import type {
  ComputerUseElementId,
  ComputerUseObservationId,
  ComputerUseScreenshotId,
  ComputerUseSessionId,
  ComputerUseTargetId,
} from './ids.ts'

/** A rectangular region in logical pixels. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A 2D point in logical pixels. */
export interface Point {
  x: number
  y: number
}

/** An actionable target: an isolated browser page now, a window later. */
export interface ComputerUseTarget {
  targetId: ComputerUseTargetId
  kind: 'browser-page' | 'window'
  title: string
  url?: string
  process?: string
}

/** One screenshot, bound to the observation that produced it. */
export interface ComputerUseScreenshot {
  screenshotId: ComputerUseScreenshotId
  width: number
  height: number
  /**
   * Content-addressed attachment reference resolved through
   * `ctx.attachments`. Never a base64 payload, path, or object URL.
   */
  attachmentId: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  bytes: number
}

/** One actionable element, bound to an observation's accessibility tree. */
export interface ComputerUseElement {
  elementId: ComputerUseElementId
  role: string
  name?: string
  bounds: Rect
}

/** Structured accessibility state, when the observation requests it. */
export interface ComputerUseAccessibility {
  /** Formatted tree text including element indexes, for the planner. */
  tree: string
  focusedElement?: string
  selectedText?: string
  documentText?: string
  elements: readonly ComputerUseElement[]
}

/** A point-in-time snapshot of one target. */
export interface ComputerUseObservation {
  sessionId: ComputerUseSessionId
  targetId: ComputerUseTargetId
  observationId: ComputerUseObservationId
  createdAt: string
  /** Observation short-lifetime; acting on an expired observation fails closed. */
  expiresAt?: string
  sequence: number
  title: string
  url?: string
  viewport?: { width: number; height: number; dpr: number }
  screenshot?: ComputerUseScreenshot
  accessibility?: ComputerUseAccessibility
}

/** A single, validated action against one observation. */
export type ComputerUseAction =
  | { type: 'click-element'; elementId: ComputerUseElementId }
  | { type: 'click-coordinate'; screenshotId: ComputerUseScreenshotId; x: number; y: number; button: 'left' | 'right' }
  | { type: 'type-text'; text: string }
  | { type: 'press-key'; keys: readonly string[] }
  | { type: 'scroll'; deltaX: number; deltaY: number }
  | { type: 'drag'; screenshotId: ComputerUseScreenshotId; from: Point; to: Point }
  | { type: 'set-value'; elementId: ComputerUseElementId; value: string }
  | { type: 'activate-target' }

/** Start (or resume) a session. The provider is selected by runtime config. */
export interface StartRequest {
  sessionId?: ComputerUseSessionId
  /** Optional initial URL; the Playwright provider navigates to it on start. */
  startUrl?: string
}

/** Observe one target; include controls what comes back. */
export interface ObserveRequest {
  sessionId: ComputerUseSessionId
  targetId: ComputerUseTargetId
  include: { screenshot: boolean; accessibility: boolean }
}

/** Act once against a specific observation, then re-observe. */
export interface ActRequest {
  sessionId: ComputerUseSessionId
  targetId: ComputerUseTargetId
  observationId: ComputerUseObservationId
  action: ComputerUseAction
}

/** Stop one session. */
export interface StopRequest {
  sessionId: ComputerUseSessionId
}

/** A live session handle owned by one provider. */
export interface ComputerUseSession {
  sessionId: ComputerUseSessionId
  providerId: string
  targets: readonly ComputerUseTarget[]
}

/**
 * The seam's provider interface. Providers implement the capability for one
 * mechanism (fake, Playwright browser, Windows native). State they hold is
 * per-session and must not leak provider-internal pointers into results.
 */
export interface ComputerUseProvider {
  readonly id: string
  available(): boolean
  start(request: StartRequest, signal?: AbortSignal): Promise<ComputerUseSession>
  listTargets(sessionId: ComputerUseSessionId, signal?: AbortSignal): Promise<readonly ComputerUseTarget[]>
  observe(request: ObserveRequest, signal?: AbortSignal): Promise<ComputerUseObservation>
  act(request: ActRequest, signal?: AbortSignal): Promise<ComputerUseObservation>
  stop(request: StopRequest): Promise<void>
}

/**
 * Provider-neutral structured output of the perception (vision) route. The
 * planner consumes this; the perception model never acts directly.
 */
export interface PerceptionResult {
  observationId: ComputerUseObservationId
  summary: string
  elements: readonly PerceivedElement[]
  warnings: readonly string[]
}

/** One perceived element with a confidence and provenance. */
export interface PerceivedElement {
  /** Present for accessibility-sourced elements; vision-only elements carry bounds only. */
  elementId?: ComputerUseElementId
  role: string
  name?: string
  bounds: Rect
  confidence: number
  source: 'accessibility' | 'vision' | 'fused'
}
