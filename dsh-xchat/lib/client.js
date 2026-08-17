// ============================================================================
// 跨会话知识桥 dsh-xchat — Client 半边（静态版 bundle）
// ----------------------------------------------------------------------------
// 职责:
//  1) 注册 @ 触发源 'session':行首/空格后的原生触发,候选来自 client
//     sessions.list(全量:跨工作区/子代理/归档,title 由 host 投影填充)。
//  2) 自绘菜单:接管「@ 前是字母/汉字/数字」的边界(原生 detectTrigger
//     不触发),检测 input 事件 + DOM value/selectionStart,渲染跟随主题的
//     浮层,选中后经原生 value setter + input 事件注入 draft(走 React
//     输入管道,撤销/发送正常)。
// 注入:slots / sessions / inputTriggers
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-xchat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var stubSchema = { parse: function (value) { return value; } };
    var TYPERT_REMOTE = {
      package: "dsh-xchat",
      descriptors: [
        {
          id: "dsh-xchat#xchat/getStatus",
          service: "xchat",
          namespace: "xchat",
          method: "getStatus",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "strict", typeSymbol: "dsh-xchat/types#XChatStatus", schema: stubSchema },
          sourceLocation: { file: "dsh-xchat/lib/host.js", line: 1, column: 1 }
        },
        {
          id: "dsh-xchat#xchat/getConfig",
          service: "xchat",
          namespace: "xchat",
          method: "getConfig",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "strict", typeSymbol: "dsh-xchat/types#XChatConfigResult", schema: stubSchema },
          sourceLocation: { file: "dsh-xchat/lib/host.js", line: 1, column: 1 }
        },
        {
          id: "dsh-xchat#xchat/listModels",
          service: "xchat",
          namespace: "xchat",
          method: "listModels",
          invocation: { kind: "direct" },
          parameters: [],
          result: { mode: "strict", typeSymbol: "dsh-xchat/types#XChatModelsResult", schema: stubSchema },
          sourceLocation: { file: "dsh-xchat/lib/host.js", line: 1, column: 1 }
        },
        {
          id: "dsh-xchat#xchat/setConfig",
          service: "xchat",
          namespace: "xchat",
          method: "setConfig",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-xchat/types#XChatSetConfigRequest", schema: stubSchema }
            }
          ],
          result: { mode: "strict", typeSymbol: "dsh-xchat/types#XChatConfigResult", schema: stubSchema },
          sourceLocation: { file: "dsh-xchat/lib/host.js", line: 1, column: 1 }
        }
      ]
    };

    var CSS = `
.xchat-atmenu{position:fixed;z-index:1000;background:var(--dsw-specific-menu,#ffffff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-inverted,rgba(0,0,0,0.12));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,0.18));max-height:280px;overflow-y:auto;min-width:240px;max-width:480px;padding:4px;font-size:13px;line-height:20px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.xchat-atmenu-item{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;background:none;border:none;border-radius:10px;cursor:pointer;text-align:left;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}
.xchat-atmenu-item:hover,.xchat-atmenu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.15));outline:none}
.xchat-atmenu-label{flex:none;font-weight:500}
.xchat-atmenu-desc{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#888)}
.xchat-atmenu-muted{padding:8px 10px;color:var(--dsw-alias-label-tertiary,#888)}
.xchat-set{padding:16px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary,#222)}
.xchat-set-title{font-size:14px;font-weight:600}
.xchat-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.xchat-set-label{flex:1;color:var(--dsw-alias-label-primary,#222)}
.xchat-set-desc{font-size:11px;color:var(--dsw-alias-label-tertiary,#888);margin-top:2px}
.xchat-set-input{box-sizing:border-box;width:140px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.3));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);font-size:12px}
.xchat-set-sel{box-sizing:border-box;width:220px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.3));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);font-size:12px}
.xchat-set-btn{padding:6px 14px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15));color:var(--dsw-alias-label-primary,#222);cursor:pointer;font-size:12px}
.xchat-set-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08))}
.xchat-set-status{font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-family:var(--dsw-font-mono,monospace)}
.xchat-set-err{font-size:12px;color:#e5484d}
`;
    var CSS_ID = "dsh-xchat/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var inject = ["slots", "sessions", "inputTriggers", "remote"];

    async function apply(ctx) {
      var unmount = await ctx.remote.$mount(TYPERT_REMOTE);
      // $mount 后一次性取 remote 代理（供设置面板使用），避免每次渲染再查。
      var remoteXchat = ctx.get("remote.xchat");
      var slots = ctx.get("slots");
      var sessions = ctx.get("sessions");
      var inputTriggers = ctx.get("inputTriggers");
      // 菜单开关：设置面板实时更新；false 时 @ 候选为空。
      var menuEnabledRef = { current: true };

      function listRows(query) {
        if (!sessions) return Promise.resolve([]);
        if (menuEnabledRef.current === false) return Promise.resolve([]);
        var list = sessions.list.getSnapshot();
        var current = list.current;
        var q = String(query || "").toLowerCase();
        return Promise.resolve(
          Object.values(list.byId)
            .filter(function (s) { return !s.blank && s.id !== current; })
            // 禁止把任何子代理（含 XChat 派生子代理）列为 @ 候选：跨会话知识桥
            // 的目标是真实会话；子代理既不是知识源，选中还会引发链式派生。
            .filter(function (s) { return s.origin !== "subagent"; })
            .filter(function (s) {
              return (s.displayTitle || "").toLowerCase().includes(q) ||
                     (s.cwd || "").toLowerCase().includes(q) ||
                     (s.id || "").toLowerCase().includes(q);
            })
            .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
            .slice(0, 30)
            .map(function (s) {
              return {
                name: s.displayTitle,
                description: [
                  s.origin === "subagent" ? "子代理" : "",
                  s.running ? "运行中" : "",
                  s.cwd || ""
                ].filter(Boolean).join(" · ")
              };
            })
        );
      }

      // 1) 原生 @ 源:行首/空格后的触发
      if (inputTriggers) {
        var source = {
          trigger: "@",
          name: "session",
          order: 1,
          candidates: function (_session, req) { return listRows(req.query); },
          onPick: function (pick) { return { text: "@" + pick.candidate.name + " " }; },
          codec: {
            clipboardText: function (ref) { return "@" + ref; },
            serialize: function (ref) { return Promise.resolve("@" + ref); }
          }
        };
        ctx.effect(function () { return inputTriggers.registerSource(source); }, "xchat: @ session source");
      }

      // 2) 自绘菜单:接管 word 字符后的 @
      if (slots) {
        var MENU_MARK = "data-xchat-menu";
        var AtMenu = function () {
          var state = react.useState(null);
          var menu = state[0];
          var setMenu = state[1];
          var menuRef = react.useRef(null);
          menuRef.current = menu;
          var lastKey = react.useRef(null);
          var fetchTimer = react.useRef(null);

          react.useEffect(function () {
            var cancelled = false;
            var close = function () {
              if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
              setMenu(null);
            };
            var onInput = function (ev) {
              try {
                var ta = ev.target;
                if (!ta || typeof ta.tagName !== "string" || ta.tagName.toLowerCase() !== "textarea") return;
                try { if (!ta.closest("[data-composer-card]")) return; } catch (e) { return; }
                var value = typeof ta.value === "string" ? ta.value : "";
                var caret = typeof ta.selectionStart === "number" ? ta.selectionStart : value.length;
                var at = -1;
                for (var i = Math.min(caret, value.length) - 1; i >= 0; i--) {
                  var ch = value.charAt(i);
                  if (ch === "\n" || ch === " " || ch === "\t") break;
                  if (ch === "@") { at = i; break; }
                }
                if (at < 0) { close(); return; }
                var prev = at === 0 ? "" : value.charAt(at - 1);
                if (prev === "" || prev === " " || prev === "\n" || prev === "\t") { close(); return; }
                var query = value.slice(at + 1, caret);
                var rect = ta.getBoundingClientRect();
                var key = at + ":" + caret;
                if (lastKey.current === key && menuRef.current && menuRef.current.query === query) return;
                lastKey.current = key;
                var base = { at: at, caret: caret, query: query, ta: ta, x: Math.max(8, rect.left), y: rect.top };
                setMenu({ at: base.at, caret: base.caret, query: base.query, ta: base.ta, x: base.x, y: base.y, items: [], loading: true });
                if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
                fetchTimer.current = window.setTimeout(function () {
                  listRows(query).then(function (rows) {
                    if (cancelled) return;
                    var q = query.toLowerCase();
                    var items = rows
                      .filter(function (r) {
                        return !q || (r.name || "").toLowerCase().includes(q);
                      })
                      .slice(0, 20)
                      .map(function (r) { return { id: r.name, label: r.name, desc: r.description || "" }; });
                    setMenu(function (m) {
                      return m && m.at === base.at && m.caret === base.caret ? { at: base.at, caret: base.caret, query: base.query, ta: base.ta, x: base.x, y: base.y, items: items, loading: false } : m;
                    });
                  }).catch(function () {
                    if (!cancelled) setMenu(function (m) { return m && m.at === base.at ? { at: base.at, caret: base.caret, query: base.query, ta: base.ta, x: base.x, y: base.y, items: m.items, loading: false } : m; });
                  });
                }, 120);
              } catch (e) {
                console.error("xchat menu detect: " + String(e && e.message ? e.message : e));
              }
            };
            var onKeyDown = function (ev) {
              if (ev.key === "Escape") close();
            };
            var onPointerDown = function (ev) {
              try {
                var t = ev.target;
                if (t && typeof t.closest === "function" && t.closest("[" + MENU_MARK + "]")) return;
              } catch (e) { /* ignore */ }
              if (menuRef.current) close();
            };
            // 拖拽会话到聊天窗 → 自动变成 @会话名
            var onDragOver = function (ev) {
              try {
                var t = ev.target;
                if (!t || typeof t.closest !== "function") return;
                if (!t.closest("[data-composer-card]")) return;
                ev.preventDefault();
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
              } catch (e) { /* ignore */ }
            };
            var onDrop = function (ev) {
              try {
                var t = ev.target;
                if (!t || typeof t.closest !== "function") return;
                var card = t.closest("[data-composer-card]");
                if (!card) return;
                ev.preventDefault();
                var id = "";
                try { id = ev.dataTransfer.getData("text/plain") || ""; } catch (e) { id = ""; }
                id = id.trim();
                if (!id) return;
                var ta = card.querySelector("textarea");
                if (!ta) return;
                var label = id;
                if (sessions) {
                  var byId = sessions.list.getSnapshot().byId;
                  var sum = byId[id];
                  if (sum && (sum.displayTitle || sum.title)) label = sum.displayTitle || sum.title;
                }
                var value = typeof ta.value === "string" ? ta.value : "";
                var caret = typeof ta.selectionStart === "number" ? ta.selectionStart : value.length;
                var text = "@" + label + " ";
                var next = value.slice(0, caret) + text + value.slice(caret);
                var pos = caret + text.length;
                var proto = window.HTMLTextAreaElement.prototype;
                var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
                setter.call(ta, next);
                try { ta.focus(); } catch (e2) { /* ignore */ }
                ta.setSelectionRange(pos, pos);
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
                lastKey.current = null;
                setMenu(null);
              } catch (e) {
                console.error("xchat drop failed: " + String(e && e.message ? e.message : e));
              }
            };
            var ok = true;
            try {
              document.addEventListener("input", onInput, true);
              document.addEventListener("keydown", onKeyDown, true);
              document.addEventListener("pointerdown", onPointerDown, true);
              document.addEventListener("dragover", onDragOver, true);
              document.addEventListener("drop", onDrop, true);
            } catch (e) {
              ok = false;
              console.error("xchat menu attach failed: " + String(e && e.message ? e.message : e));
            }
            return function () {
              cancelled = true;
              if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
              if (ok) {
                try {
                  document.removeEventListener("input", onInput, true);
                  document.removeEventListener("keydown", onKeyDown, true);
                  document.removeEventListener("pointerdown", onPointerDown, true);
                  document.removeEventListener("dragover", onDragOver, true);
                  document.removeEventListener("drop", onDrop, true);
                } catch (e) { /* ignore */ }
              }
            };
          }, []);

          var pick = function (item) {
            var m = menuRef.current;
            if (!m || !m.ta) return;
            var ta = m.ta;
            var value = typeof ta.value === "string" ? ta.value : "";
            var text = "@" + item.label + " ";
            var next = value.slice(0, m.at) + text + value.slice(m.caret);
            var pos = m.at + text.length;
            try {
              var proto = window.HTMLTextAreaElement.prototype;
              var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
              setter.call(ta, next);
              try { ta.focus(); } catch (e) { /* ignore */ }
              ta.setSelectionRange(pos, pos);
              ta.dispatchEvent(new Event("input", { bubbles: true }));
            } catch (e) {
              console.error("xchat insert failed: " + String(e && e.message ? e.message : e));
            }
            if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
            lastKey.current = null;
            setMenu(null);
          };

          if (!menu) return null;
          var body = menu.loading
            ? react.createElement("div", { className: "xchat-atmenu-muted" }, "加载会话…")
            : menu.items.length === 0
              ? react.createElement("div", { className: "xchat-atmenu-muted" }, "没有匹配的会话")
              : menu.items.map(function (item) {
                  return react.createElement("button", {
                    key: item.id,
                    type: "button",
                    className: "xchat-atmenu-item",
                    onMouseDown: function (ev) { try { ev.preventDefault(); } catch (e) { /* 防止抢焦点 */ } },
                    onClick: function () { pick(item); }
                  },
                    react.createElement("span", { className: "xchat-atmenu-label" }, item.label),
                    item.desc ? react.createElement("span", { className: "xchat-atmenu-desc" }, item.desc) : null
                  );
                });
          var mark = {};
          mark[MENU_MARK] = "";
          return react.createElement("div", Object.assign(mark, {
            className: "xchat-atmenu",
            style: { left: menu.x, top: Math.max(8, menu.y - 8), transform: "translateY(-100%)" }
          }), body);
        };
        slots.inject("conversation.composer.dock", function () {
          return slots.register(
            { name: "conversation.composer.dock", id: "xchat-at-menu", order: 1000, label: "xchat @ menu" },
            function () { return react.createElement(AtMenu); }
          );
        });

        // ── 设置面板：原生设置界面新增「XChat」tab ─────────────────────────
        function XChatSettings(props) {
          var remote = props.remote;
          var stState = react.useState({ loading: true, error: null, status: null });
          var st = stState[0], setSt = stState[1];
          var draftState = react.useState(null);
          var draft = draftState[0], setDraft = draftState[1];
          var savedState = react.useState(null);
          var saved = savedState[0], setSaved = savedState[1];
          var modelsState = react.useState([]);
          var models = modelsState[0], setModels = modelsState[1];

          react.useEffect(function () {
            if (!remote) { setSt({ loading: false, error: "未连接到 host 服务（remote.xchat 不可用）", status: null }); return; }
            remote.getStatus().then(function (res) {
              if (res && res.ok) {
                setSt({ loading: false, error: null, status: res });
                setDraft({ enabled: !!res.config.enabled, menuEnabled: !!res.config.menuEnabled, autoCleanup: !!res.config.autoCleanup, waitTimeoutMs: res.config.waitTimeoutMs, modelMode: res.config.modelMode || "auto", modelProvider: res.config.modelProvider || "", modelId: res.config.modelId || "" });
              } else {
                setSt({ loading: false, error: (res && res.error) || "读取失败", status: null });
              }
            }).catch(function (e) {
              setSt({ loading: false, error: String(e && e.message ? e.message : e), status: null });
            });
            // 加载模型目录，供「指定模型」模式使用。
            remote.listModels().then(function (res) {
              if (res && res.ok && Array.isArray(res.groups)) setModels(res.groups);
            }).catch(function () { /* ignore */ });
          }, [remote]);

          function save() {
            if (!remote || !draft) return;
            setSaved(null);
            remote.setConfig({ config: draft }).then(function (res) {
              if (res && res.ok) {
                menuEnabledRef.current = res.config.menuEnabled;
                setSt({ loading: false, error: null, status: res });
                setSaved("已保存");
              } else {
                setSaved("保存失败: " + ((res && res.error) || "unknown"));
              }
            }).catch(function (e) {
              setSaved("保存失败: " + String(e && e.message ? e.message : e));
            });
          }

          var body;
          if (st.loading) {
            body = react.createElement("div", { className: "xchat-set" }, "正在读取 XChat 状态…");
          } else if (st.error) {
            body = react.createElement("div", { className: "xchat-set" },
              react.createElement("div", { className: "xchat-set-err" }, st.error));
          } else if (!st.status) {
            body = react.createElement("div", { className: "xchat-set" }, "无状态");
          } else {
            var row = function (label, desc, control) {
              return react.createElement("div", { className: "xchat-set-row" },
                react.createElement("div", { className: "xchat-set-label" },
                  label,
                  desc ? react.createElement("div", { className: "xchat-set-desc" }, desc) : null
                ),
                control
              );
            };
            var cb = function (key) {
              return react.createElement("input", {
                type: "checkbox",
                checked: !!draft[key],
                onChange: function (ev) { var d = Object.assign({}, draft); d[key] = ev.target.checked; setDraft(d); }
              });
            };
            var modeSel = react.createElement("select", {
              className: "xchat-set-sel",
              value: draft.modelMode,
              onChange: function (ev) { var d = Object.assign({}, draft); d.modelMode = ev.target.value; setDraft(d); }
            },
              react.createElement("option", { value: "auto" }, "自动（继承目标会话的模型）"),
              react.createElement("option", { value: "custom" }, "指定模型")
            );
            var kids = [
              react.createElement("div", { className: "xchat-set-title" }, "跨会话知识桥（XChat）"),
              react.createElement("div", { className: "xchat-set-status" },
                "工具注册: " + (st.status.toolRegistered ? "✓" : "✗") + " · 活跃子代理: " + st.status.activeCount),
              row("启用 xchat_query", "关闭后模型不再能调用跨会话查询工具", cb("enabled")),
              row("@ 菜单", "关闭后 @ 候选列表为空（拖拽仍可用）", cb("menuEnabled")),
              row("自动清理孤儿", "每次查询前清理遗留的 xchat:* 子代理（30 秒限流）", cb("autoCleanup"))
            ];
            kids.push(row("子代理模型", "自动=继承目标会话的模型；指定=下面选择", modeSel));
            if (draft.modelMode === "custom") {
              var pSel = react.createElement("select", {
                className: "xchat-set-sel",
                value: draft.modelProvider,
                onChange: function (ev) { var d = Object.assign({}, draft); d.modelProvider = ev.target.value; d.modelId = ""; setDraft(d); }
              },
                react.createElement("option", { value: "" }, "选择 Provider…"),
                models.map(function (g) {
                  return react.createElement("option", { key: g.id, value: g.id }, g.name);
                })
              );
              var curGroup = null;
              for (var gi = 0; gi < models.length; gi++) { if (models[gi].id === draft.modelProvider) { curGroup = models[gi]; break; } }
              var mSel = react.createElement("select", {
                className: "xchat-set-sel",
                value: draft.modelId,
                onChange: function (ev) { var d = Object.assign({}, draft); d.modelId = ev.target.value; setDraft(d); }
              },
                react.createElement("option", { value: "" }, "选择模型…"),
                (curGroup ? curGroup.models : []).map(function (m) {
                  return react.createElement("option", { key: m.id, value: m.id }, m.name);
                })
              );
              kids.push(row("Provider", "指定模型所属的 provider", pSel));
              kids.push(row("模型", "子代理回复使用的模型", mSel));
            }
            kids.push(row("等待回复超时(ms)", "子代理回复的最大等待时间", react.createElement("input", {
              type: "number",
              className: "xchat-set-input",
              value: draft.waitTimeoutMs,
              onChange: function (ev) { var d = Object.assign({}, draft); d.waitTimeoutMs = Number(ev.target.value) || 240000; setDraft(d); }
            })));
            kids.push(react.createElement("div", { className: "xchat-set-row" },
              react.createElement("button", { className: "xchat-set-btn", onClick: save }, "保存"),
              saved ? react.createElement("span", { className: "xchat-set-desc" }, saved) : null
            ));
            body = react.createElement("div", { className: "xchat-set" }, kids);
          }
          return body;
        }
        slots.inject("settings.section", function () {
          return slots.register(
            { name: "settings.section", id: "xchat", order: 25, label: "XChat" },
            function (props) { return react.createElement(XChatSettings, { remote: remoteXchat, close: props.close }); }
          );
        });
      }
      return unmount;
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
