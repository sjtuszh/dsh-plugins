// Inventory installed dsh-* plugins: inject arrays, bundle patch, stale API refs.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const TOKENS = [
  'conversationEvents',
  '@deepseek-ai/dsh-client-runtime',
  'dsh-client-ui-primitives',
  'dsh-client-ui-slots',
]

for (const name of readdirSync(root).sort()) {
  if (!name.startsWith('dsh-')) continue
  const dir = join(root, name)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (e) {
    console.log(`${name}: BAD package.json (${e.message})`)
    continue
  }
  const inject = (pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject) || pkg.dshClient?.inject
  const legacy = pkg.dshClient?.inject
  const bundle = pkg.dsh?.bundle?.patch
  console.log(`\n${name}@${pkg.version}`)
  console.log(`  client.inject : ${inject ? JSON.stringify(inject) : '(none)'}`)
  if (legacy) console.log(`  dshClient (legacy, ${JSON.stringify(legacy) === JSON.stringify(inject) ? 'same' : 'DIFFERENT'}): ${JSON.stringify(legacy)}`)
  console.log(`  bundle.patch  : ${bundle || '(none)'}${bundle && !existsSync(join(dir, bundle)) ? '  <-- MISSING FILE' : ''}`)
  // scan lib/*.js
  const libDir = join(dir, 'lib')
  if (!existsSync(libDir)) continue
  const reqs = new Set()
  const stales = new Map()
  for (const f of readdirSync(libDir)) {
    if (!f.endsWith('.js')) continue
    const text = readFileSync(join(libDir, f), 'utf8')
    for (const m of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) reqs.add(m[1])
    for (const t of TOKENS) {
      const n = text.split(t).length - 1
      if (n) stales.set(`${f}:${t}`, n)
    }
  }
  console.log(`  lib requires  : ${reqs.size ? [...reqs].join(', ') : '(none)'}`)
  if (stales.size) console.log(`  STALE REFS    : ${[...stales].map(([k, v]) => `${k} x${v}`).join('; ')}`)
}
