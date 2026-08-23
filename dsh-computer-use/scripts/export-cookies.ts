/**
 * Export a browser storage-state (cookies) for dsh-computer-use.
 *
 * Launches a VISIBLE Chromium, opens a site, and waits for you to log in
 * manually. When you press Enter it saves `context.storageState()` to
 * `./cookies.json`, ready for the plugin's `cookiesFile` config.
 *
 * Run:  pnpm exec tsx scripts/export-cookies.ts
 * @module dsh-computer-use/scripts
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

const OUT = resolve(process.cwd(), 'cookies.json')
const START_URL = process.argv[2] ?? 'https://x.com'

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false }) // visible window
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' })

  console.log(`\nA browser opened at ${START_URL}.`)
  console.log('Log in to the sites you want the agent to share, then come back here.')
  await new Promise<void>((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question('Press Enter when you are done logging in: ', () => {
      rl.close()
      done()
    })
  })

  const storage = await context.storageState()
  writeFileSync(OUT, JSON.stringify(storage, null, 2))
  await browser.close()

  console.log(`\nSaved cookies to: ${OUT}`)
  console.log('Now add to the dsh-computer-use/plugin config:')
  console.log(`    importCookies: true`)
  console.log(`    cookiesFile: "${OUT}"`)
}

main().catch((error) => {
  console.error('EXPORT FAILED:', error instanceof Error ? error.message : error)
  process.exit(1)
})
