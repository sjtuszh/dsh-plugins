/**
 * Workflow settings page (rendered in `settings.section`).
 *
 * Lets the user set the default project directory (text input + an optional
 * directory-picker button) and the vision model route. Values are stored
 * in-memory for the plugin lifetime and surfaced to the host tools on next
 * run.
 */

import { useState } from 'react'
import css from './WorkflowSettings.module.css'

/** Persist the workflow prefs to localStorage (client-scoped, best-effort). */
const STORAGE_KEY = 'dsh-computer-use:workflow-prefs'

interface Prefs {
  projectDir: string
  visionProvider: string
  visionModel: string
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { projectDir: '', visionProvider: '', visionModel: '', ...JSON.parse(raw) as Partial<Prefs> }
  } catch { /* ignore */ }
  return { projectDir: '', visionProvider: '', visionModel: '' }
}

export function WorkflowSettings(_props: unknown): JSX.Element {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)

  const update = (patch: Partial<Prefs>): void => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  return (
    <div className={css.root} data-plugin="dsh-computer-use">
      <h2 className={css.heading}>Workflow</h2>
      <p className={css.desc}>Paper Acquisition workflow defaults. The project directory holds screenshots, PDFs, notes, and state.</p>

      <label className={css.field}>
        <span className={css.label}>Default project directory</span>
        <div className={css.row}>
          <input
            className={css.input}
            value={prefs.projectDir}
            placeholder="C:\\path\\to\\project"
            onChange={e => update({ projectDir: e.target.value })}
          />
          <button
            className={css.btn}
            onClick={() => {
              const dir = window.prompt('Project directory path', prefs.projectDir)
              if (dir) update({ projectDir: dir })
            }}
          >
            Choose…
          </button>
        </div>
        <span className={css.hint}>Created automatically if missing. The model can also pass <code>projectDir</code> per run.</span>
      </label>

      <label className={css.field}>
        <span className={css.label}>Vision model (optional)</span>
        <input
          className={css.input}
          value={prefs.visionModel}
          placeholder="qwen2.5-vl-72b-instruct"
          onChange={e => update({ visionModel: e.target.value })}
        />
        <span className={css.hint}>For future image-capable pickup. Text workflows don't need it.</span>
      </label>

      <div className={css.footer}>
        <button className={css.btn} onClick={() => { window.dispatchEvent(new CustomEvent('dsh-cu:rerun-prefs', { detail: prefs })) }}>
          Apply
        </button>
      </div>
    </div>
  )
}

export default WorkflowSettings
