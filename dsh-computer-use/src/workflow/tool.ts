/**
 * Workflow model tools + Client RPC.
 *
 * The tools expose primitives so the multimodal model drives the acquisition
 * loop (the reference's实测 loop): open URL → capture screenshot (to a local
 * .png the model reads with `read_image`) → act → wait for PDF → verify PDF.
 * Each records live state the client pill polls via `workflow.state`.
 * @module dsh-computer-use/workflow/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderJson } from '../render.ts'
import { PaperAcquisitionEngine, type WorkflowConfig } from './engine.ts'
import { verifyPdf } from './pdf.ts'
import { ensureProject, projectExists } from './project.ts'
import { parseAction } from '../core.ts'
import type { WorkflowStepStatus } from './types.ts'

/** Wire callback allowing the client to be signaled on state change. */
export type WorkflowStateListener = (status: WorkflowStepStatus) => void

/** Register the workflow tools, and RPC too when the Host builtin is available. */
export function registerWorkflow(ctx: Context, harness: {
  handle: (method: string, handler: (args: unknown) => unknown | Promise<unknown>) => () => void
} | undefined, config: WorkflowConfig): WorkflowApi {
  const engine = new PaperAcquisitionEngine(ctx, config)
  const statusListeners = new Set<WorkflowStateListener>()

  const emit = (runId: string): void => {
    const status = engine.status(runId)
    if (status !== undefined) for (const listener of statusListeners) listener(status)
  }

  async function asRun(value: ReturnType<PaperAcquisitionEngine['start']> extends Promise<infer T> ? T : never): Promise<string> {
    return JSON.stringify({
      runId: value.runId,
      state: value.state,
      projectDir: value.projectDir,
      candidates: value.candidateUrls,
    })
  }

  /** The text+coordinate view of a run's last observation (the no-image channel). */
  function viewOf(run: { pageType?: string; url?: string; screenshotPath?: string; observation?: { elements: readonly unknown[]; documentText?: string } }): Record<string, unknown> {
    const obs = run.observation
    return {
      pageType: run.pageType,
      url: run.url,
      screenshotPath: run.screenshotPath,
      documentText: obs?.documentText,
      // Coordinate + meaning: the model clicks by elementId or by bounds center.
      elements: (obs?.elements ?? []).map(e => e as unknown),
    }
  }

  /** Tool + helper to drive acquisition. */
  ctx.tools.register(defineTool({
    name: 'workflow_acquire_paper',
    description: 'Drive one paper through the acquisition state machine (resolve → open → classify → gate → find PDF → download → verify → store). Advance step by step; a HUMAN_GATE means a person must act in the shared browser before resume. Select a local projectDir when you want artifacts (screenshots/PDFs/notes) stored in one place.',
    parameters: {
      action: { type: 'string', description: 'One of: "start" (create the run), "step" (advance one state), "resume" (after a human gate), "status".' },
      runId: { type: 'string', description: 'Run id returned by "start"; required for step/resume/status.' },
      projectDir: { type: 'string', description: 'Local project directory for artifacts; if missing it is created. Overrides the settings default.' },
      title: { type: 'string', description: 'Paper title (used for resolution and PDF title match).' },
      doi: { type: 'string', description: 'Optional DOI to resolve the landing page.' },
      authors: { type: 'array', items: { type: 'string' }, description: 'Optional authors.' },
      year: { type: 'number', description: 'Optional publication year.' },
      provider: { type: 'string', description: 'Execution backend: "playwright" (fast reads) or "windows" (gated/real browser).' },
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
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const action = args.action === 'step' || args.action === 'resume' || args.action === 'status' ? args.action : 'start'
      const runId = typeof args.runId === 'string' ? args.runId : undefined
      const title = typeof args.title === 'string' ? args.title : undefined
      const doi = typeof args.doi === 'string' ? args.doi : undefined
      const authorArr = Array.isArray(args.authors) ? args.authors.map(String) : []
      const year = typeof args.year === 'number' ? args.year : undefined
      const projectDir = typeof args.projectDir === 'string' && args.projectDir.length > 0 ? args.projectDir : undefined
      const provider = (args.provider === 'windows' ? 'windows' : 'playwright') as 'playwright' | 'windows'

      if (action === 'start') {
        const run = await engine.start({ title, doi, authors: authorArr, year }, projectDir, provider)
        return asRun(run)
      }
      if (runId === undefined) return JSON.stringify({ error: 'runId is required for step/resume/status' })
      if (action === 'status') return JSON.stringify(engine.status(runId) ?? { runId, state: 'UNKNOWN' })
      const run = action === 'resume' ? await engine.resume(runId) : await engine.step(runId)
      emit(runId)
      return JSON.stringify({
        runId: run.runId, state: run.state, pageType: run.pageType, gate: run.gate,
        url: run.url, screenshotPath: run.screenshotPath, pdfVerified: run.pdfVerified, error: run.error,
      })
    },
  }))

  /** Low-level primitives the model can drive directly. */
  ctx.tools.register(defineTool({
    name: 'workflow_open',
    description: 'Open a URL in the workflow run\u2019s computer-use session and materialize a screenshot into the project dir.',
    parameters: {
      runId: { type: 'string', required: true },
      url: { type: 'string', required: true, description: 'URL to open.' },
    },
    output: { schema: { type: 'string' }, render: renderJson },
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const run = await engine.open(String(args.runId), String(args.url))
      emit(run.runId)
      return JSON.stringify({ runId: run.runId, state: run.state, url: run.url, screenshotPath: run.screenshotPath })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workflow_capture',
    description: 'Capture the run\u2019s current target, materialize the screenshot to a local .png, and return its path. The model can then read the screen with read_image.',
    parameters: { runId: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: renderJson },
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const run = await engine.capture(String(args.runId))
      emit(run.runId)
      return JSON.stringify({ runId: run.runId, state: run.state, ...viewOf(run) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workflow_act',
    description: 'Perform exactly one computer-use action against the run\u2019s current observation, then re-capture.',
    parameters: {
      runId: { type: 'string', required: true },
      action: { type: 'json', required: true, description: 'One action (same union as computer_act): {type:"click-element",elementId}|{type:"click-coordinate",screenshotId,x,y,button}|{type:"type-text",text}|{type:"press-key",keys}|{type:"scroll",deltaX,deltaY}|{type:"set-value",elementId,value}|{type:"drag",...}. Coordinate x/y are screenshot-relative.' },
    },
    output: { schema: { type: 'string' }, render: renderJson },
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const action = parseAction(args.action)
      const run = await engine.act(String(args.runId), action)
      emit(run.runId)
      return JSON.stringify({ runId: run.runId, state: run.state, ...viewOf(run) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workflow_verify_pdf',
    description: 'Verify the run\u2019s downloaded PDF: magic bytes, page count, title similarity against the expected paper.',
    parameters: {
      runId: { type: 'string', required: true },
      pdfPath: { type: 'string', description: 'Path to the PDF to verify (defaults to the run\u2019s pdfs dir newest).' },
      title: { type: 'string', description: 'Expected paper title for similarity (defaults to the run\u2019s paper title).' },
    },
    output: { schema: { type: 'string' }, render: renderJson },
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const runId = String(args.runId)
      const run = engine.get(runId)
      const expected = typeof args.title === 'string' ? args.title : run?.paper.title
      const path = typeof args.pdfPath === 'string' && args.pdfPath.length > 0
        ? args.pdfPath
        : await (run !== undefined ? engine.waitForPdf(runId).then(r => r.pdfPath) : undefined)
      if (path === undefined) return JSON.stringify({ runId, error: 'no PDF path to verify' })
      const result = await verifyPdf(path, expected)
      if (run !== undefined) {
        run.pdfVerified = result
        run.state = result.ok ? 'STORE' : 'FAILED'
        emit(runId)
      }
      return JSON.stringify({ runId, path, pdfVerified: result })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workflow_pick_dir',
    description: 'Ensure a local project directory exists (creating it if missing) for a workflow run\u2019s artifacts.',
    parameters: { projectDir: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: renderJson },
    async execute(inputArgs) {
      const args = (inputArgs ?? {}) as Record<string, unknown>
      const dir = String(args.projectDir)
      const existed = await projectExists(dir)
      const layout = await ensureProject(dir)
      const model = existed ? 'existing' : 'created'
      return JSON.stringify({ projectDir: layout.root, model, screenshots: layout.screenshots, pdfs: layout.pdfs, notes: layout.notes })
    },
  }))

  // Client RPC is optional: ordinary Cordis plugin loads do not expose the
  // internal Host builtin, so missing `harness` must not abort startup.
  if (harness !== undefined) {
    harness.handle('workflow.state', async (args) => {
      const runId = (args as { runId?: string } | undefined)?.runId ?? ''
      return engine.status(runId) ?? { runId, state: 'UNKNOWN' }
    })
    harness.handle('workflow.resume', async (args) => {
      const runId = (args as { runId?: string } | undefined)?.runId ?? ''
      await engine.resume(runId)
      emit(runId)
      return engine.status(runId) ?? { runId, state: 'UNKNOWN' }
    })
  }

  // HTTP status route for the client floater (agent-teams' pattern): polled by
  // the browser pill for live run state. Exact route, no-store JSON. Registered
  // deferred: `webServer` may not be active yet at apply time, so retry on the
  // `internal/service` activation event until it is.
  type WebRouteHost = { register?: (route: unknown) => unknown }
  let routeRegistered = false
  const registerRoute = (): void => {
    if (routeRegistered) return
    const webServer = (ctx.get('webServer') ?? ctx.get('httpServer')) as WebRouteHost | undefined
    if (webServer?.register === undefined) return
    const dispose = webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-computer-use/state',
      handler: async (_req: unknown, res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }) => {
        const body = JSON.stringify({ runs: engine.all() })
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(body)
      },
    }) as () => void
    ctx.effect(() => dispose, 'dsh-computer-use: state route')
    routeRegistered = true
  }
  registerRoute()
  ctx.on('internal/service', registerRoute)

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
