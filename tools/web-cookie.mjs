// 用持久化密钥为本机 dsh web 铸一个有效的浏览器会话 cookie。
//
// 为什么需要它：DSH 0.1.5 起 Web GUI 要浏览器会话认证，cookie 是
// host-only / Path=/ / HttpOnly / SameSite=Strict 的，因此**在 iframe 里（VS Code
// 内置浏览器、LAN 切换器）不会随请求发送**。回环代理可以在服务端侧注入这个
// cookie，浏览器就完全不需要持有它，SameSite 也就无关紧要了。
//
// 密钥来源：$DSH_HOME/.credentials.yaml 的
//   records → client-connection/browser-session → payload.secret（base64url, 32 字节）
// cookie 格式（见 @deepseek-ai/dsh-client-connection 源码）：
//   name  = "dsh-auth-" + base64url(sha256(authority))
//   value = "v1." + base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, body))
//   payload = { version: 1, authority, issuedAt, expiresAt }   // 毫秒时间戳
//
// 用法：node web-cookie.mjs [--authority 127.0.0.1:3080] [--days 30] [--name-only] [--print]
// 默认只输出 cookie 的 "名字=值"（供代理直接用作 Cookie 头）；--print 才带说明文字。
// 也可以被 import：mintCookie({ authority, days, dshHome }) → { cookie, name, expiresAt }
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const base64url = (buffer) => buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

/**
 * 用持久化密钥铸一个 dsh web 浏览器会话 cookie。
 * @param options.authority - 规范化 authority（必须与服务端看到的 Host 一致），默认 127.0.0.1:3080
 * @param options.days - 有效期天数，默认 30
 * @param options.dshHome - DSH_HOME，默认 $DSH_HOME 或 ~/.dsh
 * @returns { cookie, name, expiresAt }
 */
export function mintCookie(options = {}) {
  const authority = options.authority ?? '127.0.0.1:3080'
  const days = options.days ?? 30
  const dshHome = options.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const credentialsPath = join(dshHome, '.credentials.yaml')

  let text
  try {
    text = readFileSync(credentialsPath, 'utf8')
  } catch {
    throw new Error(`找不到凭据文件：${credentialsPath}（用 DSH_HOME 指定别处）`)
  }

  const key = 'client-connection/browser-session:'
  const at = text.indexOf(key)
  if (at < 0) {
    throw new Error('凭据文件里没有 client-connection/browser-session 记录：先启动过一次 dsh web 让它生成。')
  }
  const secretMatch = /(?:^|\n)\s*secret:\s*([A-Za-z0-9_-]+)/.exec(text.slice(at))
  if (secretMatch === null) throw new Error('该记录里没有可用的 secret 字段。')
  const secret = Buffer.from(secretMatch[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  if (secret.byteLength !== 32) throw new Error(`secret 长度异常（${secret.byteLength} 字节，应为 32）。`)

  const now = Date.now()
  const payload = {
    version: 1,
    authority,
    issuedAt: now,
    expiresAt: now + Math.round(days * 24 * 60 * 60 * 1000)
  }
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = base64url(createHmac('sha256', secret).update(body).digest())
  const name = 'dsh-auth-' + base64url(createHash('sha256').update(authority).digest())
  return { cookie: `${name}=v1.${body}.${signature}`, name, expiresAt: payload.expiresAt }
}

/** 直接运行时的 CLI 行为；被 import 时不执行。 */
function main(argv) {
  const args = argv.slice(2)
  const flag = (name, fallback) => {
    const at = args.indexOf(name)
    return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback
  }
  const authority = flag('--authority', '127.0.0.1:3080')
  const days = Number(flag('--days', '30'))
  const nameOnly = args.includes('--name-only')
  const verbose = args.includes('--print')

  let minted
  try {
    minted = mintCookie({ authority, days })
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exit(1)
  }
  console.log(nameOnly ? minted.name : minted.cookie)
  if (verbose) {
    console.error(`authority=${authority}  expires=${new Date(minted.expiresAt).toISOString()}  cookieName=${minted.name}`)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv)
}
