// Repo + install inventory for dsh-plugins. UTF-8 safe (JSON.parse, not ConvertFrom-Json).
// Usage: node _repo_inventory.mjs <repoRoot> <profileRoot>
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const repo = process.argv[2]
const profile = process.argv[3]
const profilePkg = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
const deps = profilePkg.dependencies || {}
const bundles = (profilePkg.dsh && profilePkg.dsh.profile && profilePkg.dsh.profile.bundles) || []

const rows = []
for (const name of readdirSync(repo).sort()) {
  if (!name.startsWith('dsh-')) continue
  const dir = join(repo, name)
  if (!statSync(dir).isDirectory()) continue
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    rows.push({ name, version: '-', desc: '(无 package.json：独立工具)', deps: '-', bundle: '-', installed: '-' })
    continue
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  let tracked = '?'
  try {
    tracked = execFileSync('git', ['-C', repo, 'ls-files', name], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length
  } catch {}
  rows.push({
    name: pkg.name || name,
    dir: name,
    version: pkg.version,
    desc: (pkg.description || '').replace(/\s+/g, ' '),
    deps: deps[pkg.name] ? deps[pkg.name] : '-',
    bundle: bundles.includes(pkg.name) ? 'yes' : '-',
    installed: existsSync(join(profile, 'node_modules', pkg.name)) ? 'yes' : '-',
    tracked
  })
}

console.log('## 仓库插件盘点\n')
console.log('| 目录 | npm 包 | 版本 | profile 依赖 | bundle 层 | 已安装 | git 跟踪文件 | 说明 |')
console.log('|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.dir || r.name} | ${r.name} | ${r.version} | ${r.deps} | ${r.bundle} | ${r.installed} | ${r.tracked ?? '-'} | ${(r.desc || '').slice(0, 60)} |`)
}

console.log('\n## profile: ' + profile)
console.log('dependencies: ' + JSON.stringify(deps, null, 2))
console.log('bundles: ' + JSON.stringify(bundles))
