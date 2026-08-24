/**
 * Paper Acquisition Workflow public entry.
 * @module dsh-computer-use/workflow
 */

export { PaperAcquisitionEngine, type WorkflowConfig } from './engine.ts'
export { registerWorkflow, type WorkflowApi, type WorkflowStateListener } from './tool.ts'
export { materializeScreenshot } from './screenshot.ts'
export { verifyPdf, newRunId } from './pdf.ts'
export { SITE_ADAPTERS, adapterFor, resolveCandidateUrls } from './adapter.ts'
export { ensureProject, projectLayout, projectExists, PROJECT_SUBDIRS } from './project.ts'
export type { ProjectLayout } from './types.ts'
export type {
  PaperInput,
  PaperRun,
  ResolvedPaper,
  WorkflowState,
  WorkflowStepStatus,
  PageType,
  HumanGateType,
  HumanGateRecord,
  PageClassification,
  PdfVerification,
  SiteAdapter,
  ProviderChoice,
} from './types.ts'
