/**
 * List the Chrome / Edge profiles on this machine so you can pick one to reuse
 * (already-logged-in) in the computer-use browser. Shows each profile's display
 * name and signed-in account emails, not just its directory name.
 *
 * Run:  pnpm exec tsx scripts/discover-profiles.ts
 * JSON: pnpm exec tsx scripts/discover-profiles.ts --json
 * @module dsh-computer-use/scripts
 */

import { discoverBrowserProfiles } from '../src/profiles.ts'

async function main(): Promise<void> {
  const profiles = await discoverBrowserProfiles()

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(profiles, null, 2))
    return
  }

  console.log('Browser profiles found:')
  for (const p of profiles) {
    const who = p.displayName || p.name
    const accounts = p.accounts.length > 0 ? ` (${p.accounts.join(', ')})` : ''
    console.log(`  [${p.browser}] ${who}${accounts}  →  ${p.userDataDir}  (profile: ${p.name})`)
  }
  if (profiles.length === 0) {
    console.log('  (none — no Chrome/Edge profile detected)')
  }
  console.log('\nTo reuse a profile, set in the dsh-computer-use/plugin config:')
  console.log('    reuseBrowserProfile: true')
  console.log('    browserUserDataDir: "<User Data root>"')
  console.log('    browserProfileName: "<profile name>"')
  console.log('\n⚠️  Close the browser first, or the profile will be locked.')
}

main().catch((error) => {
  console.error('DISCOVER FAILED:', error instanceof Error ? error.message : error)
  process.exit(1)
})
