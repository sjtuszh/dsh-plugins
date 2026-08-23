/**
 * Workflow model tools + Client RPC.
 *
 * - `workflow_acquire_paper` — a model-visible tool that drives ONE paper
 *   through the acquisition state machine. It is the single-channel template
 *   entry point (design doc §4/§19).
 * - `workflow.state` / `workflow.resume` — Package-private Host RPC the Client
 *   pill polls for live step status and the human resumes from a gate.
 * @module dsh-computer-use/workflow/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderJson } from '../render.ts'
import { PaperAcquisitionEngine, type WorkflowConfig } from './engine.ts'
import type { PaperInput, WorkflowStepStatus } from './types.ts'

/** Wire callback allowing the client to be signaled on state change. */
export type WorkflowStateListener = (status: WorkflowStepStatus) => void

/**
 * Register the workflow tool and RPC. `harness` is the Host builtin for
 * Package-private Client RPC; it is injected by the plugin host half.
 */
export function registerWorkflow(ctx: Context, harness: {
  handle: (method: string, handler: (args: unknown) => unknown | Promise<unknown>) => () => void
}, config: WorkflowConfig): WorkflowApi {
  const engine = new PaperAcquisitionEngine(ctx, config)
  const statusListeners = new Set<WorkflowStateListener>()

  const emit = (runId: string): void => {
    const status = engine.status(runId)
    if (status !== undefined) for (const listener of statusListeners) listener(status)
  }

  ctx.tools.register(defineTool({
    name: 'workflow_acquire_paper',
    description: 'Drive one paper through the acquisition state machine (resolve → open → classify → gate → find PDF → download → verify → store). Advance step by step; a HUMAN_GATE means a person must act in the shared browser before resume.',
    parameters: {
      title: { type: 'string', description: 'Paper title (used for resolution and PDF title match).' },
      doi: { type: 'string', description: 'Optional DOI to resolve the landing page.' },
      authors: { type: 'array', items: { type: 'string' }, description: 'Optional authors.' },
      year: { type: 'number', description: 'Optional publication year.' },
      action: { type: 'string', description: 'One of: "start" (create the run), "step" (advance one state), "resume" (after a human gate), "status".' },
      provider: { type: 'string', description: 'Execution backend: "playwright" (fast reads) or "windows" (gated/real browser). Defaults to readProvider.' },
    },
    output: {
      schema: { type: 'string' },
      render: renderJson,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Workflow: acquire paper',
      kind: 'execute',
      rawInput: { title: args.title, doi: args.doi, action: args.action },
    }),
    async execute(inputArgs /* , exec */) {
      const args = inputArgs as { [k: string]: unknown } | undefined ?? {}
      const paper: PaperInput = {
        title: typeof args.title === 'string' ? args.title : undefined,
        doi: typeof args.doi === 'string' ? args.doi : undefined,
        authors: Array.isArray(args.authors) ? args.authors.map(String) : [],
        year: typeof args.year === 'number' ? args.year : undefined,
      }
      const action0 = args.action === 'start' || args.action === 'step' || args.action === 'resume' || args.action === 'status'
        ? args.action
        : 'start'
      const action: 'start' | 'step' | 'resume' | 'status' = action0
      const provider = (args.provider === 'windows' ? 'windows' : 'playwright') as 'playwright' | 'windows'
      const runId = typeof args.runId === 'string' ? args.runId : undefined

      if (action === 'start') {
        const run = engine.start(paper, provider)
        return JSON.stringify({ runId: run.runId, state: run.state, candidates: run.candidateUrls })
      }
      if (runId === undefined) return JSON.stringify({ error: 'runId is required for step/resume/status' })

      if (action === 'status') {
        return JSON.stringify(engine.status(runId) ?? { runId, state: 'UNKNOWN' })
      }
      if (action === 'resume') {
        const run = await engine.resume(runId)
        emit(runId)
        return JSON.stringify({ runId: run.runId, state: run.state, pageType: run.pageType, gate: run.gate, pdfVerified: run.pdfVerified, error: run.error })
      }
      const run = await engine.step(runId)
      emit(runId)
      return JSON.stringify({ runId: run.runId, state: run.state, pageType: run.pageType, gate: run.gate, pdfVerified: run.pdfVerified, error: run.error })
    },
  }))

  harness.handle('workflow.state', async (args) => {
    const runId = (args as { runId?: string } | undefined)?.runId ?? ''
    const status = engine.status(runId)
    return status ?? { runId, state: 'UNKNOWN' }
  })

  harness.handle('workflow.resume', async (args) => {
    const runId = (args as { runId?: string } | undefined)?.runId ?? ''
    const run = await engine.resume(runId)
    emit(runId)
    const status = engine.status(runId)
    return status ?? { runId, state: 'UNKNOWN' }
  })

  return {
    engine,
    onState(listener: WorkflowStateListener): () => void {
      statusListeners.add(listener)
      return () => { statusListeners.delete(listener) }
    },
  }
}

/** The workflow API surface handed back to the plugin. */
export interface WorkflowApi {
  engine: PaperAcquisitionEngine
  onState(listener: WorkflowStateListener): () => void
}
