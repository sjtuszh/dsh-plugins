/**
 * The top-right floating capsule for the Paper Acquisition workflow.
 *
 * A collapsed pill shows the latest run's state; clicking it opens a popup
 * listing the run's current step (Agent-driven), any human gate, and a
 * settings button. Polls the host `state` route.
 */

import { useEffect, useState } from 'react'
import css from './WorkflowPill.module.css'

/** Shape of one run as served by the host state route. */
interface RunStatus {
  runId: string
  state: string
  provider?: string
  pageType?: string
  gate?: { type: string; reason?: string; state?: string }
  url?: string
  projectDir?: string
  pdfVerified?: { ok?: boolean; message?: string }
  error?: string
}

const STEP_LABEL: Record<string, string> = {
  RESOLVE: 'Resolving paper',
  OPEN: 'Opening page',
  CLASSIFY: 'Classifying page',
  ACCESS_CHECK: 'Checking access',
  FIND_PDF: 'Finding PDF',
  DOWNLOAD: 'Downloading',
  VERIFY_PDF: 'Verifying PDF',
  STORE: 'Storing',
  HUMAN_GATE: 'Human action needed',
  DONE: 'Done',
  FAILED: 'Failed',
}

const POLL_MS = 1500

export function WorkflowPill(props: { stateUrl: string }): JSX.Element {
  const { stateUrl } = props
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<RunStatus[]>([])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch(stateUrl, { cache: 'no-store' })
        if (!alive) return
        const data = (await res.json()) as { runs?: RunStatus[] }
        setRuns(data.runs ?? [])
      } catch {
        // route not up yet; retry next tick
      }
    }
    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [stateUrl])

  const latest = runs[0]
  const label = latest ? (STEP_LABEL[latest.state] ?? latest.state) : 'Workflow idle'
  const gated = latest?.state === 'HUMAN_GATE'

  return (
    <div className={css.root}>
      <button
        className={css.pill}
        data-gated={gated ? '' : undefined}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className={css.dot} data-active={latest && latest.state !== 'DONE' && latest.state !== 'FAILED' ? '' : undefined} />
        <span className={css.label}>{label}</span>
      </button>

      {open && (
        <div className={css.popup}>
          <div className={css.header}>
            <span className={css.title}>Paper Acquisition Workflow</span>
            <button className={css.close} onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className={css.body}>
            {runs.length === 0 && <div className={css.empty}>No workflow run yet. Start one with <code>workflow_acquire_paper</code>.</div>}
            {runs.slice(0, 10).map(run => (
              <div key={run.runId} className={css.run} data-state={run.state}>
                <div className={css.runHead}>
                  <span className={css.state}>{STEP_LABEL[run.state] ?? run.state}</span>
                  <span className={css.runId}>{run.runId}</span>
                </div>
                {run.pageType && <div className={css.meta}>page: {run.pageType}</div>}
                {run.url && <div className={css.meta} data-truncate>{run.url}</div>}
                {run.projectDir && <div className={css.meta} data-muted>project: {run.projectDir}</div>}
                {run.gate && <div className={css.gate} data-type={run.gate.type}>{run.gate.reason ?? 'needs a human'}</div>}
                {run.error && <div className={css.error}>{run.error}</div>}
              </div>
            ))}
          </div>

          <div className={css.footer}>
            <button className={css.settingsBtn} onClick={() => { window.dispatchEvent(new CustomEvent('dsh-cu:open-settings')) }}>
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkflowPill
