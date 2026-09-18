// Smoke test for dsh-file-actions' client bundle.
// Loads the real bundle with a stub module loader, applies it against a stub
// client ctx, then renders its components with the real React (server render)
// and unit-checks the path helpers. No DOM, no DSH process needed.
//
// Usage: node tools/smoke-file-actions.mjs <bundle.js> <dir containing react, or its package.json>...
import { createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, resolve as resolvePath } from 'node:path'

const [bundlePath, ...roots] = process.argv.slice(2)

/** Accept a directory, a package.json, or a relative path for either. */
function requireFrom(root) {
  const absolute = resolvePath(root)
  let target = join(absolute, 'package.json')
  try {
    if (!statSync(absolute).isDirectory()) target = absolute
  } catch {
    // missing path: keep the directory spelling so the error names it
  }
  return createRequire(target)
}

let requireFromRoots = null
for (const root of roots) {
  try {
    const req = requireFrom(root)
    req.resolve('react')
    req.resolve('react-dom/server')
    requireFromRoots = req
    console.log(`react resolved via ${resolvePath(root)}`)
    break
  } catch (error) {
    console.log(`  (no react via ${root}: ${error.code || error.message})`)
  }
}
if (requireFromRoots === null) {
  console.error('FAIL: could not resolve react + react-dom/server from any given root')
  process.exit(1)
}

const react = requireFromRoots('react')
const server = requireFromRoots('react-dom/server')

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec.factory((id) => {
        if (id === 'react') return react
        throw new Error(`unexpected require("${id}")`)
      })
    }
  },
  innerWidth: 1400,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {}
}
globalThis.document = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, style: {}, remove() {}, select() {}, value: '' }),
  body: { appendChild() {}, },
  addEventListener() {},
  removeEventListener() {},
  execCommand: () => true
}
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
  writable: true
})
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })

// --- load the bundle -------------------------------------------------------
const source = readFileSync(bundlePath, 'utf8')
await import(pathToFileURL(bundlePath).href + `?v=${Date.now()}`)

const failures = []
const check = (name, condition, detail = '') => {
  if (condition) console.log(`PASS  ${name}`)
  else {
    console.log(`FAIL  ${name}${detail ? ' -> ' + detail : ''}`)
    failures.push(name)
  }
}

check('bundle registered itself', captured !== null)
if (captured === null) process.exit(1)
check('exports.apply is a function', typeof captured.apply === 'function')
check('exports.inject includes the needed services', JSON.stringify(captured.inject) === JSON.stringify(['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']), JSON.stringify(captured.inject))

// --- apply against a stub ctx ---------------------------------------------
// The stub ctx is wrapped in a Cordis-like reflect guard: reading a service the
// plugin did not declare in `inject` throws exactly what the real runtime
// throws ("cannot get property \"x\" without inject"). Without this guard a
// plain object answers every property, which is how a missing inject entry
// (the bug that made dsh web fail to start once) stayed invisible here.
const FRAMEWORK_MEMBERS = new Set([
  'effect', 'get', 'set', 'on', 'off', 'emit', 'provide', 'inject', 'logger',
  'root', 'scope', 'fiber', 'reflect', 'start', 'stop', 'dispose', 'name'
])

function guarded(declared, real) {
  const allowed = new Set(declared)
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || FRAMEWORK_MEMBERS.has(prop)) return Reflect.get(target, prop, receiver)
      if (!allowed.has(prop)) throw new Error(`cannot get property "${String(prop)}" without inject`)
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      return allowed.has(prop) || FRAMEWORK_MEMBERS.has(prop) || Reflect.has(target, prop)
    }
  })
}

const registrations = []
const slotRegistrations = []
const realCtx = {
  remote: { workspaceFiles: { list: async () => ({ ok: true, value: { entries: [], truncated: false } }) } },
  effect(fn, label) {
    const dispose = fn()
    check(`effect ran & returned disposer: ${label}`, typeof dispose === 'function' || dispose === undefined)
    return dispose
  },
  sidebarRightTabs: {
    register(definition) {
      registrations.push(definition)
      return () => {}
    }
  },
  slots: {
    inject(name, factory) {
      factory()
      return () => {}
    },
    register(definition, component) {
      slotRegistrations.push({ definition, component })
      return () => {}
    }
  }
}
const ctx = guarded(captured.inject, realCtx)

let applyError = null
try {
  captured.apply(ctx)
} catch (error) {
  applyError = error
}
check('apply() runs clean under a Cordis-style inject guard', applyError === null, applyError && applyError.stack)

// Regression proof: the same apply() must FAIL when 'remote' is dropped from
// the declared inject list — i.e. this guard really does catch that bug.
let guardCaught = null
try {
  captured.apply(guarded(captured.inject.filter((name) => name !== 'remote'), realCtx))
} catch (error) {
  guardCaught = error
}
check(
  'guard reproduces the crash when ctx.remote is undeclared',
  guardCaught !== null && /without inject/.test(String(guardCaught.message)),
  guardCaught === null ? 'no error raised — the test would miss this bug' : String(guardCaught.message)
)

check('registered exactly one tab type', registrations.length === 1)
const def = registrations[0] || {}
check('tab type takes over kind "files"', def.kind === 'files', String(def.kind))
check('tab type uses the extension tier', def.priority === 'extension', String(def.priority))
check('tab type id matches the registered body key', def.id === 'dsh-file-actions', String(def.id))
check('tab type declares a guide entry', Array.isArray(def.guide) && def.guide.length === 1)
check('tab type title() returns text', typeof def.title === 'function' && def.title() === '文件')
check('registered one slot body under the same key', slotRegistrations.length === 1 && slotRegistrations[0].definition.key === def.id, JSON.stringify(slotRegistrations.map((r) => r.definition)))

// --- path helpers ---------------------------------------------------------
const i = captured.__internals
check('fileAddressFor: workspace-relative', i.fileAddressFor('s1', 'C:\\ws', 'C:\\ws\\a b\\c.txt') === 'dsh-resource://file/session/s1/a%20b/c.txt', i.fileAddressFor('s1', 'C:\\ws', 'C:\\ws\\a b\\c.txt'))
check('fileAddressFor: keeps drive-letter colon literal', i.sessionFileAddress('s1', 'C:/x.txt') === 'dsh-resource://file/session/s1/C:/x.txt', i.sessionFileAddress('s1', 'C:/x.txt'))
check('nativePath: drive path to backslashes', i.nativePath('C:/a/b.txt') === 'C:\\a\\b.txt', i.nativePath('C:/a/b.txt'))
check('parentDir: file -> folder', i.parentDir('C:/a/b.txt') === 'C:/a', i.parentDir('C:/a/b.txt'))
check('parentDir: nested', i.parentDir('C:/a/b/c.txt') === 'C:/a/b', i.parentDir('C:/a/b/c.txt'))
check('childPath: normalizes trailing separators', i.childPath('C:/a/', 'b') === 'C:/a/b', i.childPath('C:/a/', 'b'))
check('orderEntries: directories first, natural order', (() => {
  const out = i.orderEntries([{ name: 'b10.txt', type: 'file' }, { name: 'sub', type: 'directory' }, { name: 'a2.txt', type: 'file' }]).map((x) => x.name).join(',')
  return out === 'sub,a2.txt,b10.txt'
})(), i.orderEntries([{ name: 'b10.txt', type: 'file' }, { name: 'sub', type: 'directory' }, { name: 'a2.txt', type: 'file' }]).map((x) => x.name).join(','))
check('failureLine: maps not-found', i.failureLine({ code: 'workspace-file/not-found' }).includes('不在了'))
check('pathParts splits directory and name', JSON.stringify(i.pathParts('C:\\a\\b')) === JSON.stringify({ directory: 'C:\\a\\', name: 'b' }), JSON.stringify(i.pathParts('C:\\a\\b')))

// --- render ---------------------------------------------------------------
const Body = slotRegistrations[0]?.component
const treeStub = {
  state: { root: 'C:/ws', levels: { 'C:/ws': { status: 'ready', entries: [{ name: 'a.txt', type: 'file' }, { name: 'sub', type: 'directory' }, { name: 'weird', type: 'other' }], truncated: true } }, expanded: ['C:/ws'] },
  flash() {},
  onToggle() {},
  onOpen() {}
}

function renderTree(element) {
  return server.renderToStaticMarkup(element)
}

let bodyHtml = null
let bodyError = null
try {
  bodyHtml = renderTree(
    react.createElement(Body, {
      useTabInfo: () => ({ tab: { id: 't1', title: '文件', signal: new AbortController().signal, actions: { openResource() {} } } }),
      sessionId: 's1',
      useSessions: (selector) => selector({ byId: { s1: { cwd: 'C:/ws' } } })
    })
  )
} catch (error) {
  bodyError = error
}
check('Body renders without throwing', bodyError === null, bodyError && bodyError.stack)
check('Body returns null until its tree is seeded (client seeds in an effect)', bodyHtml === '' || bodyHtml === null, JSON.stringify(bodyHtml))

let headerHtml = null
let headerError = null
try {
  headerHtml = renderTree(react.createElement(i.Header, { root: 'C:/ws/sub dir', onReload() {} }))
} catch (error) {
  headerError = error
}
check('Header renders without throwing', headerError === null, headerError && headerError.stack)
check('Header shows the root path', headerHtml !== null && headerHtml.includes('C:/ws/') && headerHtml.includes('sub dir'), headerHtml)
check('Header renders a reload control', headerHtml !== null && headerHtml.includes('重新读取'))

let entryHtml = null
let entryError = null
try {
  entryHtml = renderTree(
    react.createElement(
      'ul',
      null,
      react.createElement(i.Entry, { parent: 'C:/ws', entry: { name: 'a.txt', type: 'file' }, tree: treeStub }),
      react.createElement(i.Entry, { parent: 'C:/ws', entry: { name: 'sub', type: 'directory' }, tree: treeStub })
    )
  )
} catch (error) {
  entryError = error
}
check('Entry renders without throwing', entryError === null, entryError && entryError.stack)
check('every row carries the ⋯ button', entryHtml !== null && (entryHtml.match(/class="dfa-dots"/g) || []).length === 2, `dots=${(entryHtml || '').match(/class="dfa-dots"/g)?.length}`)
check('rows expose their absolute path', entryHtml !== null && entryHtml.includes('data-fa-path="C:/ws/a.txt"'))

let levelHtml = null
let levelError = null
try {
  levelHtml = renderTree(react.createElement('ul', null, react.createElement(i.Level, { path: 'C:/ws', tree: treeStub })))
} catch (error) {
  levelError = error
}
check('Level renders without throwing', levelError === null, levelError && levelError.stack)
check('Level shows directory-first order and the truncation note', levelHtml !== null && levelHtml.indexOf('sub') < levelHtml.indexOf('a.txt') && levelHtml.includes('只显示了一部分'))

// open menu path: render RowMenu with an open state forced by clicking is not
// possible without a DOM, but rendering its closed form must work.
let menuError = null
try {
  renderTree(react.createElement(i.RowMenu, { path: 'C:/ws/a.txt', isDirectory: false, tree: treeStub }))
} catch (error) {
  menuError = error
}
check('RowMenu renders closed without throwing', menuError === null, menuError && menuError.stack)

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECK(S) FAILED: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
