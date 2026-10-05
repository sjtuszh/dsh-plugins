// 回环注入代理：让 iframe 里的浏览器（VS Code 内置浏览器、LAN 切换器）也能打开 dsh web。
//
// 问题：DSH 0.1.5 起 Web GUI 需要浏览器会话认证，而它的 cookie 是
//   host-only / Path=/ / HttpOnly / SameSite=Strict
// 在 iframe（第三方上下文）里 Chromium 不会随请求发送 SameSite=Strict 的 cookie，
// 所以「用带 token 的 URL 打开一次」也救不了它：token 交换能成功，重定向后的请求照样 401。
// 另外 /api 的信任围栏还会直接拒绝 Sec-Fetch-Site: cross-site 的请求。
//
// 解法：本代理在服务端侧代浏览器出示凭据——浏览器完全不需要持有 cookie，
// SameSite 也就无关紧要；同时把 Host/Origin/Sec-Fetch-Site 规范化成「同源第一方」，
// 让围栏放行。
//
//   VS Code 内置浏览器 → http://127.0.0.1:3081  →(注入 cookie + 规范化头)→  http://127.0.0.1:3080
//
// ⚠️ 本代理**绕过认证**，因此只监听回环地址、绝不能绑 0.0.0.0。
//    它也是本机特权工具：任何能访问 127.0.0.1:3081 的本机进程都等于已登录。
//
// 用法：node dsh-embed-proxy.mjs [--port 3081] [--upstream-port 3080] [--days 30]
import http from 'node:http'
import net from 'node:net'
import { mintCookie } from './web-cookie.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback
}

const LISTEN_HOST = '127.0.0.1' // 固定回环；不要改成 0.0.0.0
const LISTEN_PORT = Number(flag('--port', '3081'))
const UPSTREAM_HOST = flag('--upstream-host', '127.0.0.1')
const UPSTREAM_PORT = Number(flag('--upstream-port', '3080'))
/** 必须等于服务端看到的 Host（cookie 的 audience 与围栏都按它校验）。 */
const AUTHORITY = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`
const PROXY_ORIGIN = `http://${LISTEN_HOST}:${LISTEN_PORT}`
const UPSTREAM_ORIGIN = `http://${AUTHORITY}`
const DAYS = Number(flag('--days', '30'))

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
const log = (message) => console.log(`${stamp()} [embed-proxy] ${message}`)

let session = null
function refresh(reason) {
  try {
    session = { ...mintCookie({ authority: AUTHORITY, days: DAYS }), mintedAt: Date.now() }
    log(`已铸会话 cookie（${reason}），到期 ${new Date(session.expiresAt).toISOString()}`)
  } catch (error) {
    session = null
    log(`铸 cookie 失败：${error.message ?? error}`)
  }
}
refresh('启动')
setInterval(() => refresh('定期刷新'), 6 * 3600 * 1000).unref()

/** 把浏览器发来的头规范化成「上游看到的第一方请求」。 */
function rewriteRequestHeaders(incoming) {
  const headers = { ...incoming }
  headers.host = AUTHORITY
  if (session !== null) headers.cookie = session.cookie
  else delete headers.cookie
  if (headers.origin !== undefined) headers.origin = UPSTREAM_ORIGIN
  if (typeof headers.referer === 'string') headers.referer = UPSTREAM_ORIGIN + headers.referer.slice(PROXY_ORIGIN.length)
  if (headers['sec-fetch-site'] !== undefined) headers['sec-fetch-site'] = 'same-origin'
  return headers
}

/** 上游若是绝对跳到自己，改回代理地址，避免浏览器绕过代理。 */
function rewriteResponseHeaders(headers) {
  const out = { ...headers }
  if (typeof out.location === 'string' && out.location.startsWith(UPSTREAM_ORIGIN)) {
    out.location = PROXY_ORIGIN + out.location.slice(UPSTREAM_ORIGIN.length)
  }
  return out
}

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers: rewriteRequestHeaders(req.headers)
    },
    (up) => {
      if (up.statusCode === 401) refresh('上游返回 401')
      res.writeHead(up.statusCode ?? 502, rewriteResponseHeaders(up.headers))
      up.pipe(res)
    }
  )
  upstream.on('error', (error) => {
    if (res.headersSent) {
      res.end()
      return
    }
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`embed-proxy: 上游不可达 ${AUTHORITY}（${error.message}）\n`)
  })
  req.pipe(upstream)
})

// HMR 等可能用 WebSocket：原样透传握手与字节流。
server.on('upgrade', (req, socket, head) => {
  const headers = rewriteRequestHeaders(req.headers)
  const lines = [`GET ${req.url} HTTP/1.1`]
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
  }
  lines.push('', '')
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    upstream.write(lines.join('\r\n'))
    if (head !== undefined && head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  upstream.on('error', (error) => {
    try {
      socket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${error.message}`)
    } catch {}
  })
  socket.on('error', () => upstream.destroy())
})

server.timeout = 0
server.headersTimeout = 60 * 1000

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`就绪：${PROXY_ORIGIN}  →  ${UPSTREAM_ORIGIN}（注入 cookie，Host/Origin/Sec-Fetch-Site 规范化为第一方）`)
  log(`在 VS Code 内置浏览器里打开 ${PROXY_ORIGIN} （不要再带 ?token=…）`)
  if (session === null) log('警告：当前没有可用 cookie，请先确认 dsh web 至少启动过一次。')
})
