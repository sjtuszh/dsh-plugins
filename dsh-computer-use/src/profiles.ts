/**
 * Discover installed Chrome / Edge browser profiles so the user can pick one
 * to reuse (already-logged-in) instead of exporting cookies by hand.
 *
 * Each profile carries the human display name (`profile.name`) and the signed-in
 * account emails (`account_info[].email`) read from its `Preferences` file, so
 * a chooser can show "Work (you@example.com)" instead of just "Default".
 * @module dsh-computer-use/profiles
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface BrowserProfile {
  browser: 'chrome' | 'edge'
  /** Profile directory name, e.g. "Default" or "Profile 1". */
  name: string
  /** Human display name from `Preferences` (`profile.name`); "" when unset/unreadable. */
  displayName: string
  /** Signed-in account emails from `Preferences` (`account_info[].email`). */
  accounts: string[]
  /** The browser's User Data root (all profiles live under it). */
  userDataDir: string
  /** The selected profile directory (pass to the provider as `browserProfileDir`). */
  profileDir: string
}

interface PreferencesIdentity {
  profile?: { name?: unknown }
  account_info?: Array<{ email?: unknown }>
}

/** Read a profile's display name and account emails from its Preferences JSON. */
async function readProfileIdentity(profileDir: string): Promise<{ displayName: string; accounts: string[] }> {
  try {
    const raw = await readFile(join(profileDir, 'Preferences'), 'utf8')
    const json = JSON.parse(raw) as PreferencesIdentity
    const displayName = typeof json.profile?.name === 'string' ? json.profile.name : ''
    const accounts = Array.isArray(json.account_info)
      ? json.account_info
        .map(account => (typeof account?.email === 'string' ? account.email : ''))
        .filter(email => email !== '')
      : []
    return { displayName, accounts }
  } catch {
    // Missing, malformed, or momentarily locked Preferences (Chrome writing it)
    // — degrade to directory-name-only discovery rather than failing.
    return { displayName: '', accounts: [] }
  }
}

/** Find every Chrome and Edge profile on this machine. */
export async function discoverBrowserProfiles(): Promise<BrowserProfile[]> {
  const local = process.env.LOCALAPPDATA
  if (local === undefined) return []
  const roots = [
    { browser: 'chrome' as const, dir: join(local, 'Google', 'Chrome', 'User Data') },
    { browser: 'edge' as const, dir: join(local, 'Microsoft', 'Edge', 'User Data') },
  ]
  const out: BrowserProfile[] = []
  for (const root of roots) {
    let entries: string[]
    try {
      entries = await readdir(root.dir)
    } catch {
      continue // browser not installed
    }
    for (const name of entries) {
      const profileDir = join(root.dir, name)
      try {
        const s = await stat(profileDir)
        if (!s.isDirectory()) continue
        // A profile has a Preferences file; skip cache/component dirs.
        const hasPreferences = await stat(join(profileDir, 'Preferences')).then(() => true).catch(() => false)
        if (!hasPreferences) continue
        const { displayName, accounts } = await readProfileIdentity(profileDir)
        out.push({ browser: root.browser, name, displayName, accounts, userDataDir: root.dir, profileDir })
      } catch {
        // unreadable dir — skip
      }
    }
  }
  return out
}
