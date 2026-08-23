/**
 * Workflow types for the Paper Acquisition runtime.
 *
 * This is the "state machine, not site scripts" seam the design doc demands:
 * nodes are steps in a state machine, the model never codes per-publisher
 * selectors, and Human Gate is a first-class node rather than a pause hack.
 * @module dsh-computer-use/workflow/types
 */

/** The fixed page-state taxonomy the classifier must return (design doc §3). */
export type PageType =
  | 'ARTICLE_PAGE'
  | 'PDF_VIEWER'
  | 'LOGIN'
  | 'INSTITUTION_LOGIN'
  | 'HUMAN_VERIFICATION'
  | 'COOKIE_DIALOG'
  | 'ACCESS_DENIED'
  | 'PAYWALL'
  | 'SEARCH_PAGE'
  | 'DOWNLOAD_STARTED'
  | 'ERROR_PAGE'
  | 'UNKNOWN'

/** Human-gate reasons (design doc §5). */
export type HumanGateType =
  | 'CAPTCHA'
  | 'CLOUDFLARE'
  | 'MFA'
  | 'SSO'
  | 'LOGIN_CONFIRMATION'
  | 'DOWNLOAD_CONFIRMATION'
  | 'UNKNOWN_INTERACTION'

/** Which execution backend a node should use. */
export type ProviderChoice = 'playwright' | 'windows'

/** A paper the workflow is asked to acquire. */
export interface PaperInput {
  title?: string
  doi?: string
  authors?: readonly string[]
  year?: number
}

/** A resolved candidate source for a paper (design doc §1). */
export interface ResolvedPaper {
  /** Best-known DOI (may be a resolved DOI). */
  doi?: string
  /** Candidate landing URLs, best first. */
  candidateUrls: readonly string[]
  /** Where the DOI/URL came from: crossref/openalex/pubmed/semantic_scholar/hints. */
  source: string
}

/** A lean, owned copy of one observation — NOT the live Cordis object. */
export interface PaperObservationSnapshot {
  observationId: string
  url?: string
  title: string
  /** Interactive element names (and ids) the engine may click. */
  elements: readonly { elementId: string; name?: string; role: string }[]
}

/** One workflow run's world: the paper, the browser session, and its state. */
export interface PaperRun {
  runId: string
  paper: PaperInput
  resolved: ResolvedPaper
  /** Candidate landing URLs (copy, so RESOLVE can be re-run). */
  candidateUrls: readonly string[]
  /** Current state-machine step. */
  state: WorkflowState
  /** Which execution backend the current step uses. */
  provider: ProviderChoice
  /** Live browser computer-use session id, once opened. */
  sessionId?: string
  /** Current target inside that session. */
  targetId?: string
  /** Last classified page type. */
  pageType?: PageType
  /** Last observation url/title. */
  url?: string
  /** Human-gate record, set while waiting for the user. */
  gate?: HumanGateRecord
  /** Downloaded file path after DOWNLOAD. */
  pdfPath?: string
  /** PDF verification outcome once computed. */
  pdfVerified?: PdfVerification
  /** Any terminal error. */
  error?: string
  /** Why classification failed, if it did (e.g. no vision route). */
  classifyError?: string
  /** Last observation, as a lean owned snapshot (never the live object). */
  observation?: PaperObservationSnapshot
  /** Seen pages, to short-circuit repeated obstacles. */
  metadata: Record<string, string>
}

/** The workflow state machine's states (design doc §1). */
export type WorkflowState =
  | 'RESOLVE'
  | 'OPEN'
  | 'CLASSIFY'
  | 'ACCESS_CHECK'
  | 'FIND_PDF'
  | 'DOWNLOAD'
  | 'VERIFY_PDF'
  | 'STORE'
  | 'HUMAN_GATE'
  | 'DONE'
  | 'FAILED'

/** A human gate record: the workflow is paused and needs a person. */
export interface HumanGateRecord {
  type: HumanGateType
  reason: string
  /** Optional pixel bbox of the control the person must click (design doc §15). */
  bbox?: { x: number; y: number; width: number; height: number }
  /** Paused state; remains so until the person confirms or the page changes. */
  state: 'WAITING_HUMAN' | 'VERIFY_GATE'
}

/** Output of the Page Classifier (design doc §3) — classification, not action. */
export interface PageClassification {
  pageType: PageType
  confidence: number
  signals: readonly string[]
}

/** PDF verification (design doc §7) — never trust "downloaded = success". */
export interface PdfVerification {
  ok: boolean
  isPdfMagic: boolean
  pageCount?: number
  titleMatch?: number
  message: string
}

/** A progress event the client pill renders live. */
export interface WorkflowStepStatus {
  runId: string
  state: WorkflowState
  provider: ProviderChoice
  pageType?: PageType
  gate?: HumanGateRecord
  url?: string
  pdfVerified?: PdfVerification
  error?: string
}

/** The adapter's semantic hints for one publisher (design doc §10). */
export interface SiteAdapter {
  id: string
  /** Hostname prefixes this adapter matches. */
  hosts: readonly string[]
  /** Substrings that signal an article page. */
  articleSignals: readonly string[]
  /** Candidate PDF button texts, in preference order. */
  pdfActions: readonly string[]
  /** Cookie-dialog accept/close texts. */
  cookieDismiss: readonly string[]
  /** Whether the publisher opens PDF in an internal viewer (needs a second click). */
  pdfViewer: boolean
}
