/**
 * Third-party vision model requirement and recommended route.
 *
 * DeepSeek's chat adapter is text-only (`inputModalities: ['text']`, rejects
 * images with UNSUPPORTED_CONTENT), so perception must land on a separate
 * image-capable model reached through `@deepseek-ai/dsh-llm-pi-ai`.
 * @module dsh-computer-use/vision
 */

/** Recommended default vision model (OpenAI-compatible, image-capable). */
export const RECOMMENDED_VISION_MODEL = 'qwen2.5-vl-72b-instruct'

/** Alternative vision models, in preference order. */
export const VISION_MODEL_ALTERNATIVES = [
  'gpt-4o-mini',
  'glm-4v-flash',
  'llava-v1.6-34b',
  'internvl2-76b',
] as const

/**
 * The llm-pi-ai provider profile that makes a vision route image-capable.
 * Declaring `defaultInput: [text, image]` once at the route makes every
 * otherwise-unlisted model on that gateway accept images.
 *
 * Prefer filling `apiKeyEnv` (a credential reference resolved per request) and
 * `baseURL` in user settings — never commit a key.
 */
export interface VisionRouteProfile {
  apiKeyEnv: string
  api: 'openai-completions'
  baseURL: string
  defaultInput: ['text', 'image']
  models: readonly { id: string; contextWindow: number }[]
}

/** A concrete recommended profile (replace endpoint and key reference). */
export const RECOMMENDED_VISION_ROUTE: VisionRouteProfile = {
  apiKeyEnv: 'VISION_API_KEY',
  api: 'openai-completions',
  baseURL: 'https://your-vision-endpoint/v1',
  defaultInput: ['text', 'image'],
  models: [{ id: RECOMMENDED_VISION_MODEL, contextWindow: 131072 }],
}

/**
 * Stable guidance the Computer Use tool's system-prompt section can carry. It
 * tells the planner how perception is separated from action so the transcript
 * never claims the text planner "saw" an image it did not receive.
 */
export const VISION_GUIDANCE = [
  'Computer Use observations may carry a screenshot; the text planner receives',
  'only structured text (summary, element roles/bounds, confidence). A separate',
  'vision-capable model produces that structure from the screenshot. Never claim',
  'the planner inspected a raw image. If the vision route is unavailable, surface',
  'VISION_ROUTE_UNAVAILABLE and fall back to accessibility-only observation.',
].join(' ')
