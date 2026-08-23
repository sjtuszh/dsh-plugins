/**
 * Interactive cookie/profile import: query Chrome/Edge profiles with their
 * display names and account emails, ask the user which one to reuse, then print
 * the exact `browserProfileDir` + config snippet for the plugin.
 *
 * Run:  pnpm exec tsx scripts/import-cookie-profile.ts
 *
 * An agent can drive the same flow non-interactively: pass no flag to see the
 * numbered list, or `--json` for a machine-readable array it can feed to a
 * user question. Selecting a profile still needs the user, because reusing a
 * real profile hands the agent that profile's cookies and logins.
 * @module dsh-computer-use/scripts
 */

import { discoverBrowserProfiles, type BrowserProfile } from '../src/profiles.ts'
import { createInterface } from 'node:readline'

const WINDOWS_PATH = /^[A-Za-z]:[/\\]/

/** A forward-slash path that survives YAML unquoted and Playwright on Windows. */
function yamlPath(profileDir: string): string {
  return profileDir.replace(/\\/g, '/')
}

function label(profile: BrowserProfile, index: number): string {
  const who = profile.displayName || profile.name
  const accounts = profile.accounts.length > 0 ? ` (${profile.accounts.join(', ')})` : ''
  return `[${index}] [${profile.browser}] ${who}${accounts}  →  ${profile.name}`
}

function configSnippet(profile: BrowserProfile): string {
  return [
    '- id: computer-use',
    '  config:',
    '    provider: playwright',
    '    reuseBrowserProfile: true',
    `    browserUserDataDir: "${yamlPath(profile.userDataDir)}"`,
    `    browserProfileName: "${profile.name}"`,
  ].join('\n')
}

async function main(): Promise<void> {
  const profiles = await discoverBrowserProfiles()
  if (profiles.length === 0) {
    console.log('No Chrome/Edge profiles found.')
    process.exit(1)
  }

  console.log('Browser profiles (reusing one hands the agent its cookies + logins):\n')
  profiles.forEach((profile, index) => console.log(`  ${label(profile, index + 1)}`))
  console.log('\n⚠️  Close the browser first, or the profile will be locked.')

  const answer = await new Promise<string>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`\nWhich profile to reuse? [1-${profiles.length}] (or q to quit): `, (value) => {
      rl.close()
      resolve(value.trim())
    })
  })

  if (answer.toLowerCase() === 'q') {
    console.log('Cancelled.')
    return
  }
  const choice = Number(answer)
  if (!Number.isInteger(choice) || choice < 1 || choice > profiles.length) {
    console.error(`Invalid choice "${answer}" — expected 1-${profiles.length}.`)
    process.exit(1)
  }

  const selected = profiles[choice - 1]
  console.log('\nAdd to ~/.dsh/profiles/web/cordis.patch.yml (then restart dsh --profile web):\n')
  console.log(configSnippet(selected))
}

main().catch((error) => {
  console.error('IMPORT FAILED:', error instanceof Error ? error.message : error)
  process.exit(1)
})
