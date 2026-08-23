/**
 * Perception: turn an observation into a provider-neutral structured result.
 *
 * - `accessibility` mode builds the result from the observation's accessibility
 *   tree (no vision model, no image sent).
 * - `analyze` mode projects the screenshot to a third-party vision model
 *   (llm-pi-ai route) through `ctx.llm.stream` and parses structured JSON.
 *
 * The text planner (DeepSeek) consumes the result; the vision model never acts
 * directly and never participates in permission decisions.
 * @module dsh-computer-use/perception
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { AttachmentId, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ComputerUseObservation, PerceptionResult, PerceivedElement } from './types.ts'
import { brand } from './ids.ts'
import type { ComputerUseSessionId, ComputerUseTargetId } from './ids.ts'
import { ComputerUseError } from './errors.ts'
import { renderJson } from './render.ts'
import { perceiveAccessibility, parsePerceptionResult } from './core.ts'

/** The vision route the perception pass calls. */
export interface PerceptionRoute {
  provider?: string
  model?: string
  maxTokens?: number
}

/** Stable instruction that forces structured, JSON-only vision output. */
const PERCEPTION_SYSTEM = [
  'You analyze a screenshot of a web page.',
  'Return ONLY a JSON object with keys:',
  'summary (string, one short sentence describing the page),',
  'elements (array of { role: string, name?: string, x: number, y: number, width: number, height: number, confidence: number } for each visible interactive element, in CSS pixels).',
  'No Markdown, no code fences, no prose outside the JSON.',
].join('\n')

/**
 * Project the observation's screenshot to the configured vision model and parse
 * a structured result. Throws {@link ComputerUseError} `VISION_ROUTE_UNAVAILABLE`
 * when no route is configured or the LLM seam is absent.
 */
export async function perceiveWithVision(
  ctx: Context,
  observation: ComputerUseObservation,
  route: PerceptionRoute,
  signal?: AbortSignal,
): Promise<PerceptionResult> {
  const llm = ctx.get('llm')
  if (llm === undefined) throw new ComputerUseError('llm seam is not mounted', 'VISION_ROUTE_UNAVAILABLE')
  if (!route.provider || !route.model) {
    throw new ComputerUseError('vision route is not configured (set visionProvider + visionModel)', 'VISION_ROUTE_UNAVAILABLE')
  }
  const screenshot = observation.screenshot
  if (screenshot === undefined) throw new ComputerUseError('observation has no screenshot', 'VISION_ROUTE_UNAVAILABLE')

  const attachment: ImageAttachmentRef = {
    attachmentId: screenshot.attachmentId as AttachmentId,
    mediaType: screenshot.mediaType as ImageMediaType,
    bytes: screenshot.bytes,
    width: screenshot.width,
    height: screenshot.height,
  }
  const messages: Message[] = [createUserMessage({
    content: [
      { type: 'text', text: 'Describe the interactive elements visible in this screenshot.' },
      { type: 'image', attachment },
    ],
    source: { kind: 'plugin', plugin: 'dsh-computer-use' },
  })]
  const options: GenerateOptions = deepFreeze({
    provider: route.provider,
    model: route.model,
    messages,
    system: PERCEPTION_SYSTEM,
    maxTokens: route.maxTokens ?? 2000,
    signal,
  })

  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream(options)) {
    signal?.throwIfAborted()
    assembler.push(chunk)
  }
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new ComputerUseError('vision model returned a tool call instead of JSON', 'PROVIDER_CRASHED')
  }
  const text = blocks.filter(block => block.type === 'text').map(block => block.text).join(' ')
  return parsePerceptionResult(observation.observationId, text)
}

/** Register `computer_perceive`. */
export function applyPerceiveTool(ctx: Context, route: PerceptionRoute): void {
  ctx.tools.register(defineTool({
    name: 'computer_perceive',
    description: 'Produce a structured perception of a target: accessibility mode reads the DOM tree (no image); analyze mode sends the screenshot to a vision model and returns elements with bounds and confidence.',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'Session id from computer_observe.' },
      targetId: { type: 'string', required: true, description: 'Target id from computer_observe.' },
      mode: { type: 'string', description: '"accessibility" or "analyze" (default analyze).' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    async execute(args, exec) {
      const observation = await ctx.computerUse.observe({
        sessionId: brand<ComputerUseSessionId>(args.sessionId),
        targetId: brand<ComputerUseTargetId>(args.targetId),
        include: { screenshot: true, accessibility: true },
      }, exec.signal)
      const mode = args.mode === 'accessibility' ? 'accessibility' : 'analyze'
      const result = mode === 'accessibility'
        ? perceiveAccessibility(observation)
        : await perceiveWithVision(ctx, observation, route, exec.signal)
      return JSON.stringify(result, null, 2)
    },
  }))
}
