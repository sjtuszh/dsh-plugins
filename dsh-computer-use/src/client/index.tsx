/**
 * Browser plugin for the dsh-computer-use workflow floater.
 *
 * A top-right floating capsule that shows the latest Paper Acquisition
 * workflow run's live state (resolve → open → classify → gate → find PDF →
 * download → verify → store). It polls the host `state` route (agent-teams'
 * pattern) rather than relying on Cordis RPC, and opens a popup listing the
 * current step plus a settings button.
 */

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { WorkflowPill } from './WorkflowPill.tsx'
import { WorkflowSettings } from './WorkflowSettings.tsx'

/** Host state route the floater polls. */
export const STATE_URL = '/plugins/dsh-computer-use/state'

/** Required services for this client half (slots for the settings page). */
export const inject = ['slots']

/** Mount the floater via a body portal (no top-right slot) and the settings tab. */
export function apply(ctx: ClientContext): void {
  const host = document.createElement('div')
  host.dataset.dshComputerUseHost = ''
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(<WorkflowPill stateUrl={STATE_URL} />)
  ctx.effect(() => () => {
    root.unmount()
    host.remove()
  }, 'dsh-computer-use: workflow pill')

  // Settings page: a workflow section so the user can set the default project
  // dir and vision model. This is additive; it never replaces the shell.
  const slots = ctx.get('slots') as {
    inject: (name: string, cb: () => unknown) => void
    register?: (def: unknown, Comp: unknown) => unknown
  } | undefined
  if (slots?.inject !== undefined && slots.register !== undefined) {
    slots.inject('settings.section', () => slots.register!({
      name: 'settings.section',
      id: 'dsh-computer-use-workflow',
      label: 'Workflow',
      order: 40,
    }, WorkflowSettings))
  }
}
