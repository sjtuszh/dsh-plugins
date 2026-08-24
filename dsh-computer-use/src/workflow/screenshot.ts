/**
 * Screenshot materialization.
 *
 * The design's vision channel (per plugin-authored reference) is NOT "call a
 * third-party vision API"; it is: capture the screenshot → copy the
 * content-addressed object to a local `.png` in the project directory → the
 * multimodal DSH model reads it with `read_image`. This module does the
 * materialization; it never invokes a vision route.
 * @module dsh-computer-use/workflow/screenshot
 */

import type { Context } from '@deepseek-ai/cordis'
import { readFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AttachmentId, ImageMediaType, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ComputerUseObservation } from '../types.ts'
import { projectLayout } from './project.ts'

/**
 * Materialize an observation's screenshot into the project's `screenshots/`
 * dir as a `.png`, returning its file path. Falls back to reading the
 * attachment bytes directly when the attachment store exposes `readImage`,
 * else copies the object from the known content-addressed layout.
 */
export async function materializeScreenshot(
  ctx: Context,
  observation: ComputerUseObservation,
  projectDir: string,
): Promise<string> {
  const screenshot = observation.screenshot
  if (screenshot === undefined) throw new Error('workflow: observation has no screenshot')
  const layout = projectLayout(projectDir)
  const dest = join(layout.screenshots, `capture-${observation.observationId}.png`)

  const imageRef: ImageAttachmentRef = {
    attachmentId: screenshot.attachmentId as AttachmentId,
    mediaType: screenshot.mediaType as ImageMediaType,
    bytes: screenshot.bytes,
    width: screenshot.width,
    height: screenshot.height,
  }

  // Try the attachment store's readImage first (harness-native).
  const attachments = ctx.get('attachments') as { readImage?: (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<{ data: Uint8Array }> } | undefined
  if (attachments?.readImage) {
    try {
      const stored = await attachments.readImage(imageRef)
      await copy(Buffer.from(stored.data.buffer, stored.data.byteOffset, stored.data.byteLength), dest)
      return dest
    } catch {
      // fall through to content-addressed object copy
    }
  }

  // Fallback: copy straight from the content-addressed object store.
  const object = objectPathFor(imageRef.attachmentId)
  if (object !== undefined) {
    await copyFile(object, dest).catch(() => {})
  }
  return dest
}

/** Reconstruct the content-addressed object path for an attachment id. */
function objectPathFor(attachmentId: string): string | undefined {
  const id = attachmentId.replace(/^sha256:/, '')
  if (!/^[0-9a-f]{64}$/i.test(id)) return undefined
  const h2 = id.slice(0, 2)
  return join(process.env.DSH_HOME ?? `${process.env.USERPROFILE ?? ''}\\.dsh`, 'attachments', 'v1', 'objects', h2, id)
}

/** Write bytes to a file. */
async function copy(data: Buffer, path: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, data)
}
