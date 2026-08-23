import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-lan'
export const inject = ['webServer']

const DEFAULTS = { port: 4080, discoveryPort: 4081, token: '', manualPeers: [], upstreamPort: 3080 }

function readConfig (path) {
  try {
    const raw = readFileSync(join(path, 'config.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        port: parsed.port ?? DEFAULTS.port,
        discoveryPort: parsed.discoveryPort ?? DEFAULTS.discoveryPort,
        token: typeof parsed.token === 'string' ? parsed.token : '',
        manualPeers: Array.isArray(parsed.manualPeers) ? parsed.manualPeers : [],
        upstreamPort: parsed.upstreamPort ?? DEFAULTS.upstreamPort
      }
    }
  } catch (e) {}
  return { ...DEFAULTS }
}

export function apply (ctx) {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(base, '.dsh-lan')
  mkdirSync(dir, { recursive: true })

  // Seed a default config.json on first run (user/UI edits it thereafter).
  const configPath = join(dir, 'config.json')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2), 'utf8')
  }
  const config = readConfig(dir)
  // `webServer` is a hard dependency (inject), so it is guaranteed mounted;
  // the fallback keeps the gateway usable even if the port is momentarily absent.
  const upstreamPort = (ctx.webServer && ctx.webServer.port) || Number(config.upstreamPort) || 3080
  const gwPort = config.port
  const discPort = config.discoveryPort
  console.log('dsh-lan: starting gateway on 0.0.0.0:' + gwPort + ' -> 127.0.0.1:' + upstreamPort)

  const SIDECAR = `'use strict';
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GW_PORT = Number(process.argv[1]);
const DISC_PORT = Number(process.argv[2]);
const UP_PORT = Number(process.argv[3]);
const STATE_DIR = process.argv[4];
const PARENT_PID = process.ppid;
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch (e) {}

const NAME = os.hostname();
function lanIps() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const k in ifaces) {
      const arr = ifaces[k] || [];
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        if (f.family === 'IPv4' && !f.internal) out.push(f.address);
      }
    }
  } catch (e) {}
  return out;
}
const IPS = lanIps();

let config = { port: GW_PORT, discoveryPort: DISC_PORT, token: '', manualPeers: [] };
const peers = new Map();

function peerKey(ip, port) { return ip + ':' + port; }
function notePeer(p, manual) {
  const key = peerKey(p.ip, p.port);
  peers.set(key, { name: p.name || p.ip, ip: p.ip, port: p.port, lastSeen: Date.now(), manual: !!manual });
}
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      config = Object.assign({}, config, parsed);
      if (!Array.isArray(config.manualPeers)) config.manualPeers = [];
      if (typeof config.token !== 'string') config.token = '';
    }
  } catch (e) {}
  const want = new Set();
  for (let i = 0; i < config.manualPeers.length; i++) {
    const mp = config.manualPeers[i];
    const ip = String(mp.ip || '').trim();
    const port = Number(mp.port || config.port);
    if (!ip) continue;
    want.add(peerKey(ip, port));
    notePeer({ name: String(mp.name || ip), ip: ip, port: port }, true);
  }
  for (const entry of peers) {
    if (entry[1].manual && !want.has(entry[0])) peers.delete(entry[0]);
  }
}
loadConfig();
function saveConfigFromBody(body) {
  try {
    const patch = JSON.parse(body);
    if (patch && typeof patch === 'object') {
      if (typeof patch.token === 'string') config.token = patch.token;
      if (Array.isArray(patch.manualPeers)) config.manualPeers = patch.manualPeers;
    }
    const data = JSON.stringify({ port: config.port, discoveryPort: config.discoveryPort, token: config.token, manualPeers: config.manualPeers }, null, 2);
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, CONFIG_FILE);
    return true;
  } catch (e) { return false; }
}

function prunePeers() {
  const now = Date.now();
  for (const entry of peers) {
    if (!entry[1].manual && now - entry[1].lastSeen > 15000) peers.delete(entry[0]);
  }
}
function peerList() {
  prunePeers();
  const out = [];
  for (const entry of peers) {
    const p = entry[1];
    out.push({ name: p.name, ip: p.ip, port: p.port, manual: p.manual });
  }
  return out;
}
function writeState() {
  const self = { name: NAME, ips: IPS, gwPort: GW_PORT, upstreamPort: UP_PORT, tokenOn: !!config.token };
  const data = JSON.stringify({ self: self, peers: peerList(), generatedAt: Date.now() });
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {}
}

function tokenOk(req) {
  if (!config.token) return true;
  const q = String(req.url || '').split('?')[1] || '';
  let qv = null;
  try { qv = new URLSearchParams(q).get('token'); } catch (e) {}
  if (qv === config.token) return true;
  const cookie = String(req.headers.cookie || '');
  const parts = cookie.split(';');
  for (let i = 0; i < parts.length; i++) if (parts[i].trim() === 'dsh-lan=' + config.token) return true;
  return false;
}

const HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
const STRIP = ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };

function rewriteHeaders(headers) {
  const out = {};
  for (const k in headers) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'origin' || lk === 'x-frame-options' || lk === 'content-security-policy' || lk === 'content-security-policy-report-only' || lk.indexOf('sec-fetch-') === 0) continue;
    out[k] = headers[k];
  }
  out.host = '127.0.0.1:' + UP_PORT;
  if (headers.origin) out.origin = 'http://127.0.0.1:' + UP_PORT;
  return out;
}

// crypto.randomUUID is a secure-context-only browser API (HTTPS or localhost).
// Over plain-HTTP LAN access (http://<ip>:4080) it is undefined, so the DSH
// frontend's workspace-add / RPC-id / message-id paths throw. Inject a
// standards-compliant v4 shim built on crypto.getRandomValues, which DOES work
// in insecure contexts.
const POLYFILL = '<script>(function(){try{var c=window.crypto||{};if(!c.randomUUID&&c.getRandomValues){c.randomUUID=function(){var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;var h=[];for(var i=0;i<16;i++){var x=b[i].toString(16);if(x.length<2)x="0"+x;h.push(x)}var s=h.join("");return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20)}}}catch(e){}})();</script>'

function proxyRequest(clientReq, clientRes) {
  loadConfig();
  const req = http.request({
    host: '127.0.0.1', port: UP_PORT, method: clientReq.method || 'GET', path: clientReq.url,
    headers: rewriteHeaders(clientReq.headers)
  }, function (res) {
    const outHeaders = {};
    for (const k in res.headers) {
      const lk = k.toLowerCase();
      if (HOP.indexOf(lk) >= 0 || STRIP.indexOf(lk) >= 0) continue;
      outHeaders[k] = res.headers[k];
    }
    const ct = String(res.headers['content-type'] || '');
    if (ct.indexOf('text/html') >= 0) {
      delete outHeaders['content-length']
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () {
        try {
          let html = Buffer.concat(chunks).toString('utf8')
          if (html.indexOf('<head') >= 0) {
            html = html.replace(/<head[^>]*>/i, function (m) { return m + POLYFILL })
          } else {
            html = POLYFILL + html
          }
          try { clientRes.writeHead(res.statusCode || 200, outHeaders) } catch (e) { try { clientRes.destroy() } catch (e2) {} return }
          clientRes.end(html)
        } catch (e) { try { clientRes.destroy() } catch (e2) {} }
      })
      return
    }
    try {
      clientRes.writeHead(res.statusCode || 502, outHeaders);
      res.pipe(clientRes);
    } catch (e) { try { clientRes.destroy(); } catch (e2) {} }
  });
  req.on('error', function (e) {
    try {
      if (!clientRes.headersSent) clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      clientRes.end('dsh-lan gateway: upstream unreachable: ' + (e && e.message));
    } catch (e2) {}
  });
  clientReq.pipe(req);
}

function respondJson(res, code, obj) {
  try {
    res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS));
    res.end(JSON.stringify(obj));
  } catch (e) {}
}

const server = http.createServer(function (clientReq, clientRes) {
  const pathname = String(clientReq.url || '/').split('?')[0];
  if (pathname.indexOf('/__dsh-lan__') === 0) {
    if (clientReq.method === 'OPTIONS') {
      try { clientRes.writeHead(204, CORS); clientRes.end(); } catch (e) {}
      return;
    }
    if (pathname === '/__dsh-lan__/info') {
      respondJson(clientRes, 200, { name: NAME, ips: IPS, gwPort: GW_PORT, upstreamPort: UP_PORT, tokenOn: !!config.token });
      return;
    }
    if (pathname === '/__dsh-lan__/peers') {
      respondJson(clientRes, 200, peerList());
      return;
    }
    if (pathname === '/__dsh-lan__/config' && clientReq.method === 'POST') {
      let body = '';
      clientReq.on('data', function (chunk) { body += chunk; });
      clientReq.on('end', function () {
        const ok = saveConfigFromBody(body) === true;
        loadConfig();
        writeState();
        respondJson(clientRes, ok ? 200 : 400, { ok: ok });
      });
      return;
    }
    try { clientRes.writeHead(200, CORS); clientRes.end('not found'); } catch (e) {}
    return;
  }
  if (!tokenOk(clientReq)) {
    try {
      clientRes.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      clientRes.end('dsh-lan gateway: shared token required (append ?token=<token> to the URL)');
    } catch (e) {}
    return;
  }
  if (config.token && pathname === '/' && String(clientReq.headers.cookie || '').indexOf('dsh-lan=') < 0) {
    try { clientRes.setHeader('set-cookie', 'dsh-lan=' + config.token + '; Path=/; SameSite=Lax; HttpOnly'); } catch (e) {}
  }
  proxyRequest(clientReq, clientRes);
});

server.on('upgrade', function (clientReq, clientSocket, head) {
  loadConfig();
  if (!tokenOk(clientReq)) { try { clientSocket.destroy(); } catch (e) {} return; }
  const headers = rewriteHeaders(clientReq.headers);
  headers.connection = 'Upgrade';
  headers.upgrade = 'websocket';
  const req = http.request({
    host: '127.0.0.1', port: UP_PORT, method: 'GET', path: clientReq.url, headers: headers
  });
  req.on('upgrade', function (res, upSocket, upHead) {
    const key = headers['sec-websocket-key'] || '';
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    try {
      clientSocket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
      if (upHead && upHead.length) upSocket.unshift(upHead);
      clientSocket.pipe(upSocket);
      upSocket.pipe(clientSocket);
      clientSocket.on('error', function () {});
      upSocket.on('error', function () {});
    } catch (e) { try { clientSocket.destroy(); } catch (e2) {} }
  });
  req.on('error', function () { try { clientSocket.destroy(); } catch (e) {} });
  req.end();
});

server.on('error', function (e) {
  console.error('dsh-lan gateway error: ' + (e && e.message));
});

try {
  server.listen(GW_PORT, '0.0.0.0', function () {
    const firstIp = IPS[0] || '127.0.0.1';
    console.log('dsh-lan gateway up on 0.0.0.0:' + GW_PORT + ' (LAN: http://' + firstIp + ':' + GW_PORT + ')');
    writeState();
  });
} catch (e) {
  console.error('dsh-lan gateway listen failed: ' + (e && e.message));
  process.exit(1);
}

const disc = dgram.createSocket('udp4');
disc.on('error', function () {});
disc.on('message', function (msg) {
  try {
    const m = JSON.parse(String(msg));
    if (!m || m.t !== 'dsh-lan' || !m.i) return;
    if (IPS.indexOf(m.i) >= 0 && Number(m.p) === GW_PORT) return;
    notePeer({ name: String(m.n || m.i), ip: String(m.i), port: Number(m.p) || GW_PORT }, false);
  } catch (e) {}
});
try {
  disc.bind(DISC_PORT, '0.0.0.0', function () {
    try { disc.setBroadcast(true); } catch (e) {}
  });
} catch (e) { console.error('dsh-lan discovery bind failed: ' + (e && e.message)); }

const BEACON = JSON.stringify({ t: 'dsh-lan', n: NAME, i: IPS[0] || '', p: GW_PORT, v: 1 });
setInterval(function () {
  try { disc.send(BEACON, 0, BEACON.length, DISC_PORT, '255.255.255.255'); } catch (e) {}
  writeState();
}, 3000);

setInterval(function () {
  try { if (PARENT_PID > 0 && process.ppid !== PARENT_PID) process.exit(0); } catch (e) {}
}, 5000);

process.on('SIGTERM', function () { try { process.exit(0); } catch (e) {} });
`

  const child = spawn(process.execPath, ['-e', SIDECAR, String(gwPort), String(discPort), String(upstreamPort), dir], {
    stdio: ['ignore', 'inherit', 'inherit']
  })
  child.on('error', (e) => console.error('dsh-lan: gateway spawn error: ' + (e && e.message)))
  child.on('exit', (code, signal) => console.log('dsh-lan: gateway exited (' + (code ?? signal) + ')'))

  ctx.effect(() => () => {
    try { child.kill() } catch (e) {}
  }, 'dsh-lan: gateway child')
}
