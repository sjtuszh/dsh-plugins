/**
 * Site adapters: per-publisher semantic HINTS, not scripts.
 *
 * The design doc (§10) is explicit: an adapter stores local knowledge about a
 * publisher — signal substrings and candidate PDF button texts — but never
 * pixel coordinates. Computer Use still locates the actual button from the
 * live screenshot; the adapter only tells it *what* to look for.
 * @module dsh-computer-use/workflow/adapter
 */

import type { SiteAdapter } from './types.ts'

/** The built-in adapter set. `generic` is last and always matches. */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [
  {
    id: 'elsevier',
    hosts: ['sciencedirect.com', 'linkinghub.elsevier.com'],
    articleSignals: ['Download PDF', 'View PDF', 'Full text access'],
    pdfActions: ['View PDF', 'Download PDF', 'Article PDF', 'Full Text PDF'],
    cookieDismiss: ['Accept all cookies', 'Accept', 'I accept'],
    pdfViewer: true,
  },
  {
    id: 'springer',
    hosts: ['link.springer.com'],
    articleSignals: ['Download PDF', 'View article', 'Access provided by'],
    pdfActions: ['Download PDF', 'View PDF', 'Article PDF'],
    cookieDismiss: ['Accept all cookies', 'Reject optional cookies', 'Accept'],
    pdfViewer: true,
  },
  {
    id: 'wiley',
    hosts: ['onlinelibrary.wiley.com'],
    articleSignals: ['Download PDF', 'Full Access', 'View full text'],
    pdfActions: ['Download PDF', 'View PDF', 'Full Text PDF'],
    cookieDismiss: ['Accept all cookies', 'Accept', 'OK'],
    pdfViewer: true,
  },
  {
    id: 'tandfonline',
    hosts: ['tandfonline.com'],
    articleSignals: ['Download PDF', 'Full text', 'Citation'],
    pdfActions: ['Download PDF', 'View PDF', 'Full Text PDF'],
    cookieDismiss: ['Accept all cookies', 'Accept cookies', 'Accept'],
    pdfViewer: true,
  },
  {
    id: 'generic',
    hosts: [],
    articleSignals: ['Download PDF', 'View PDF', 'PDF', 'Full text', 'Article'],
    pdfActions: ['Download PDF', 'View PDF', 'PDF', 'Article PDF', 'Full Text PDF'],
    cookieDismiss: ['Accept all cookies', 'Accept', 'Got it', 'OK', 'Close'],
    pdfViewer: true,
  },
]

/** Pick the adapter for a URL, nearest host match, `generic` last. */
export function adapterFor(url: string): SiteAdapter {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    /* fall through to generic */
  }
  for (const adapter of SITE_ADAPTERS) {
    if (adapter.hosts.some(h => host.endsWith(h))) return adapter
  }
  return SITE_ADAPTERS[SITE_ADAPTERS.length - 1]
}

/**
 * Resolve candidate landing URLs from author/knowledge hints. This stage never
 * touches the GUI (design doc §1): it uses DOI first, then publisher-known
 * patterns, then a search engine fallback.
 */
export function resolveCandidateUrls(input: {
  doi?: string
  title?: string
  authors?: readonly string[]
}): ResolvedHint {
  const urls: string[] = []
  if (input.doi) urls.push(`https://doi.org/${input.doi}`)
  if (input.title) {
    // A search fallback: let the computer-use provider hit a search engine.
    urls.push(`https://www.google.com/search?q=${encodeURIComponent(input.title)}`)
  }
  return {
    doi: input.doi,
    candidateUrls: urls,
    source: input.doi ? 'doi' : 'hints',
  }
}

interface ResolvedHint {
  doi?: string
  candidateUrls: string[]
  source: string
}
