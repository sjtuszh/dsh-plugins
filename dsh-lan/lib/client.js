/* dsh-lan browser half (static client module).
 *
 * Loaded by the Web shell's ModuleLoader (a CJS factory: `require("react")`
 * resolves from the runtime module registry). It registers two slots:
 *   - sidebar.footer.action  -> the "远程" switch button (styled like the
 *                               Settings / cordis-plugin footer buttons)
 *   - shell.overlay          -> the frame-wide switcher that lists discovered
 *                               LAN peers and embeds the selected machine's GUI.
 *
 * Peer data comes straight from the local gateway (same-machine, CORS `*`):
 *   /__dsh-lan__/info  { name, ips, gwPort, upstreamPort, tokenOn }
 *   /__dsh-lan__/peers [{ name, ip, port, manual }]
 *   /__dsh-lan__/config (POST) { token?, manualPeers? } -> writes config.json
 * There is no private host RPC; everything is a plain browser fetch.
 */
window.__ModuleLoader__.load({
  id: "dsh-lan",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var GW_PORT = 4080
    function gwBase () {
      var origin = String(window.location.origin || "")
      var m = /:([0-9]+)$/.exec(origin)
      if (m && Number(m[1]) === GW_PORT) return origin
      return "http://127.0.0.1:" + GW_PORT
    }
    function fetchJson (url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json() })
    }
    function gwInfo () { return fetchJson(gwBase() + "/__dsh-lan__/info") }
    function gwPeers () { return fetchJson(gwBase() + "/__dsh-lan__/peers") }
    function gwSave (patch) {
      return fetch(gwBase() + "/__dsh-lan__/config", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
      }).then(function (r) { return r.json() })
    }

    var open = false
    var listeners = []
    function setOpen (v) { open = !!v; listeners.forEach(function (l) { try { l(open) } catch (e) {} }) }
    function useOpen () {
      var o = React.useState(open)
      React.useEffect(function () {
        listeners.push(o[1])
        return function () { var i = listeners.indexOf(o[1]); if (i >= 0) listeners.splice(i, 1) }
      }, [])
      return o[0]
    }

    function networkIcon (size) {
      return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("circle", { cx: 6, cy: 6, r: 2.4 }),
        React.createElement("circle", { cx: 18, cy: 18, r: 2.4 }),
        React.createElement("circle", { cx: 18, cy: 6, r: 2.4 }),
        React.createElement("path", { d: "M7.5 7.5l8.5 8.5M8.4 6h7.2M6 8.4v7.2M16.5 7.5l-1 8.5" })
      )
    }

    function FooterButton (props) {
      var opened = useOpen()
      var wide = !!props.wide
      return React.createElement("button", {
        type: "button",
        onClick: function () { setOpen(!opened) },
        title: "远程 DSH 切换",
        "aria-label": "远程 DSH 切换",
        "aria-expanded": opened,
        style: {
          display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8,
          width: "100%", minWidth: 0, padding: wide ? "9px 12px" : "10px",
          border: "none", background: opened ? "rgba(120,160,255,.12)" : "transparent",
          color: "inherit", cursor: "pointer", borderRadius: 9, fontSize: 13, fontWeight: 500,
          fontFamily: "inherit", textAlign: "left", lineHeight: 1
        }
      }, [
        React.createElement("span", { style: { display: "inline-flex", flexShrink: 0, color: "inherit" } }, networkIcon(wide ? 16 : 18)),
        wide ? React.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "远程") : null
      ])
    }

    function OverlayView (props) {
      var opened = props.useOpen()
      var ctx = props.ctx
      var [info, setInfo] = React.useState(null)
      var [peers, setPeers] = React.useState([])
      var [target, setTarget] = React.useState("local")
      var [tokenDraft, setTokenDraft] = React.useState("")
      var [managerOpen, setManagerOpen] = React.useState(false)
      var [editingPeer, setEditingPeer] = React.useState(null)
      var [peerNameDraft, setPeerNameDraft] = React.useState("")
      var [peerIpDraft, setPeerIpDraft] = React.useState("")
      var [peerPortDraft, setPeerPortDraft] = React.useState(String(GW_PORT))
      var [error, setError] = React.useState(null)

      function load () {
        return Promise.all([gwInfo(), gwPeers()]).then(function (r) {
          setInfo(r[0]); setPeers(r[1] || []); setError(null)
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      }

      React.useEffect(function () {
        if (!opened) return
        load()
        var t = setInterval(load, 8000)
        return function () { clearInterval(t) }
      }, [opened])

      if (!opened) return null

      var tokenOn = !!(info && info.tokenOn)
      var selfUrl = info && info.ips && info.ips[0] ? "http://" + info.ips[0] + ":" + info.gwPort : null
      var options = [{ value: "local", label: "本机（当前）" }].concat((peers || []).map(function (p, i) {
        return {
          value: "http://" + p.ip + ":" + p.port,
          label: (p.name || p.ip) + " (" + p.ip + ":" + p.port + ")"
        }
      }))
      var iframeSrc = target && target !== "local" ? target + (tokenOn ? "?token=" + info.token : "") : null

      function saveToken () {
        gwSave({ token: tokenDraft }).then(function () { setTokenDraft(""); load() }).catch(function (e) { setError(String((e && e.message) || e)) })
      }
      function manualPeers () {
        return (peers || []).filter(function (p) { return p.manual }).map(function (p) { return { name: p.name, ip: p.ip, port: Number(p.port) } })
      }
      function resetPeerForm () {
        setEditingPeer(null)
        setPeerNameDraft("")
        setPeerIpDraft("")
        setPeerPortDraft(String(GW_PORT))
      }
      function openAddPeer () {
        setError(null)
        resetPeerForm()
        setManagerOpen(true)
      }
      function openEditPeer (peer) {
        setError(null)
        setEditingPeer({ ip: peer.ip, port: Number(peer.port) })
        setPeerNameDraft(peer.name || "")
        setPeerIpDraft(peer.ip || "")
        setPeerPortDraft(String(peer.port || GW_PORT))
      }
      function savePeer () {
        var name = (peerNameDraft || "").trim()
        var ip = (peerIpDraft || "").trim()
        var port = Number(peerPortDraft)
        if (!name) { setError("请输入电脑名称"); return }
        if (!/^[0-9a-fA-F:.]+$/.test(ip)) { setError("请输入有效的 IP 地址"); return }
        if (!Number.isInteger(port) || port < 1 || port > 65535) { setError("端口必须在 1 到 65535 之间"); return }
        var manual = manualPeers().filter(function (p) {
          return !editingPeer || !(p.ip === editingPeer.ip && Number(p.port) === editingPeer.port)
        })
        if (manual.some(function (p) { return p.ip === ip && Number(p.port) === port })) {
          setError("该 IP 和端口的连接已经存在")
          return
        }
        manual.push({ name: name, ip: ip, port: port })
        gwSave({ manualPeers: manual }).then(function () {
          resetPeerForm()
          load()
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      }
      function deletePeer (peer) {
        var manual = manualPeers().filter(function (p) { return !(p.ip === peer.ip && Number(p.port) === Number(peer.port)) })
        gwSave({ manualPeers: manual }).then(function () {
          if (target === "http://" + peer.ip + ":" + peer.port) setTarget("local")
          if (editingPeer && editingPeer.ip === peer.ip && editingPeer.port === Number(peer.port)) resetPeerForm()
          load()
        }).catch(function (e) { setError(String((e && e.message) || e)) })
      }

      var rootStyle = {
        position: "fixed", inset: 32, zIndex: 9999, display: "flex", flexDirection: "column",
        background: "rgba(18,18,22,.97)", color: "#e8e8ea", border: "1px solid rgba(255,255,255,.14)",
        borderRadius: 14, boxShadow: "0 14px 56px rgba(0,0,0,.55)", pointerEvents: "auto", overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
      }
      var barStyle = { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)", flexWrap: "wrap" }
      var inputStyle = { background: "rgba(255,255,255,.08)", color: "#eee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, padding: "6px 10px", fontSize: 12 }
      var btnStyle = { background: "rgba(255,255,255,.1)", color: "#eee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" }

      return React.createElement("div", { style: rootStyle },
        React.createElement("div", { style: barStyle },
          React.createElement("b", { style: { fontSize: 13 } }, "远程 DSH"),
          React.createElement("select", { value: target, onChange: function (e) { setTarget(e.target.value) }, style: Object.assign({}, inputStyle, { cursor: "pointer" }) },
            options.map(function (o, i) { return React.createElement("option", { key: String(i), value: o.value }, o.label) })),
          React.createElement("button", { style: btnStyle, onClick: openAddPeer }, "连接管理"),
          React.createElement("button", { style: btnStyle, onClick: load }, "刷新"),
          React.createElement("span", { style: { flex: 1 } }),
          React.createElement("span", { style: { fontSize: 11, color: info ? "#9ad1a3" : "#ff9b9b" } }, info ? "网关正常" : "网关未就绪"),
          React.createElement("button", { style: btnStyle, onClick: function () { props.setOpen(false) } }, "关闭")
        ),
        React.createElement("div", { style: { display: "flex", gap: 10, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", flexWrap: "wrap", alignItems: "center" } },
          React.createElement("label", { style: { fontSize: 11, color: "#aaa" } }, "共享口令（留空=无保护）"),
          React.createElement("input", { style: inputStyle, value: tokenDraft, placeholder: tokenOn ? "已设置" : "未设置", onChange: function (e) { setTokenDraft(e.target.value) } }),
          React.createElement("button", { style: btnStyle, onClick: saveToken }, "保存口令")
        ),
        React.createElement("div", { style: { flex: 1, position: "relative" } },
          iframeSrc
            ? React.createElement("iframe", { src: iframeSrc, style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#fff" } })
            : React.createElement("div", { style: { display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13, textAlign: "center", padding: 20 } },
                "选择一台远程机器后在此内嵌显示；也可用下方链接在新标签页打开。\n自动发现基于 UDP 广播（同网段），发现不了可手动添加。")
        ),
        React.createElement("div", { style: Object.assign({}, barStyle, { borderBottom: "none", borderTop: "1px solid rgba(255,255,255,.08)" }) },
          React.createElement("span", { style: { fontSize: 11, color: "#aaa" } },
            "本机: " + (info ? (info.name || "?") + " @ " + (selfUrl || "未联网") : "读取中…") + (tokenOn ? " （口令已启用）" : " ⚠ 无口令保护")),
          React.createElement("span", { style: { flex: 1 } }),
          selfUrl ? React.createElement("a", { href: selfUrl, target: "_blank", rel: "noopener", style: { fontSize: 12, color: "#7aa7ff" } }, "打开本机网关") : null,
          iframeSrc ? React.createElement("a", { href: iframeSrc, target: "_blank", rel: "noopener", style: { fontSize: 12, color: "#7aa7ff" } }, "新标签打开当前") : null
        ),
        error ? React.createElement("div", { style: { padding: "4px 16px", color: "#ff9b9b", fontSize: 11 } }, String(error)) : null,
        React.createElement(ConnectionManager, {
          open: managerOpen,
          onClose: function () { setManagerOpen(false) },
          editing: editingPeer,
          name: peerNameDraft, ip: peerIpDraft, port: peerPortDraft,
          setName: setPeerNameDraft, setIp: setPeerIpDraft, setPort: setPeerPortDraft,
          onSave: savePeer,
          peers: manualPeers(),
          onEdit: openEditPeer,
          onNew: resetPeerForm,
          onDelete: deletePeer
        })
      )
    }

    function ConnectionManager (props) {
      if (!props.open) return null
      var editing = props.editing
      var btnStyle = { background: "rgba(255,255,255,.1)", color: "#eee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" }
      var primaryBtn = Object.assign({}, btnStyle, { background: "rgba(120,160,255,.25)", borderColor: "rgba(120,160,255,.5)" })
      var inputStyle = { background: "rgba(255,255,255,.08)", color: "#eee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 7, padding: "6px 10px", fontSize: 12, width: "100%", boxSizing: "border-box" }
      var fieldStyle = { display: "flex", flexDirection: "column", gap: 4 }
      var labelStyle = { fontSize: 11, color: "#aaa" }

      var rows = (props.peers || []).map(function (p, i) {
        return React.createElement("div", { key: String(i), style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" } },
          React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { fontSize: 13, color: "#eee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.name),
            React.createElement("div", { style: { fontSize: 11, color: "#999" } }, p.ip + ":" + p.port)),
          React.createElement("button", { style: btnStyle, onClick: function () { props.onEdit(p) } }, "编辑"),
          React.createElement("button", { style: btnStyle, onClick: function () { props.onDelete(p) } }, "删除")
        )
      })

      return React.createElement("div", { style: {
        position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,.55)", pointerEvents: "auto", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
      }, onClick: function (e) { if (e.target === e.currentTarget) props.onClose() } },
        React.createElement("div", { style: {
          width: 440, maxWidth: "92vw", maxHeight: "84vh", display: "flex", flexDirection: "column",
          background: "rgba(24,24,28,.98)", color: "#e8e8ea", border: "1px solid rgba(255,255,255,.14)",
          borderRadius: 12, boxShadow: "0 14px 56px rgba(0,0,0,.6)", overflow: "hidden"
        } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" } },
            React.createElement("b", { style: { fontSize: 13 } }, editing ? "编辑连接" : "添加连接"),
            React.createElement("span", { style: { flex: 1 } }),
            React.createElement("button", { style: btnStyle, onClick: props.onClose }, "关闭")),
          React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "14px 16px" } },
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
              React.createElement("div", { style: fieldStyle },
                React.createElement("label", { style: labelStyle }, "电脑名称"),
                React.createElement("input", { style: inputStyle, value: props.name, placeholder: "例如：我的电脑", onChange: function (e) { props.setName(e.target.value) } })),
              React.createElement("div", { style: fieldStyle },
                React.createElement("label", { style: labelStyle }, "IP 地址"),
                React.createElement("input", { style: inputStyle, value: props.ip, placeholder: "192.168.1.50", onChange: function (e) { props.setIp(e.target.value) } })),
              React.createElement("div", { style: fieldStyle },
                React.createElement("label", { style: labelStyle }, "端口"),
                React.createElement("input", { style: inputStyle, value: props.port, placeholder: "4080", inputMode: "numeric", onChange: function (e) { props.setPort(e.target.value) } }))),
            React.createElement("div", { style: { marginTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" } },
              React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 4px" } },
                React.createElement("b", { style: { fontSize: 12, color: "#ddd" } }, "已保存的连接"),
                React.createElement("button", { style: primaryBtn, onClick: props.onNew }, "新增")),
              rows.length ? rows : React.createElement("div", { style: { padding: "10px 0", color: "#888", fontSize: 12 } }, "还没有手动连接的机器。"))),
          React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.1)" } },
            React.createElement("button", { style: btnStyle, onClick: props.onClose }, "取消"),
            React.createElement("button", { style: primaryBtn, onClick: props.onSave }, editing ? "保存修改" : "添加")))
      )
    }

    function apply (ctx) {
      var slots = ctx.get("slots")
      if (slots === undefined) return
      slots.inject("sidebar.footer.action", function () {
        return slots.register({ name: "sidebar.footer.action", id: "dsh-lan-switch", order: 55, label: function () { return "远程" } }, FooterButton)
      })
      slots.inject("shell.overlay", function () {
        return slots.register({ name: "shell.overlay", id: "dsh-lan-overlay", order: 70 }, function () {
          return React.createElement(OverlayView, { ctx: ctx, useOpen: useOpen, setOpen: setOpen })
        })
      })
    }

    exports.name = "dsh-lan"
    exports.inject = ["slots"]
    exports.apply = apply
    return module.exports
  }
})
