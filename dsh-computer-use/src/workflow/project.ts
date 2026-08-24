/**
 * Workflow project directory.
 *
 * Every workflow run works in one local project directory that holds its
 * intermediate files and outputs (design decisions confirm this): screenshots,
 * downloaded PDFs, notes/markdown, and workflow state. The directory is chosen
 * at run time — either by the operator via a directory picker, or by the model
 * passing a path — and is created if it does not exist.
 * @module dsh-computer-use/workflow/project
 */

import { mkdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** The sub-directories a project owns. */
export const PROJECT_SUBDIRS = ['screenshots', 'pdfs', 'notes', 'state'] as const

/** Resolve the canonical sub-directory paths for a project. */
export function projectLayout(projectDir: string): {
  root: string
  screenshots: string
  pdfs: string
  notes: string
  state: string
} {
  const root = resolve(projectDir)
  return {
    root,
    screenshots: join(root, 'screenshots'),
    pdfs: join(root, 'pdfs'),
    notes: join(root, 'notes'),
    state: join(root, 'state'),
  }
}

/**
 * Ensure a project directory exists (creating it if missing) with its standard
 * sub-directories. Returns the resolved layout.
 */
export async function ensureProject(projectDir: string): Promise<ReturnType<typeof projectLayout>> {
  const layout = projectLayout(projectDir)
  for (const dir of [layout.root, layout.screenshots, layout.pdfs, layout.notes, layout.state]) {
    await mkdir(dir, { recursive: true })
  }
  return layout
}

/** Whether a project directory (any of its roots) already exists. */
export async function projectExists(projectDir: string): Promise<boolean> {
  try {
    await access(resolve(projectDir))
    return true
  } catch {
    return false
  }
}
