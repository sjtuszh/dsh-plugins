# dsh-lan

Lan gateway + machine switcher for the DeepSeek Harness Web GUI.

Each machine running this plugin exposes its loopback DSH (`127.0.0.1:3080`)
to the LAN through a small gateway on port **4080** (HTTP + WebSocket reverse
proxy that rewrites Host/Origin so the browser-trust fence lets remote `/api`
requests through — no `--trusted-host` needed), plus a UDP discovery beacon on
port **4081** so every machine learns about the others. A sidebar button opens
a switcher that embeds any discovered machine's GUI via an iframe.

## Why 4080 and not 3080

The DSH web server is **deliberately bound to `127.0.0.1:3080` only**. Its web
stack never exposes the LAN interface, and the CLI hard-rejects `--host 0.0.0.0`
("intentionally not supported yet for safety: it would expose remote code
execution to the network"). Reason: the DSH GUI drives an agent that can run
arbitrary commands on the host, so exposing the server directly is an RCE risk
the authors intentionally close.

So `http://<ip>:3080/` is **never** reachable from another machine — that's not a
fault, it's by design. The gateway on **4080** is the actual LAN front door: it
binds `0.0.0.0:4080` as a **separate process** (it does not touch the DSH
webserver, so the loopback-only whitelist does not apply), then reverse-proxies
into `127.0.0.1:3080`. Use **`http://<lan-ip>:4080/`** from other machines.

## Install

```sh
# from the plugin checkout (this directory)
dsh plugin --profile web add ./dsh-lan
# restart dsh web to activate
dsh web
```

Installing runs `pnpm add` in the web profile; because `package.json`
declares `dsh.bundle.patch`, the reconcile step also appends `dsh-lan` to
`dsh.profile.bundles`. Restart is required for the composition (and the
browser client roster) to pick it up.

## Use

1. Open the DSH GUI on any machine (localhost or via a gateway URL).
2. Click **远程** at the sidebar foot → the remote switcher opens, listing the
   local machine plus any discovered/added LAN machines.
3. Click **连接管理** → a dialog where you can **add**, **edit**, and **delete**
   manual connections. Each connection stores a computer name, an IP address,
   and a port (default **4080**). Connections you save here appear in the
   switcher dropdown.
4. Pick one from the dropdown → that machine's full GUI is embedded; switch back
   to 本机 anytime. A "新标签打开当前" link opens the remote GUI in its own tab.

Direct access also works: `http://<lan-ip>:4080/`.

### What the remote device actually sees

Accessing `http://<host>:4080/` drives **that host's single DSH process** (the
gateway just proxies into it). The remote device is not a second, independent
DSH — it is another screen into the same backend. So it shows **the host's exact
workspaces and sessions**, and anything you open from the remote lands in the
same places as from the host. That is automatically synchronized: there is no
separate state to merge.

> If instead you run separate DSH instances on multiple machines, each has its
> own workspaces/sessions; the switcher lets you jump between machines, but DSH
> has **no** cross-instance session sync — pick one machine's gateway if you
> need the data to be identical.

## Config

Stored in `$DSH_HOME/.dsh-lan/config.json` (created on first run) and editable
in the switcher UI:

```json
{
  "port": 4080,
  "discoveryPort": 4081,
  "token": "",
  "manualPeers": [
    { "name": "studio", "ip": "192.168.1.50", "port": 4080 }
  ]
}
```

- `token` — optional shared secret. When set, every gateway request needs
  `?token=<token>` (or a cookie set on first navigation). Configure the SAME
  token on every machine so the selector can open peers. Empty = open access.
- `manualPeers` — machines to include even if UDP discovery is blocked
  (different VLAN, firewall, etc.).

## Firewall

Allow inbound for the gateway and discovery on every machine (admin shell):

```powershell
netsh advfirewall firewall add rule name="dsh-lan-gateway" dir=in action=allow protocol=TCP localport=4080 profile=private
netsh advfirewall firewall add rule name="dsh-lan-discover" dir=in action=allow protocol=UDP localport=4081 profile=private
```

## Troubleshooting / verify

**Is the gateway actually up?** (run on the host that runs DSH)

```powershell
Get-NetTCPConnection -LocalPort 4080,3080 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
# expect: 3080 -> 127.0.0.1 (DSH, loopback),  4080 -> 0.0.0.0 (gateway up)
```

- **4080 absent** → the plugin is not active: make sure `dsh plugin add` ran,
  `dsh web` was restarted, and the profile's `dsh.profile.bundles` lists
  `dsh-lan`.
- **4080 bound but a LAN peer can't reach it** → firewall rule missing (the
  gateway binding does not open the OS firewall).
- **Test from another machine, not from localhost** — a localhost `200` only
  proves the bind, not LAN reachability.

**`crypto.randomUUID is not a function` when adding a workspace (or any
operation) over `http://<ip>:4080/`** — that web API only exists in a secure
context (HTTPS or localhost). Over plain-HTTP LAN access the browser exposes
`crypto.getRandomValues` but not `crypto.randomUUID`. The gateway injects a
small polyfill (built on `getRandomValues`) into every HTML page it proxies, so
workspace creation and RPC ids work over HTTP. If you still hit it, hard-refresh
the remote browser (Ctrl+Shift+R) to pick up the polyfilled page.

## Layout

```
lib/index.js    host plugin (Node ESM): spawns the gateway child, seeds config.json
lib/client.js   browser module (ModuleLoader CJS): footer button + switcher overlay
cordis.patch.yml  profile patch: inserts the host row `dsh-lan`
```

## Security

The gateway exposes the machine's DSH to the LAN — the model there can run
commands and read/write arbitrary files, so the gateway is effectively full
machine control. Use it only on a trusted LAN and set a shared `token`.
Privileged DSH methods (`settings.update`, `credentials.*`, `host.openPath`,
`llm.discoverModels`, …) are not auth-gated by the gateway; only the shared
token stands between a peer and your machine.

If stronger protection is wanted (the gateway is still an RCE surface), either
add HTTP Basic Auth in front of the gateway or use the account/session login
from `dsh-plugin-remote`.

## Differences from dsh-plugin-remote

`dsh-plugin-remote` adds scrypt login + session cookies + WebRTC desktop
projection. This plugin keeps no login (optional shared token) and focuses on
multi-machine discovery + one-click switching. Add a login layer if the LAN is
not trusted.
