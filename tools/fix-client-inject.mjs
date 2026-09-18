// Fix stale client inject entries in dsh plugin package.json files.
// Only rewrites the contents of "inject": [ ... ] arrays; preserves indentation.
// Usage: node _fix_inject.mjs <file...>
import { readFileSync, writeFileSync } from 'node:fs'

const STALE = /dsh-client-runtime/

function fixInjectArray(text) {
  return text.replace(/"inject"\s*:\s*\[([^\]]*)\]/g, (whole, inner) => {
    const items = inner
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const kept = items.filter((x) => !STALE.test(x) && x !== '"slots"')
    if (kept.length === items.length) return whole
    if (kept.length === 0) return '"inject": []'
    const indentMatch = inner.match(/\n([ \t]+)/)
    if (!indentMatch) return `"inject": [${kept.join(', ')}]`
    const ind = indentMatch[1]
    const closeInd = ind.length >= 2 ? ind.slice(0, -2) : ''
    return `"inject": [\n${kept.map((k) => ind + k).join(',\n')}\n${closeInd}]`
  })
}

let changed = 0
for (const file of process.argv.slice(2)) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    console.log(`SKIP  ${file} (${e.code})`)
    continue
  }
  const out = fixInjectArray(text)
  if (out === text) {
    console.log(`NOCHANGE ${file}`)
    continue
  }
  let parsed
  try {
    parsed = JSON.parse(out)
  } catch (e) {
    console.log(`INVALID after edit, skipped: ${file} -> ${e.message}`)
    continue
  }
  const dump = []
  for (const [label, holder] of [
    ['dsh.client', parsed.dsh && parsed.dsh.client],
    ['dshClient', parsed.dshClient],
  ]) {
    if (holder && Array.isArray(holder.inject)) {
      dump.push(`${label}.inject: [${holder.inject.join(', ')}]`)
      if (holder.inject.some((x) => STALE.test(x) || x === 'slots')) {
        throw new Error(`still stale: ${file} ${label}`)
      }
    }
  }
  writeFileSync(file, out)
  changed++
  console.log(`FIXED ${file}\n      ${dump.join('\n      ')}`)
}
console.log(`\n${changed} file(s) written`)
