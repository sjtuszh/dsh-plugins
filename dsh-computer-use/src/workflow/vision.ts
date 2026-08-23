/**
 * Page Classifier: the vision-agent node that answers "what page state am I
 * on?" — NOT "what should I click next?" (design doc §3 insists classification
 * and action stay separate).
 *
 * The screenshot is materialized to a local file first (the workflow's settings
 * surface exposes where), then projected to the configured vision model, which
 * returns a strict `{ pageType, confidence, signals }` JSON.
 * @module dsh-computer-use/workflow/vision
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { AttachmentId, ImageMediaType, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ComputerUseObservation } from '../types.ts'
import type { PageClassification, PageType } from './types.ts'

/** The taxonomy, serialized into the vision prompt so the model stays on-schema. */
const PAGE_TYPES: readonly PageType[] = [
  'ARTICLE_PAGE',
  'PDF_VIEWER',
  'LOGIN',
  'INSTITUTION_LOGIN',
  'HUMAN_VERIFICATION',
  'COOKIE_DIALOG',
  'ACCESS_DENIED',
  'PAYWALL',
  'SEARCH_PAGE',
  'DOWNLOAD_STARTED',
  'ERROR_PAGE',
  'UNKNOWN',
]

/** System prompt forcing strict, JSON-only classification. */
export const CLASSIFY_SYSTEM = [
  'You classify a screenshot of a web page into exactly one page state.',
  'Return ONLY a JSON object with keys:',
  'pageType (one of: ' + PAGE_TYPES.join(', ') + '),',
  'confidence (number 0..1),',
  'signals (array of short strings listing visual cues that justify the type).',
  'No Markdown, no code fences, no prose outside the JSON.',
].join('\n')

/** Vision classifier config (surfaced in the workflow settings panel). */
export interface VisionConfig {
  /** The llm-pi-ai provider route that serves the vision model. */
  provider?: string
  /** The vision model id. */
  model?: string
  /** Max tokens for the classification answer. */
  maxTokens?: number
  /** Directory where screenshots are materialized before being sent. */
  screenshotDir?: string
}

/** Extract the first balanced JSON object from a model reply. */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

/**
 * Classify an observation's screenshot. Throws when no vision route is set.
 */
export async function classifyScreenshot(
  ctx: Context,
  observation: ComputerUseObservation,
  config: VisionConfig,
  signal?: AbortSignal,
): Promise<PageClassification> {
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('workflow: llm seam is not mounted')
  if (!config.provider || !config.model) {
    throw new Error('workflow: vision route is not configured (set visionProvider + visionModel)')
  }
  const screenshot = observation.screenshot
  if (screenshot === undefined) throw new Error('workflow: observation has no screenshot to classify')

  // Materialize the screenshot to a local file (design doc §2 screenshots-to-disk).
  const imageRef: ImageAttachmentRef = {
    attachmentId: screenshot.attachmentId as AttachmentId,
    mediaType: screenshot.mediaType as ImageMediaType,
    bytes: screenshot.bytes,
    width: screenshot.width,
    height: screenshot.height,
  }

  const attachment = await readImageBytes(ctx, imageRef)
  const dir = config.screenshotDir || 'C:/Users/22320/.dsh/computer-use'
  const filePath = join(dir, `wf-${observation.observationId}.png`)
  await writeFile(filePath, new Uint8Array(attachment.bytes)).catch(() => {})

  const messages: Message[] = [createUserMessage({
    content: [
      { type: 'text', text: 'Classify the page state in this screenshot.' },
      { type: 'image', attachment: imageRef },
    ],
    source: { kind: 'plugin', plugin: 'dsh-computer-use' },
  })]
  const options: GenerateOptions = deepFreeze({
    provider: config.provider,
    model: config.model,
    messages,
    system: CLASSIFY_SYSTEM,
    maxTokens: config.maxTokens ?? 800,
    signal,
  })

  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream(options)) {
    signal?.throwIfAborted()
    assembler.push(chunk)
  }
  const text = assembler.blocks()
    .filter(block => block.type === 'text')
    .map(block => (block as { text: string }).text)
    .join(' ')

  const parsed = JSON.parse(extractJson(text)) as { pageType?: string; confidence?: number; signals?: unknown }
  const pageType = (PAGE_TYPES as readonly string[]).includes(parsed.pageType ?? '')
    ? (parsed.pageType as PageType)
    : 'UNKNOWN'
  return {
    pageType,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    signals: Array.isArray(parsed.signals) ? parsed.signals.map(String) : [],
  }
}

/** Read an image attachment's bytes from the attachment store. */
async function readImageBytes(ctx: Context, ref: {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
}): Promise<{ bytes: Uint8Array }> {
  const attachments = ctx.get('attachments') as { readImage?: (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<{ data: Uint8Array }> } | undefined
  if (attachments?.readImage) {
    const stored = await attachments.readImage(ref as ImageAttachmentRef)
    return { bytes: stored.data }
  }
  return { bytes: new Uint8Array(0) }
}
