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

    var CSS = `
.xchat-atmenu{position:fixed;z-index:1000;background:var(--dsw-specific-menu,#ffffff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-inverted,rgba(0,0,0,0.12));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,0.18));max-height:280px;overflow-y:auto;min-width:240px;max-width:480px;padding:4px;font-size:13px;line-height:20px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.xchat-atmenu-item{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;background:none;border:none;border-radius:10px;cursor:pointer;text-align:left;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}
.xchat-atmenu-item:hover,.xchat-atmenu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.15));outline:none}
.xchat-atmenu-label{flex:none;font-weight:500}
.xchat-atmenu-desc{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#888)}
.xchat-atmenu-muted{padding:8px 10px;color:var(--dsw-alias-label-tertiary,#888)}
`;
    var CSS_ID = "dsh-xchat/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var inject = ["slots", "sessions", "inputTriggers"];

    function apply(ctx) {
      var slots = ctx.get("slots");
      var sessions = ctx.get("sessions");
      var inputTriggers = ctx.get("inputTriggers");

      function listRows(query) {
        if (!sessions) return Promise.resolve([]);
        var list = sessions.list.getSnapshot();
        var current = list.current;
        var q = String(query || "").toLowerCase();
        return Promise.resolve(
          Object.values(list.byId)
            .filter(function (s) { return !s.blank && s.id !== current; })
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
            var ok = true;
            try {
              document.addEventListener("input", onInput, true);
              document.addEventListener("keydown", onKeyDown, true);
              document.addEventListener("pointerdown", onPointerDown, true);
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
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
