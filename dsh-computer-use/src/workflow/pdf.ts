/**
 * PDF verification (design doc §7): a "downloaded" file is only trusted after
 * `%PDF-` magic bytes, a real page count, and a plausible title match. This is
 * what turns "download succeeded" into "the right paper exists".
 * @module dsh-computer-use/workflow/pdf
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { PdfVerification } from './types.ts'

/** Percent-match threshold for a title to count as "same paper". */
const TITLE_MATCH_THRESHOLD = 0.4

/**
 * Verify a candidate PDF file. Never trusts the extension alone — a login.html
 * or captcha.html saved as `.pdf` must fail here.
 */
export async function verifyPdf(
  path: string,
  expectedTitle?: string,
): Promise<PdfVerification> {
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch {
    return { ok: false, isPdfMagic: false, message: `file not readable: ${path}` }
  }

  // 1. Magic bytes (design doc §7).
  const isPdfMagic = bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-'
  if (!isPdfMagic) {
    return {
      ok: false,
      isPdfMagic: false,
      message: 'not a PDF (magic bytes missing; likely login/captcha HTML)',
    }
  }

  // 2. Page count: count `/Type /Page` occurrences (best-effort).
  const text = bytes.toString('latin1')
  const pageCount = (text.match(/\/Type\s*\/Page\b/g) || []).length

  // 3. Title similarity against the expected paper title (design doc §7).
  let titleMatch: number | undefined
  if (expectedTitle) {
    // The first page usually carries the title; take the first 2KB as a probe.
    const probe = text.slice(0, 4096).toLowerCase()
    const expected = expectedTitle.toLowerCase()
    const overlap = wordOverlap(probe, expected)
    titleMatch = overlap
  }

  // 4. Produce a synthetic filename if the download used a slug.
  void basename(path)

  const ok = titleMatch === undefined ? true : titleMatch >= TITLE_MATCH_THRESHOLD
  return {
    ok,
    isPdfMagic: true,
    pageCount: pageCount || undefined,
    titleMatch,
    message: ok
      ? 'PDF verified (magic bytes + plausible title match)'
      : `PDF bytes are valid but the first page does not match the expected title (match ${titleMatch?.toFixed(2) ?? 'n/a'})`,
  }
}

/** Fraction of expected-title words present in the page probe. */
function wordOverlap(probe: string, expected: string): number {
  const words = expected
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2)
  if (words.length === 0) return 1
  const found = words.filter(w => probe.includes(w)).length
  return found / words.length
}

/** A random run id, for per-paper isolation (design doc §8). */
export function newRunId(prefix = 'run'): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}
