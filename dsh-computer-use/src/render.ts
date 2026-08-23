/**
 * Model-facing content-block helpers. Keep human prose in `render`; the
 * canonical tool value stays a plain, lossless JSON string.
 * @module dsh-computer-use/render
 */

/** One text content block. */
export function text(value: string): { type: 'text'; text: string } {
  return { type: 'text', text: value }
}

/** Render a canonical value as its pretty JSON string for the model. */
export function renderJson(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [text(typeof value === 'string' ? value : JSON.stringify(value, null, 2))]
}
