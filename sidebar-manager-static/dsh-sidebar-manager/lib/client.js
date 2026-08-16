// ============================================================================
// 侧栏会话管理器 — Client 半边(静态版 bundle)
// ----------------------------------------------------------------------------
// priority -1 注册 sidebar.workspaces 单槽位,影子替换官方 WorkspaceBrowser
// (最低 priority 渲染,官方注册保留 → 删 patch 行即还原)。
// 数据:useSessions/useWorkspaces + ctx.workspaces/ctx.sessions;
// 会话改名走 ctx.remote.sessman.rename(Typert remote,由 mount 包挂载,
// 本包 inject ["slots","remote","remote.sessman"],无自依赖死锁)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-sidebar-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var CSS = `
.sbm-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.sbm-head{flex:none;display:flex;align-items:center;gap:6px;padding:10px 8px 6px}
.sbm-title{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbm-search{flex:none;box-sizing:border-box;width:100%;margin:0 8px 6px;padding:5px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}
.sbm-search:focus{border-color:var(--dsw-alias-border-l2)}
.sbm-iconBtn{flex:none;width:26px;height:26px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.sbm-iconBtn:hover{background:var(--dsw-alias-bg-layer-2)}
.sbm-scroll{flex:1;overflow-y:auto;padding:2px 6px 10px}
.sbm-ws{margin-bottom:8px}
.sbm-wsHead{display:flex;align-items:center;gap:4px;height:26px;padding:0 6px;border-radius:6px;cursor:pointer}
.sbm-wsHead:hover{background:var(--dsw-alias-bg-layer-1)}
.sbm-wsTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:12px}
.sbm-wsCount{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sbm-row{display:flex;align-items:center;gap:5px;height:28px;padding:0 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.sbm-row:hover{background:var(--dsw-alias-bg-layer-2)}
.sbm-row.sbm-current{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.sbm-ic{flex:none;width:16px;text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sbm-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.sbm-dots{flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;line-height:1;opacity:0;display:inline-flex;align-items:center;justify-content:center}
.sbm-row:hover .sbm-dots,.sbm-wsHead:hover .sbm-dots,.sbm-dots.show{opacity:1}
.sbm-dots:hover{background:var(--dsw-alias-bg-layer-2)}
.sbm-section{font-size:10px;color:var(--dsw-alias-label-secondary);padding:6px 8px 2px;letter-spacing:.04em}
.sbm-empty{font-size:11px;color:var(--dsw-alias-label-secondary);padding:10px 12px;text-align:center}
.sbm-menu{position:fixed;z-index:2600;pointer-events:auto;min-width:168px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:4px;color:var(--dsw-alias-label-primary);font-size:12px}
.sbm-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.sbm-mi:hover{background:var(--dsw-alias-bg-layer-2)}
.sbm-toast{position:fixed;right:14px;bottom:18px;z-index:2700;pointer-events:none;background:rgba(0,0,0,.82);color:#fff;font-size:12px;padding:7px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:60vw;font-family:Inter,var(--dsw-font-family)}
.sbm-rail{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px}
.sbm-railBtn{width:34px;height:34px;border:none;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
.sbm-railBtn:hover{background:var(--dsw-alias-bg-layer-2)}
`;

    var CSS_ID = "dsh-sidebar-manager/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-sidebar-manager";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var inject = ["slots", "remote", "remote.sessman"];

    function apply(ctx) {
      function ShadowBrowser(props) {
        var useSessions = props.useSessions;
        var useWorkspaces = props.useWorkspaces;
        var wide = props.wide !== false;
        var wsSnap = useWorkspaces(function (s) { return s; });
        var sSnap = useSessions(function (s) { return s; });
        var workspaces = ctx.get('workspaces');
        var sessions = ctx.get('sessions');

        var menuState = react.useState(null);
        var menu = menuState[0];
        var setMenu = menuState[1];
        var toastState = react.useState(null);
        var toast = toastState[0];
        var setToast = toastState[1];
        var queryState = react.useState('');
        var query = queryState[0];
        var setQuery = queryState[1];
        var searchingState = react.useState(false);
        var searching = searchingState[0];
        var setSearching = searchingState[1];
        var hitsState = react.useState(null);
        var hits = hitsState[0];
        var setHits = hitsState[1];

        function showToast(t) {
          setToast(t);
          window.setTimeout(function () { setToast(null); }, 2200);
        }

        var byId = (sSnap && sSnap.byId) || {};
        var archived = new Set((wsSnap && wsSnap.archivedSessionIds) || []);
        var items = (wsSnap && wsSnap.items) || [];
        var current = sSnap && sSnap.current;

        react.useEffect(function () {
          if (!menu) return;
          function onDown(ev) {
            if (ev.target && ev.target.closest && ev.target.closest('.sbm-menu')) return;
            setMenu(null);
          }
          function onKey(ev) { if (ev.key === 'Escape') setMenu(null); }
          document.addEventListener('mousedown', onDown, true);
          document.addEventListener('keydown', onKey);
          return function () {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
          };
        }, [menu]);

        function openMenu(e, kind, id) {
          e.stopPropagation();
          var r = e.currentTarget.getBoundingClientRect();
          setMenu({ kind: kind, id: id, x: Math.min(r.right, window.innerWidth - 176), y: r.bottom + 4 });
        }

        function actOpen(id) { if (sessions) sessions.open(id); setMenu(null); }
        async function actFork(id) {
          try {
            var child = await sessions.fork({ sessionId: id });
            sessions.open(child);
            showToast('已分叉为新会话');
          } catch (e) { showToast('分叉失败'); }
          setMenu(null);
        }
        function actRename(kind, id) {
          var cur = kind === 'ws'
            ? (((items.find(function (w) { return w.workspaceId === id; }) || {}).title) || '')
            : ((byId[id] && byId[id].displayTitle) || (byId[id] && byId[id].title) || '');
          var next = window.prompt('新名称', cur);
          if (!next || !next.trim()) { setMenu(null); return; }
          var t = next.trim();
          if (kind === 'ws') {
            workspaces.rename(id, t).then(function () { showToast('已改名'); }).catch(function () { showToast('改名失败'); });
          } else {
            var p = ctx.remote.sessman.rename({ sessionId: id, title: t });
            if (p && typeof p.then === 'function') {
              p.then(function (r) {
                var res = r && r.ok ? r.value : null;
                showToast(res ? '已改名' : ((r && r.error && (r.error.message || r.error.code)) || '改名失败'));
              }, function () { showToast('改名失败'); });
            } else {
              showToast('改名失败');
            }
          }
          setMenu(null);
        }
        function actArchive(id) {
          workspaces.archiveSession(id).then(function () { showToast('已归档'); }).catch(function () { showToast('归档失败'); });
          setMenu(null);
        }
        function actOpenPath(id) {
          var s = byId[id];
          if (s && s.cwd && workspaces) workspaces.openPath(s.cwd).catch(function () {});
          setMenu(null);
        }
        function actNewSession(wsId) { workspaces.startSession(wsId || undefined); setMenu(null); }
        function actMoveWs(id, dir) {
          var idx = items.findIndex(function (w) { return w.workspaceId === id; });
          var target = dir < 0 ? items[idx - 1] : items[idx + 1];
          workspaces.insertBefore(id, target ? target.workspaceId : undefined)
            .then(function () {}).catch(function () { showToast('移动失败'); });
          setMenu(null);
        }
        function actMoveSession(id, dir) {
          var ws = items.find(function (w) { return (w.sessionIds || []).indexOf(id) >= 0; });
          if (!ws) { setMenu(null); return; }
          var ids = ws.sessionIds;
          var idx = ids.indexOf(id);
          var anchor = dir < 0 ? ids[idx - 1] : ids[idx + 1];
          workspaces.insertSessionBefore(ws.workspaceId, id, anchor)
            .then(function () {}).catch(function () { showToast('移动失败'); });
          setMenu(null);
        }
        async function actDeleteWs(id) {
          if (window.confirm('删除该工作区注册？（目录与会话日志保留，会话将变为未分组）')) {
            try { await workspaces.delete(id); showToast('已删除注册'); } catch (e) { showToast('删除失败'); }
          }
          setMenu(null);
        }
        async function actNewWorkspace() {
          try {
            var p = await workspaces.pickDirectory();
            if (p) {
              await workspaces.create({ path: p });
              showToast('已添加工作区');
            }
          } catch (e) { showToast('添加失败'); }
        }
        async function doSearch() {
          var q = (query || '').trim();
          if (!q) { setHits(null); return; }
          if (!sessions) return;
          setSearching(true);
          try {
            var r = await sessions.search(q, new AbortController().signal);
            setHits(r && r.ok ? r.items : []);
          } catch (e) { setHits([]); }
          setSearching(false);
        }

        if (!wide) {
          return react.createElement('div', { className: 'sbm-rail' },
            react.createElement('button', { className: 'sbm-railBtn', title: '展开侧栏', onClick: props.expandSidebar }, '🗂'),
            items.map(function (w) {
              return react.createElement('button', {
                key: w.workspaceId,
                className: 'sbm-railBtn',
                title: w.title || w.path,
                onClick: props.expandSidebar,
              }, (w.title || '?').slice(0, 1).toUpperCase());
            })
          );
        }

        function sessionRow(id) {
          var s = byId[id];
          if (!s) return null;
          var title = s.displayTitle || s.title || id.slice(0, 8);
          return react.createElement('div', {
            key: id,
            className: 'sbm-row' + (id === current ? ' sbm-current' : ''),
            onClick: function () { actOpen(id); },
            title: s.cwd || '',
          },
            react.createElement('span', { className: 'sbm-ic' }, s.running ? '●' : (s.blank ? '○' : '💬')),
            react.createElement('span', { className: 'sbm-name' }, title),
            react.createElement('button', { className: 'sbm-dots' + (menu && menu.id === id && menu.kind === 'sess' ? ' show' : ''), onClick: function (e) { openMenu(e, 'sess', id); } }, '⋯')
          );
        }

        var body = null;
        if (hits !== null) {
          body = react.createElement(react.Fragment, null,
            react.createElement('div', { className: 'sbm-section' }, '搜索结果' + (searching ? '…' : ' (' + hits.length + ')')),
            hits.length === 0
              ? react.createElement('div', { className: 'sbm-empty' }, searching ? '搜索中…' : '无结果')
              : hits.map(function (h) {
                var s = byId[h.sessionId];
                return react.createElement('div', {
                  key: h.sessionId,
                  className: 'sbm-row',
                  onClick: function () { actOpen(h.sessionId); },
                  title: h.sessionId,
                },
                  react.createElement('span', { className: 'sbm-ic' }, '🔎'),
                  react.createElement('span', { className: 'sbm-name' }, (s && (s.displayTitle || s.title)) || h.sessionId.slice(0, 10))
                );
              })
          );
        } else if (items.length === 0 && Object.keys(byId).length === 0) {
          body = react.createElement('div', { className: 'sbm-empty' }, '暂无会话，点右上角 ⊕ 添加工作区');
        } else {
          body = react.createElement(react.Fragment, null,
            items.map(function (w) {
              var rows = (w.sessionIds || []).filter(function (id) { return !archived.has(id); }).map(sessionRow);
              return react.createElement('div', { key: w.workspaceId, className: 'sbm-ws' },
                react.createElement('div', { className: 'sbm-wsHead', onClick: function () { actNewSession(w.workspaceId); } },
                  react.createElement('span', { className: 'sbm-wsTitle' }, w.title || w.path),
                  react.createElement('span', { className: 'sbm-wsCount' }, rows.length),
                  react.createElement('button', { className: 'sbm-dots' + (menu && menu.id === w.workspaceId && menu.kind === 'ws' ? ' show' : ''), onClick: function (e) { openMenu(e, 'ws', w.workspaceId); } }, '⋯')
                ),
                rows
              );
            }),
            (function () {
              var wsIds = new Set();
              items.forEach(function (w) { (w.sessionIds || []).forEach(function (id) { wsIds.add(id); }); });
              var ungrouped = Object.keys(byId).filter(function (id) { return !wsIds.has(id) && !archived.has(id); });
              if (ungrouped.length === 0) return null;
              return react.createElement('div', { className: 'sbm-ws' },
                react.createElement('div', { className: 'sbm-wsHead' },
                  react.createElement('span', { className: 'sbm-wsTitle' }, '未分组'),
                  react.createElement('span', { className: 'sbm-wsCount' }, ungrouped.length)
                ),
                ungrouped.map(sessionRow)
              );
            })()
          );
        }

        var menuItems = [];
        if (menu) {
          if (menu.kind === 'sess') {
            menuItems.push({ t: '打开', fn: function () { actOpen(menu.id); } });
            menuItems.push({ t: '改名…', fn: function () { actRename('sess', menu.id); } });
            menuItems.push({ t: '归档', fn: function () { actArchive(menu.id); } });
            menuItems.push({ t: '分叉为新会话', fn: function () { actFork(menu.id); } });
            if (items.some(function (w) { return (w.sessionIds || []).indexOf(menu.id) >= 0; })) {
              menuItems.push({ t: '上移', fn: function () { actMoveSession(menu.id, -1); } });
              menuItems.push({ t: '下移', fn: function () { actMoveSession(menu.id, 1); } });
            }
            var s = byId[menu.id];
            if (s && s.cwd) menuItems.push({ t: '在文件管理器中打开', fn: function () { actOpenPath(menu.id); } });
          } else if (menu.kind === 'ws') {
            menuItems.push({ t: '改名…', fn: function () { actRename('ws', menu.id); } });
            menuItems.push({ t: '新建会话', fn: function () { actNewSession(menu.id); } });
            menuItems.push({ t: '上移', fn: function () { actMoveWs(menu.id, -1); } });
            menuItems.push({ t: '下移', fn: function () { actMoveWs(menu.id, 1); } });
            menuItems.push({ t: '删除注册…', fn: function () { actDeleteWs(menu.id); } });
          }
        }

        return react.createElement(react.Fragment, null,
          react.createElement('div', { className: 'sbm-root' },
            react.createElement('div', { className: 'sbm-head' },
              react.createElement('span', { className: 'sbm-title' }, '工作区'),
              react.createElement('button', { className: 'sbm-iconBtn', title: '新建工作区', onClick: actNewWorkspace }, '⊕')
            ),
            react.createElement('input', {
              className: 'sbm-search',
              placeholder: '搜索会话内容…',
              value: query,
              onChange: function (e) { setQuery(e.target.value); if (!e.target.value.trim()) setHits(null); },
              onKeyDown: function (e) { if (e.key === 'Enter') doSearch(); },
            }),
            react.createElement('div', { className: 'sbm-scroll' }, body)
          ),
          menu ? react.createElement('div', { className: 'sbm-menu', style: { left: menu.x, top: menu.y } },
            menuItems.map(function (mi) { return react.createElement('div', { key: mi.t, className: 'sbm-mi', onClick: mi.fn }, mi.t); })
          ) : null,
          toast ? react.createElement('div', { className: 'sbm-toast' }, toast) : null
        );
      }

      ctx.slots.inject("sidebar.workspaces", function () {
        return ctx.slots.register(
          { name: "sidebar.workspaces", priority: -1 },
          function (props) {
            return react.createElement(ShadowBrowser, {
              useSessions: props.useSessions,
              useWorkspaces: props.useWorkspaces,
              wide: props.wide,
              expandSidebar: props.expandSidebar,
            });
          });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
