/**
 * Paper Acquisition Workflow engine.
 *
 * Drives ONE paper through acquisition. The state machine is the skeleton; the
 * vision channel is the multimodal model reading a materialized screenshot
 * (design decision: NOT a separate vision API). Each step records live state so
 * the client pill renders it; Human Gate is first-class; PDF is verified before
 * STORE.
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
import type { ComputerUseObservation, ComputerUseAction } from '../types.ts'
import { adapterFor, resolveCandidateUrls } from './adapter.ts'
import { materializeScreenshot } from './screenshot.ts'
import { verifyPdf, newRunId } from './pdf.ts'
import { ensureProject, projectLayout } from './project.ts'
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
  ProjectLayout,
} from './types.ts'

/** Engine runtime config (project-dir aware). */
export interface WorkflowConfig {
  /** Project directory for screenshots/PDFs/notes/state. */
  projectDir?: string
  /** Default execution backend for read-heavy steps. */
  readProvider?: ProviderChoice
  /** Execution backend for gated / strict-review steps. */
  actionProvider?: ProviderChoice
}

/** Snapshot a live observation into a lean owned object (text + coordinate channel). */
function snapshotOf(observation: ComputerUseObservation): PaperObservationSnapshot {
  return {
    observationId: observation.observationId,
    url: observation.url,
    title: observation.title,
    documentText: observation.accessibility?.documentText,
    elements: (observation.accessibility?.elements ?? []).map(e => ({
      elementId: String(e.elementId),
      name: e.name,
      role: e.role,
      bounds: { x: e.bounds.x, y: e.bounds.y, width: e.bounds.width, height: e.bounds.height },
    })),
  }
}

function findElement(snapshot: PaperObservationSnapshot, needle: string) {
  return snapshot.elements.find(e => e.name && e.name.includes(needle))
}

/** The engine. It owns the project dir, the computer-use session, and the run. */
export class PaperAcquisitionEngine {
  private readonly runs = new Map<string, PaperRun>()

  constructor(
    private readonly ctx: Context,
    private readonly config: WorkflowConfig,
  ) {}

  /** Start a new run for one paper, ensuring the project directory exists. */
  async start(paper: PaperInput, projectDir?: string, provider: ProviderChoice = this.config.readProvider ?? 'playwright'): Promise<PaperRun> {
    const dir = projectDir ?? this.config.projectDir ?? process.cwd()
    const layout = await ensureProject(dir)
    const runId = newRunId('paper')
    const resolved = resolveCandidateUrls(paper)
    const run: PaperRun = {
      runId,
      paper,
      resolved,
      candidateUrls: resolved.candidateUrls,
      state: 'RESOLVE',
      provider,
      projectDir: dir,
      layout,
      metadata: {},
    }
    this.runs.set(runId, run)
    return run
  }

  get(runId: string): PaperRun | undefined {
    return this.runs.get(runId)
  }

  /** All runs, newest first (for the client status route). */
  all(): readonly WorkflowStepStatus[] {
    return [...this.runs.values()]
      .map(run => this.toStatus(run))
      .reverse()
  }

  status(runId: string): WorkflowStepStatus | undefined {
    const run = this.runs.get(runId)
    if (run === undefined) return undefined
    return this.toStatus(run)
  }

  private toStatus(run: PaperRun): WorkflowStepStatus {
    return {
      runId: run.runId,
      state: run.state,
      provider: run.provider,
      pageType: run.pageType,
      gate: run.gate,
      url: run.url,
      screenshotPath: run.screenshotPath,
      pdfVerified: run.pdfVerified,
      error: run.error,
    }
  }

  /** Advance the run one state transition. */
  async step(runId: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.require(runId)
    signal?.throwIfAborted()
    switch (run.state) {
      case 'RESOLVE': return this.doResolve(run)
      case 'OPEN': return await this.doOpen(run, signal)
      case 'CLASSIFY': return await this.doClassify(run, signal)
      case 'ACCESS_CHECK': return await this.doAccessCheck(run)
      case 'HUMAN_GATE': return run
      case 'FIND_PDF': return await this.doFindPdf(run, signal)
      case 'DOWNLOAD': return await this.doDownload(run)
      case 'VERIFY_PDF': return await this.doVerify(run)
      case 'STORE': run.state = 'DONE'; return run
      case 'DONE':
      case 'FAILED': return run
      default: run.state = 'FAILED'; return run
    }
  }

  async resume(runId: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.require(runId)
    run.gate = undefined
    run.state = 'CLASSIFY'
    return this.step(runId, signal)
  }

  fail(runId: string, error: string): PaperRun {
    const run = this.require(runId)
    run.state = 'FAILED'
    run.error = error
    return run
  }

  private require(runId: string): PaperRun {
    const run = this.runs.get(runId)
    if (run === undefined) throw new Error(`workflow: unknown run ${runId}`)
    return run
  }

  // ── primitives exposed to the model tool ────────────────────────────────

  /** Open a URL in the run's session (creating one if needed). */
  async open(runId: string, url: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.require(runId)
    const session = await this.ctx.computerUse.start({ startUrl: url }, signal)
    run.sessionId = session.sessionId
    run.targetId = session.targets[0]?.targetId ?? brand<ComputerUseTargetId>('wf-target')
    run.url = url
    run.state = 'CLASSIFY'
    return run
  }

  /** Capture the target, materialize the screenshot to the project dir, return the run. */
  async capture(runId: string, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.require(runId)
    if (run.sessionId === undefined || run.targetId === undefined) {
      throw new Error('workflow: no live session to capture; open a URL first')
    }
    const observation = await this.ctx.computerUse.observe({
      sessionId: brand<ComputerUseSessionId>(run.sessionId),
      targetId: brand<ComputerUseTargetId>(run.targetId),
      include: { screenshot: true, accessibility: true },
    }, signal)
    const dir = run.projectDir ?? this.config.projectDir ?? process.cwd()
    run.screenshotPath = await materializeScreenshot(this.ctx, observation, dir)
    run.url = observation.url
    run.observation = snapshotOf(observation)
    run.pageType = heuristicPageType(observation)
    return run
  }

  /** Perform one computer-use action and re-snapshot. */
  async act(runId: string, action: ComputerUseAction, signal?: AbortSignal): Promise<PaperRun> {
    const run = this.require(runId)
    if (run.sessionId === undefined || run.targetId === undefined || run.observation === undefined) {
      throw new Error('workflow: no current observation to act on')
    }
    const next = await this.ctx.computerUse.act({
      sessionId: brand<ComputerUseSessionId>(run.sessionId),
      targetId: brand<ComputerUseTargetId>(run.targetId),
      observationId: brand<ComputerUseObservationId>(run.observation.observationId),
      action,
    }, signal)
    run.observation = snapshotOf(next)
    run.url = next.url
    run.pageType = heuristicPageType(next)
    return run
  }

  /** Stop the run's browser session. */
  async stop(runId: string): Promise<PaperRun> {
    const run = this.require(runId)
    if (run.sessionId !== undefined) {
      await this.ctx.computerUse.stop({ sessionId: brand<ComputerUseSessionId>(run.sessionId) })
    }
    return run
  }

  /** Find the freshest PDF in the project's pdfs dir (cross-check the download dir). */
  async waitForPdf(runId: string): Promise<PaperRun> {
    const run = this.require(runId)
    run.pdfPath = await this.findDownloadedPdf(run)
    run.state = run.pdfPath === undefined ? 'FAILED' : 'VERIFY_PDF'
    return run
  }

  // ── state machine steps ─────────────────────────────────────────────────

  private doResolve(run: PaperRun): PaperRun {
    const resolved = resolveCandidateUrls(run.paper)
    run.resolved = resolved
    run.candidateUrls = resolved.candidateUrls
    run.state = 'OPEN'
    return run
  }

  private async doOpen(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    const url = run.candidateUrls[0]
    if (url === undefined) return this.fail(run.runId, 'no candidate URL to open')
    return await this.open(run.runId, url, signal)
  }

  private async doClassify(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    return await this.capture(run.runId, signal)
  }

  private async doAccessCheck(run: PaperRun): Promise<PaperRun> {
    switch (run.pageType) {
      case 'ARTICLE_PAGE':
        run.state = 'FIND_PDF'; break
      case 'PDF_VIEWER':
      case 'DOWNLOAD_STARTED':
        run.state = 'VERIFY_PDF'; break
      case 'HUMAN_VERIFICATION':
      case 'LOGIN':
      case 'INSTITUTION_LOGIN':
        run.gate = gateFor(run.pageType, run.url ?? '')
        run.state = 'HUMAN_GATE'; break
      case 'COOKIE_DIALOG':
        run.state = 'FIND_PDF'; break
      case 'PAYWALL':
      case 'ACCESS_DENIED':
      case 'ERROR_PAGE':
        run.error = `page state ${run.pageType} — cannot acquire`
        run.state = 'FAILED'; break
      case 'SEARCH_PAGE':
        run.error = 'landed on a search page; no direct article link'
        run.state = 'FAILED'; break
      case 'UNKNOWN':
      default:
        run.gate = { type: 'UNKNOWN_INTERACTION', reason: 'page unclassified — confirm and continue', state: 'WAITING_HUMAN' }
        run.state = 'HUMAN_GATE'
        break
    }
    return run
  }

  private async doFindPdf(run: PaperRun, signal?: AbortSignal): Promise<PaperRun> {
    if (run.observation === undefined) return this.fail(run.runId, 'no observation to find a PDF from')
    const adapter = adapterFor(run.url ?? '')
    for (const text of adapter.pdfActions) {
      const el = findElement(run.observation, text)
      if (el !== undefined) {
        const next = await this.ctx.computerUse.act({
          sessionId: brand<ComputerUseSessionId>(run.sessionId!),
          targetId: brand<ComputerUseTargetId>(run.targetId!),
          observationId: brand<ComputerUseObservationId>(run.observation.observationId),
          action: { type: 'click-element', elementId: brand<ComputerUseElementId>(el.elementId) },
        }, signal)
        run.observation = snapshotOf(next)
        run.state = adapter.pdfViewer ? 'DOWNLOAD' : 'VERIFY_PDF'
        return run
      }
    }
    return this.fail(run.runId, `no PDF control found for ${run.paper.title ?? run.url ?? 'the page'}`)
  }

  private async doDownload(run: PaperRun): Promise<PaperRun> {
    run.state = 'VERIFY_PDF'
    return run
  }

  private async doVerify(run: PaperRun): Promise<PaperRun> {
    const path = run.pdfPath ?? await this.findDownloadedPdf(run)
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
    const dir = run.layout?.pdfs ?? this.config.projectDir ?? 'C:/Users/22320/Downloads'
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')
    let names: string[] = []
    try { names = await readdir(dir) } catch { return undefined }
    const pdfs = names.filter(n => n.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return undefined
    const withTime = await Promise.all(pdfs.map(async n => {
      const p = join(dir, n)
      try { const s = await stat(p); return { p, mtime: s.mtimeMs } } catch { return { p, mtime: 0 } }
    }))
    withTime.sort((a, b) => b.mtime - a.mtime)
    return withTime[0]?.p
  }
}

/** A cheap, no-vision heuristic for the page type (browser chrome heuristics). */
function heuristicPageType(observation: ComputerUseObservation): PageType {
  const title = (observation.title ?? '').toLowerCase()
  const text = observation.accessibility?.documentText?.toLowerCase() ?? ''
  if (title.includes('pdf') || text.includes('view pdf') && text.includes('download')) return 'ARTICLE_PAGE'
  if (text.includes('are you a robot') || text.includes('captcha') || text.includes('human verification')) return 'HUMAN_VERIFICATION'
  if (text.includes('verify you are human') || text.includes('security verification')) return 'HUMAN_VERIFICATION'
  if (text.includes('sign in') || text.includes('log in')) return 'LOGIN'
  if (text.includes('access denied') || text.includes('there was a problem providing')) return 'ACCESS_DENIED'
  if (text.includes('you don\u2019t have permission') || text.includes('403')) return 'ACCESS_DENIED'
  if (text.includes('accept all cookies') || text.includes('cookie settings')) return 'COOKIE_DIALOG'
  return 'ARTICLE_PAGE'
}

function gateFor(pageType: PageType, _url: string): HumanGateRecord {
  const type: HumanGateType =
    pageType === 'HUMAN_VERIFICATION' ? 'CAPTCHA'
      : pageType === 'LOGIN' ? 'LOGIN_CONFIRMATION'
      : 'SSO'
  return { type, reason: `page state ${pageType} requires a human`, state: 'WAITING_HUMAN' }
}
