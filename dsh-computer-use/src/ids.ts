/**
 * Opaque, short-lived Computer Use identifiers.
 *
 * Branded string ids keep model-visible handles disjoint from provider-internal
 * pointers and from each other. A screenshot id or element id is only valid
 * against the observation that produced it; the brand makes accidental
 * cross-observation reuse a type error before it becomes a runtime bug.
 * @module dsh-computer-use/ids
 */

declare const brandSymbol: unique symbol

/** Attach a compile-time-only brand `K` to a value. */
export type Branded<T, K extends string> = T & { readonly [brandSymbol]: K }

/** Cast a runtime string to one of this module's branded string types. */
export function brand<T extends string>(value: string): T {
  return value as T
}

/** One live Computer Use session (start → … → stop). */
export type ComputerUseSessionId = Branded<string, 'ComputerUseSessionId'>
/** A target the provider can observe/act on (a page, or later a window). */
export type ComputerUseTargetId = Branded<string, 'ComputerUseTargetId'>
/** A point-in-time snapshot; all ids inside it die with it. */
export type ComputerUseObservationId = Branded<string, 'ComputerUseObservationId'>
/** A screenshot bound to one observation. */
export type ComputerUseScreenshotId = Branded<string, 'ComputerUseScreenshotId'>
/** An actionable element bound to one observation's accessibility tree. */
export type ComputerUseElementId = Branded<string, 'ComputerUseElementId'>
