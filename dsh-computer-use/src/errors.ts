/**
 * Discriminated, recoverable Computer Use errors.
 *
 * The tool layer surfaces `code` to the model so it can choose the next
 * recovery step (re-observe, re-list targets, ask the user, or stop). Codes are
 * closed and stable; a provider must not invent ad-hoc ones.
 * @module dsh-computer-use/errors
 */

export const COMPUTER_USE_ERROR_CODES = [
  // Target / observation invariants.
  'STALE_OBSERVATION',
  'TARGET_NOT_FOUND',
  'TARGET_CHANGED',
  'TARGET_NOT_ALLOWED',
  'ELEMENT_NOT_FOUND',
  'COORDINATE_OUT_OF_BOUNDS',
  'ACTION_NOT_SUPPORTED',
  'SESSION_NOT_FOUND',
  // Policy.
  'APPROVAL_REQUIRED',
  'APPROVAL_DENIED',
  'USER_INTERRUPTED',
  // Provider / transport health.
  'PROVIDER_TIMEOUT',
  'PROVIDER_CRASHED',
  'PROTOCOL_MISMATCH',
  // Perception.
  'VISION_ROUTE_UNAVAILABLE',
  // Seam registry / selection.
  'DUPLICATE_PROVIDER',
  'PROVIDER_CONFIGURED_MISSING',
  'PROVIDER_CONFIGURED_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_AMBIGUOUS',
] as const

/** Stable error code union used across the seam. */
export type ComputerUseErrorCode = (typeof COMPUTER_USE_ERROR_CODES)[number]

/** A recoverable Computer Use failure carrying a stable {@link code}. */
export class ComputerUseError extends Error {
  constructor(message: string, readonly code: ComputerUseErrorCode) {
    super(message)
    this.name = 'ComputerUseError'
  }
}
