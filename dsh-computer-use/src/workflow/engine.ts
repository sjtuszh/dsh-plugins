/**
 * Paper Acquisition Workflow engine.
 *
 * A state machine that drives ONE paper through acquisition. It is deliberately
 * a "single channel" template (design doc §4/§19): nodes are states, each step
 * may pick a provider, Human Gate is first-class, and PDF is verified before
 * STORE. It never codes per-publisher selectors — adapters only provide hints.
 * @module dsh-computer-use/workflow/engine
 */

import type { Context } from '@deepseek-ai/cordis'
import { brand } from '../ids.ts'
import type {
  ComputerUseSessionId,
  ComputerUseTargetId,
  ComputerUseElementId,
  ComputerUseObservationId,
} from '../ids.ts'
import type { ComputerUseObservation } from '../types.ts'
import { adapterFor, resolveCandidateUrls } from './adapter.ts'
import { classifyScreenshot, type VisionConfig } from './vision.ts'
import { verifyPdf, newRunId } from './pdf.ts'
import type {
  PaperInput,
  PaperRun,
  ProviderChoice,
  WorkflowState,
  WorkflowStepStatus,
  PageType,
  HumanGateRecord,
  HumanGateType,
  PaperObservationSnapshot,
} from './types.ts'

/** Build a lean, owned snapshot from a live observation (never keep the live object). */
function snapshotOf(observation: ComputerUseObservation): PaperObservationSnapshot {
  return {
    observationId: observation.observationId,
    url: observation.url,
    title: observation.title,
    elements: (observation.accessibility?.elements ?? []).map(e => ({
      elementId: String(e.elementId),
      name: e.name,
      role: e.role,
    })),
  }
}

/** Find an element by a name substring inside a snapshot. */
function findElement(snapshot: PaperObservationSnapshot, needle: string) {
  return snapshot.elements.find(e => e.name && e.name.includes(needle))
}

/** Engine runtime config. */
export interface WorkflowConfig {
  /** Vision route for page classification. */
  vision: VisionConfig
  /** Where downloaded PDFs land (watch dir). */
  downloadDir?: string
  /** Default provider for read-heavy steps (fast, no anti-bot issues). */
  readProvider?: ProviderChoice
  /** Provider for gated / strict-review steps. */
  actionProvider?: ProviderChoice
}

/**
 * The engine advances a run one state at a time. It needs `ctx.computerUse`
 * (browser seam) and `ctx.attachments` (screenshots) where the workflow already
 * depends on the computer-use plugin's own seam.
 */
export class PaperAcquisitionEngine {
  private readonly runs = new Map<string, PaperRun>()

  constructor(
    private readonly ctx: Context,
    private readonly config: WorkflowConfig,
  ) {}

  /** Start a new run for one paper. */
  start(paper: PaperInput, provider: ProviderChoice = this.config.readProvider ?? 'playwright'): PaperRun {
    const runId = newRunId('paper')
    const resolved = resolveCandidateUrls(paper)
    const run: PaperRun = {
      runId,
      paper,
      resolved,
      state: 'RESOLVE',
      provider,
      candidateUrls: resolved.candidateUrls,
      metadata: {},
    }
    this.runs.set(runId, run)
    return run
  }

  /** Read a run (or undefined). */
  get(runId: string): PaperRun | undefined {
    return this.runs.get(runId)
  }

  status(runId: string): WorkflowStepStatus | undefined {
    const run = this.runs.get(runId)
    if (run === undefined) return undefined
    return {
      runId: run.runId,
      state: run.state,
      provider: run.provider,
      pageType: run.pageType,
      gate: run.gate,
      url: run.url,
      pdfVerified: run.pdfVerified,
      error: run.error,
    }
  }

  /**
   * Advance the run by one state transition. Returns the run (with its live
   * `state`). When the run lands in `HUMAN_GATE`, the caller must wait for the
   * person and then call `resume`.
   */
  async step(runId: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.runs.get(runId)
    if (run === undefined) throw new Error(`workflow: unknown run ${runId}`)
    signal?.throwIfAborted()

    switch (run.state) {
      case 'RESOLVE':
        return this.doResolve(run)
      case 'OPEN':
        return await this.doOpen(run, signal)
      case 'CLASSIFY':
        return await this.doClassify(run, signal)
      case 'ACCESS_CHECK':
        return await this.doAccessCheck(run, signal)
      case 'HUMAN_GATE':
        return run // stays; caller resumes
      case 'FIND_PDF':
        return await this.doFindPdf(run, signal)
      case 'DOWNLOAD':
        return await this.doDownload(run)
      case 'VERIFY_PDF':
        return await this.doVerify(run)
      case 'STORE':
        run.state = 'DONE'
        return run
      case 'DONE':
      case 'FAILED':
        return run
      default:
        run.state = 'FAILED'
        return run
    }
  }

  /**
   * Resume after a human completes a gate: clear the gate and continue from
   * where we paused (re-classify, since the human may have moved the page).
   */
  async resume(runId: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.runs.get(runId)
    if (run === undefined) throw new Error(`workflow: unknown run ${runId}`)
    run.gate = undefined
    // Re-observe and classify the page the human just touched.
    run.state = 'CLASSIFY'
    return this.step(runId, signal)
  }

  /** Mark a run failed. */
  fail(runId: string, error: string): PaperRun {
    const run = this.runs.get(runId)
    if (run === undefined) throw new Error(`workflow: unknown run ${runId}`)
    run.state = 'FAILED'
    run.error = error
    return run
  }

  // ── step implementations ────────────────────────────────────────────────

  private doResolve(run: PaperRun): PaperRun {
    const resolved = resolveCandidateUrls(run.paper)
    run.resolved = resolved
    run.candidateUrls = resolved.candidateUrls
    run.state = 'OPEN'
    return run
  }

  private async doOpen(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    const url = run.candidateUrls[0]
    if (url === undefined) {
      return this.fail(run.runId, 'no candidate URL to open')
    }
    const session = await this.ctx.computerUse.start({ startUrl: url }, signal)
    run.sessionId = session.sessionId
    const target = session.targets[0]
    run.targetId = target?.targetId ?? brand<ComputerUseTargetId>('wf-target')
    run.url = url
    run.state = 'CLASSIFY'
    return run
  }

  private async doClassify(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    if (run.sessionId === undefined || run.targetId === undefined) {
      return this.fail(run.runId, 'no live browser session to classify')
    }
    const observation = await this.ctx.computerUse.observe({
      sessionId: brand<ComputerUseSessionId>(run.sessionId),
      targetId: brand<ComputerUseTargetId>(run.targetId),
      include: { screenshot: true, accessibility: true },
    }, signal)
    run.pageType = observation.title.includes('PDF') ? 'PDF_VIEWER' : undefined
    run.url = observation.url
    run.metadata.lastObservationId = observation.observationId
    run.observation = snapshotOf(observation)

    try {
      const classification = await classifyScreenshot(this.ctx, observation, this.config.vision, signal)
      run.pageType = classification.pageType
    } catch (error) {
      // No vision route: degrade to a human gate so the person can classify.
      run.pageType = 'UNKNOWN'
      run.classifyError = (error as Error).message
    }
    run.state = 'ACCESS_CHECK'
    return run
  }

  private async doAccessCheck(run: PaperRun, _signal?: AbortSignal): Promise<PaperRun> {
    switch (run.pageType) {
      case 'ARTICLE_PAGE':
        run.state = 'FIND_PDF'
        break
      case 'PDF_VIEWER':
      case 'DOWNLOAD_STARTED':
        run.state = 'VERIFY_PDF'
        break
      case 'HUMAN_VERIFICATION':
      case 'LOGIN':
      case 'INSTITUTION_LOGIN':
        run.gate = gateFor(run.pageType, run.url ?? '')
        run.state = 'HUMAN_GATE'
        break
      case 'COOKIE_DIALOG':
        // The agent may dismiss the cookie dialog itself (design doc §4).
        return await this.doDismissCookie(run)
      case 'PAYWALL':
      case 'ACCESS_DENIED':
      case 'ERROR_PAGE':
        run.error = `page state ${run.pageType} — cannot acquire (paywall/denied)`
        run.state = 'FAILED'
        break
      case 'SEARCH_PAGE':
        run.error = 'landed on a search page; no direct article link'
        run.state = 'FAILED'
        break
      case 'UNKNOWN':
      default:
        // Cannot classify (e.g. no vision route) → let the human decide.
        run.gate = { type: 'UNKNOWN_INTERACTION', reason: run.classifyError ?? 'page unclassifiable', state: 'WAITING_HUMAN' }
        run.state = 'HUMAN_GATE'
        break
    }
    return run
  }

  private async doDismissCookie(run: PaperRun): Promise<PaperRun> {
    if (run.sessionId === undefined || run.targetId === undefined || run.observation === undefined) {
      return this.fail(run.runId, 'cannot dismiss cookie dialog without a live observation')
    }
    const adapter = adapterFor(run.url ?? '')
    const cfg = this.config
    for (const text of adapter.cookieDismiss) {
      const el = run.observation !== undefined ? findElement(run.observation, text) : undefined
      if (el !== undefined) {
        const next = await this.ctx.computerUse.act({
          sessionId: brand<ComputerUseSessionId>(run.sessionId),
          targetId: brand<ComputerUseTargetId>(run.targetId),
          observationId: brand<ComputerUseObservationId>(run.observation.observationId),
          action: { type: 'click-element', elementId: brand<ComputerUseElementId>(el.elementId) },
        })
        run.observation = snapshotOf(next)
        run.pageType = 'ARTICLE_PAGE'
        run.state = 'FIND_PDF'
        return run
      }
    }
    void cfg
    // No known dismiss control → human.
    run.gate = { type: 'UNKNOWN_INTERACTION', reason: 'cookie dialog, no dismiss control found', state: 'WAITING_HUMAN' }
    run.state = 'HUMAN_GATE'
    return run
  }

  private async doFindPdf(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    if (run.sessionId === undefined || run.targetId === undefined || run.observation === undefined) {
      return this.fail(run.runId, 'no live observation to find a PDF from')
    }
    const adapter = adapterFor(run.url ?? '')
    for (const text of adapter.pdfActions) {
      const el = run.observation !== undefined ? findElement(run.observation, text) : undefined
      if (el !== undefined) {
        // Click the PDF button; the provider returns a fresh observation.
        const next = await this.ctx.computerUse.act({
          sessionId: brand<ComputerUseSessionId>(run.sessionId),
          targetId: brand<ComputerUseTargetId>(run.targetId),
          observationId: brand<ComputerUseObservationId>(run.observation.observationId),
          action: { type: 'click-element', elementId: brand<ComputerUseElementId>(el.elementId) },
        }, signal)
        run.observation = snapshotOf(next)
        run.state = adapter.pdfViewer ? 'DOWNLOAD' : 'VERIFY_PDF'
        return run
      }
    }
    return this.fail(run.runId, `no PDF control found on ${run.paper.title ?? run.url ?? 'page'}`)
  }

  private async doDownload(run: PaperRun): Promise<PaperRun> {
    // The PDF viewer click usually triggers a download; let the PDF appear via
    // the download-directory watcher in PDF verify. For the single-channel
    // template we move straight to VERIFY_PDF and read from downloadDir.
    run.state = 'VERIFY_PDF'
    return run
  }

  private async doVerify(run: PaperRun): Promise<PaperRun> {
    const path = await this.findDownloadedPdf(run)
    if (path === undefined) {
      run.error = 'no PDF appeared in the download directory'
      run.state = 'FAILED'
      return run
    }
    run.pdfPath = path
    run.pdfVerified = await verifyPdf(path, run.paper.title)
    run.state = run.pdfVerified.ok ? 'STORE' : 'FAILED'
    return run
  }

  private async findDownloadedPdf(run: PaperRun): Promise<string | undefined> {
    const dir = this.config.downloadDir ?? 'C:/Users/22320/Downloads'
    const { readdir } = await import('node:fs/promises')
    let names: string[] = []
    try {
      names = await readdir(dir)
    } catch {
      return undefined
    }
    // Pick the freshest PDF (best-effort). In the real watcher, we'd diff before/after.
    const pdfs = names.filter(n => n.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return undefined
    const { join } = await import('node:path')
    const byMtime = await Promise.all(pdfs.map(async n => {
      const { stat } = await import('node:fs/promises')
      const p = join(dir, n)
      try {
        const s = await stat(p)
        return { p, mtime: s.mtimeMs }
      } catch {
        return { p, mtime: 0 }
      }
    }))
    byMtime.sort((a, b) => b.mtime - a.mtime)
    return byMtime[0]?.p
  }
}

function gateFor(pageType: PageType, _url: string): HumanGateRecord {
  const type: HumanGateType =
    pageType === 'HUMAN_VERIFICATION' ? 'CAPTCHA'
      : pageType === 'LOGIN' ? 'LOGIN_CONFIRMATION'
      : 'SSO'
  return { type, reason: `page state ${pageType} requires a human`, state: 'WAITING_HUMAN' }
}
