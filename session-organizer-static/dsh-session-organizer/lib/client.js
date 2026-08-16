// ============================================================================
// 会话侧边栏组织器 — Client 半边(静态版 bundle)
// ----------------------------------------------------------------------------
// priority -2 注册 sidebar.workspaces 单槽位,影子替换官方 WorkspaceBrowser
// (最低 priority 渲染,官方注册保留 → 删 patch 行即还原)。
// 功能(与动态版 v12 等价):
//   - 层级:工作区 → [用户分组 → 会话] + 散列会话;分组 <2 会话自动解散;
//   - 拖拽会话到另一会话中间带 → 建组(仅当双方都不在分组内);
//     拖到上/下缘 → 蓝色插入线,松手插入(同账户=排序,跨账户=移动);
//     拖到分组头 → 加入该分组;
//   - 图标:💬 普通会话 / 👔 agent-teams 队长 / 👷 成员 / 🔧 其他子代理,
//     工作区 📂,分组为按 id 着色的圆点(尺寸随成员数增长);
//   - 状态点:绿=运行中,黄=等待用户;会话三点菜单:重命名/复制/归档(无文件管理器项);
//   - 分组与顺序经 ctx.remote.organizer.load/save 持久化(由 mount 包挂载,
//     本包 inject ["slots","remote","remote.organizer"],无自依赖死锁)。
// 注意:组件定义在 apply 内部闭包捕获 ctx(模块顶层没有 ctx)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-session-organizer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var CSS = `
.sorg-root{height:100%;min-height:0;flex-direction:column;display:flex;font-size:14px;color:var(--dsw-alias-label-primary)}
.sorg-head{box-sizing:border-box;flex:none;align-items:center;gap:6px;height:38px;padding:0 10px;display:flex}
.sorg-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.sorg-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.sorg-list{min-height:0;flex-direction:column;flex:1;padding:0 6px 8px;overflow-y:auto;display:flex;gap:1px}
.sorg-grp{flex-direction:column;display:flex}
.sorg-sub{padding-left:14px;flex-direction:column;display:flex}
.sorg-row{box-sizing:border-box;position:relative;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;align-items:center;gap:5px;padding:0 8px;display:flex;user-select:none}
.sorg-row:hover,.sorg-row.sorg-sel{background:var(--dsw-alias-interactive-bg-hover)}
.sorg-row.sorg-ghost{opacity:.45}
.sorg-row.sorg-dropOn{box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary) inset;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.sorg-row.sorg-dropGroup{box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary) inset;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 20%,transparent)}
.sorg-line{position:absolute;left:4px;right:4px;height:2px;border-radius:2px;background:var(--dsw-alias-state-business-primary);z-index:3;pointer-events:none}
.sorg-line-top{top:-2px}
.sorg-line-bottom{bottom:-2px}
.sorg-dot{flex:none;border-radius:50%;background:var(--sorg-dot-color,#4a90d9)}
.sorg-dot-run{width:8px;height:8px;flex:none;border-radius:50%;background:#22c55e;margin-left:2px}
.sorg-dot-wait{width:8px;height:8px;flex:none;border-radius:50%;background:#eab308;margin-left:2px}
.sorg-child{color:var(--dsw-alias-label-secondary)}
.sorg-caret{width:14px;flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);text-align:center;display:inline-flex;justify-content:center}
.sorg-ico{width:16px;flex:none;font-size:13px;color:var(--dsw-alias-label-tertiary);text-align:center;display:inline-flex;justify-content:center}
.sorg-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sorg-title-sm{font-size:12px;margin-left:4px}
.sorg-time{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.sorg-dots{flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;opacity:0;display:flex;align-items:center;justify-content:center}
.sorg-row:hover .sorg-dots,.sorg-dots.sorg-show{opacity:1}
.sorg-dots:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-menu{position:fixed;z-index:2100;min-width:160px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:4px;color:var(--dsw-alias-label-primary);font-size:12px}
.sorg-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.sorg-mi:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-mi.sorg-danger{color:var(--dsw-alias-text-danger,#e5484d)}
.sorg-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:14px 0}
.sorg-mask{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center}
.sorg-modal{width:min(360px,86vw);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:14px;color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column;gap:10px}
.sorg-modal-title{font-size:14px;font-weight:600}
.sorg-input{box-sizing:border-box;width:100%;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit}
.sorg-input:focus{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}
.sorg-modal-actions{display:flex;justify-content:flex-end;gap:8px}
.sorg-btn{height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);cursor:pointer;padding:0 14px;font:inherit;font-size:12px}
.sorg-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-btn.sorg-primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
.sorg-btn:disabled{opacity:.5;cursor:default}
.sorg-rail{width:100%;height:100%;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);display:flex;font-size:18px;cursor:pointer}
`;

    var CSS_ID = "dsh-session-organizer/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-session-organizer";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // 注:静态客户端 ctx 是代理,未声明即访问会抛错(§4.2)——服务必须按官方
    // ui-workspace 模式在 inject 里声明点号路径,再用属性访问 ctx.sessions /
    // ctx.workspaces(不能用 ctx.get('sessions'),那会触发守卫导致 apply 崩溃)。
    // remote.organizer 由 mount 包先挂出。
    var inject = ["slots", "remote", "remote.organizer", "sessions", "workspaces"];

    function apply(ctx) {
      var sessionsService = ctx.sessions;
      var workspacesService = ctx.workspaces;

      var CHAT_ICON = '\u{1F4AC}'; // 💬 speech bubble — ordinary conversations
      var LEADER_ICON = '\u{1F454}'; // 👔 necktie — agent-teams captain (main session)
      var WORKER_ICON = '\u{1F477}'; // 👷 worker — agent-teams member subagent
      var SUBAGENT_ICON = '\u{1F527}'; // 🔧 wrench — generic (non team) subagent child
      var WORKSPACE_ICON = '\u{1F4C2}'; // open folder 📂
      var NEW_GROUP_NAME = '新建分组';

      function groupColor(id) {
        var h = 0;
        for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        return 'hsl(' + (h % 360) + ', 70%, 55%)';
      }
      function groupSize(count) { return Math.min(20, 8 + Math.min(count, 8) * 1.5); }

      // ---- persisted view state (groups nested under a workspace + per-account order) ----
      var persisted = { groups: [], order: {} };
      function loadState() {
        var p = null;
        try {
          p = ctx.remote.organizer.load({});
        } catch (e) { p = null; }
        if (p && typeof p.then === 'function') {
          return p.then(function (r) {
            var res = r && r.ok ? r.value : null;
            if (res && typeof res === 'object' && Array.isArray(res.groups)) {
              persisted = {
                groups: res.groups.filter(function (g) { return g && typeof g.workspaceId === 'string'; }),
                order: res.order || {},
              };
            }
          }, function () { /* first run: no state yet */ });
        }
        return Promise.resolve();
      }
      function saveState(next) {
        persisted = next;
        var p = null;
        try {
          p = ctx.remote.organizer.save({ state: next });
        } catch (e) { p = null; }
        if (p && typeof p.then === 'function') {
          p.then(function () {}, function () {});
        }
      }

      // ---- small primitives ----
      function Menu(props) {
        var items = props.items, onPick = props.onPick, onClose = props.onClose, x = props.x, y = props.y;
        return react.createElement('div', {
          className: 'sorg-menu',
          style: { left: x, top: y },
          onClick: function (e) { e.stopPropagation(); },
          onMouseLeave: onClose,
        }, items.map(function (item) {
          return react.createElement('div', {
            key: item.id,
            className: 'sorg-mi' + (item.danger ? ' sorg-danger' : ''),
            onClick: function () { onClose(); onPick(item.id); },
          }, item.label);
        }));
      }

      function Modal(props) {
        var title = props.title, children = props.children, footer = props.footer;
        return react.createElement('div', {
          className: 'sorg-mask',
          onClick: function (e) { if (e.target === e.currentTarget) footer.cancel(); },
        }, react.createElement('div', { className: 'sorg-modal' },
          react.createElement('div', { className: 'sorg-modal-title' }, title),
          children,
          react.createElement('div', { className: 'sorg-modal-actions' },
            react.createElement('button', { type: 'button', className: 'sorg-btn', onClick: footer.cancel }, '取消'),
            footer.confirm)));
      }

      // ---- main browser ----
      function Browser(props) {
        var wide = props.wide, expandSidebar = props.expandSidebar;
        var useSessions = props.useSessions, useWorkspaces = props.useWorkspaces;
        var list = useSessions(function (s) { return s; });
        var wsState = useWorkspaces(function (s) { return s; });

        var groupsState = react.useState(persisted.groups);
        var groups = groupsState[0], setGroups = groupsState[1];
        var orderState = react.useState(persisted.order);
        var order = orderState[0], setOrder = orderState[1];
        var menuState = react.useState(null); // { kind, x, y, id }
        var menu = menuState[0], setMenu = menuState[1];
        var modalState = react.useState(null); // { kind, payload }
        var modal = modalState[0], setModal = modalState[1];
        var draftState = react.useState('');
        var draft = draftState[0], setDraft = draftState[1];
        var dragState = react.useState(null); // { sessionId, fromKey, over: {id, half} }
        var drag = dragState[0], setDrag = dragState[1];
        var dragOverGroupState = react.useState(null); // group id highlight
        var dragOverGroup = dragOverGroupState[0], setDragOverGroup = dragOverGroupState[1];

        react.useEffect(function () {
          loadState().then(function () {
            setGroups(persisted.groups || []);
            setOrder(persisted.order || {});
          });
        }, []);

        // close menu when clicking anywhere outside it
        react.useEffect(function () {
          if (menu === null) return;
          var onDocClick = function () { setMenu(null); };
          document.addEventListener('click', onDocClick);
          return function () { document.removeEventListener('click', onDocClick); };
        }, [menu]);

        function persist(nextGroups, nextOrder) {
          setGroups(nextGroups);
          setOrder(nextOrder);
          saveState({ groups: nextGroups, order: nextOrder });
        }

        var current = list && list.current;
        var archived = new Set((wsState && wsState.archivedSessionIds) || []);
        var workspaces = (wsState && wsState.items) || [];
        var byId = (list && list.byId) || {};

        // sessionId → workspaceId (first workspace wins)
        var workspaceOf = {};
        for (var wi = 0; wi < workspaces.length; wi++) {
          var ws0 = workspaces[wi];
          for (var si0 = 0; si0 < ws0.sessionIds.length; si0++) {
            var id0 = ws0.sessionIds[si0];
            if (workspaceOf[id0] === undefined) workspaceOf[id0] = ws0.workspaceId;
          }
        }

        function visible(id) {
          var s = byId[id];
          if (!s) return false;
          if (s.origin === 'subagent') return false;
          if (archived.has(id)) return false;
          if (s.blank && id !== current) return false;
          return true;
        }
        function titleOf(id) {
          var s = byId[id];
          if (!s) return id;
          return s.blank ? '新会话' : (s.displayTitle || id);
        }
        function timeOf(id) {
          var s = byId[id];
          if (!s || !s.updatedAt) return '';
          var diff = Date.now() - s.updatedAt;
          var m = Math.floor(diff / 6e4);
          if (m < 1) return '现在';
          if (m < 60) return m + '分';
          if (m < 1440) return Math.floor(m / 60) + '时';
          return Math.floor(m / 1440) + '天';
        }

        var expandedState = react.useState({});
        var expanded = expandedState[0], setExpanded = expandedState[1];
        function toggleExpanded(key) {
          setExpanded(function (e) {
            var next = Object.assign({}, e);
            next[key] = !e[key];
            if (key.slice(0, 2) === 'g:') {
              var gid = key.slice(2);
              persist(groups.map(function (g) { return g.id === gid ? Object.assign({}, g, { expanded: next[key] }) : g; }), order);
            }
            return next;
          });
        }
        function isExpanded(key) { return expanded[key] !== false; }

        // account key a session currently lives in: 'g:<id>' (user group) |
        // 'w:<wsId>' (workspace loose) | '' (ungrouped)
        var accountOf = {};
        for (var gi = 0; gi < groups.length; gi++) {
          var g0 = groups[gi];
          for (var si1 = 0; si1 < g0.sessionIds.length; si1++) accountOf[g0.sessionIds[si1]] = 'g:' + g0.id;
        }
        for (var wi2 = 0; wi2 < workspaces.length; wi2++) {
          var ws2 = workspaces[wi2];
          for (var si2 = 0; si2 < ws2.sessionIds.length; si2++) {
            var id2 = ws2.sessionIds[si2];
            if (accountOf[id2] === undefined) accountOf[id2] = 'w:' + ws2.workspaceId;
          }
        }

        // sessions that live in some user group
        var groupedMembers = new Set();
        for (var gi3 = 0; gi3 < groups.length; gi3++) {
          var g3 = groups[gi3];
          for (var si3 = 0; si3 < g3.sessionIds.length; si3++) groupedMembers.add(g3.sessionIds[si3]);
        }

        // parent → direct subagent children. Primary source: the runtime's own
        // per-parent subagent catalog (subagentsByParent), which tracks children
        // with their durable labels; fallback: index byId summaries by parentId,
        // gated on origin === 'subagent' so forks never appear as children.
        var childrenOf = {};
        var childLabels = {};
        var catalog = (list && list.subagentsByParent) || {};
        for (var parentId of Object.keys(catalog)) {
          var c = catalog[parentId];
          var entries = (c && Array.isArray(c.entries) ? c.entries : []);
          var kids = entries.filter(function (e) { return e && e.kind === 'child' && typeof e.id === 'string'; }).map(function (e) { return e.id; });
          if (kids.length > 0) childrenOf[parentId] = kids;
          for (var ei = 0; ei < entries.length; ei++) {
            var e0 = entries[ei];
            if (e0 && e0.kind === 'child' && typeof e0.id === 'string' && typeof e0.label === 'string' && e0.label !== '') {
              childLabels[e0.id] = e0.label;
            }
          }
        }
        for (var id3 of Object.keys(byId)) {
          var s3 = byId[id3];
          if (s3 && s3.origin === 'subagent' && s3.parentId && byId[s3.parentId] !== undefined) {
            var bucket = childrenOf[s3.parentId] || (childrenOf[s3.parentId] = []);
            if (bucket.indexOf(id3) === -1) bucket.push(id3);
          }
        }
        for (var ck of Object.keys(childrenOf)) {
          childrenOf[ck].sort(function (a, b) { return (byId[a].createdAt || 0) - (byId[b].createdAt || 0); });
        }
        // subagent label → display name: strip the 'agent-teams:' prefix so a
        // member shows as its member name; other labels pass through verbatim.
        function isAgentTeamsChild(cid) {
          var raw = childLabels[cid];
          return raw !== undefined && raw.slice(0, 12) === 'agent-teams:';
        }
        var agentTeamsParents = new Set();
        for (var p2 of Object.keys(childrenOf)) {
          if (childrenOf[p2].some(isAgentTeamsChild)) agentTeamsParents.add(p2);
        }
        function childName(cid) {
          var raw = childLabels[cid];
          if (raw !== undefined) {
            var idx = raw.indexOf(':');
            var prefix = idx === -1 ? raw : raw.slice(0, idx);
            if (prefix === 'agent-teams') {
              var parts = raw.split(':');
              return parts[parts.length - 1] || raw;
            }
            return raw;
          }
          return titleOf(cid);
        }

        // ---- persistence helpers ----
        function sweepGroups(gs, ord) {
          var kept = [];
          var nextOrder = Object.assign({}, ord);
          for (var i = 0; i < gs.length; i++) {
            var g = gs[i];
            var alive = g.sessionIds.filter(function (id) { return byId[id] !== undefined && visible(id); });
            if (alive.length < 2) {
              delete nextOrder['g:' + g.id];
              continue;
            }
            if (alive.length !== g.sessionIds.length) g.sessionIds = alive;
            kept.push(g);
          }
          return { groups: kept, order: nextOrder };
        }

        function orderedIn(key, members) {
          if (order[key] === undefined) return members;
          var listed = order[key].filter(function (id) { return members.indexOf(id) !== -1; });
          return listed.concat(members.filter(function (id) { return listed.indexOf(id) === -1; }));
        }

        // ---- mutations ----
        function createGroup(draggedId, targetId) {
          var draggedWs = workspaceOf[draggedId];
          var targetWs = workspaceOf[targetId];
          if (draggedId === targetId || draggedWs === undefined || targetWs !== draggedWs) return;
          var id = 'g' + Date.now();
          var nextGroups = groups.filter(function (g) { return g.sessionIds.indexOf(draggedId) === -1 && g.sessionIds.indexOf(targetId) === -1; });
          nextGroups.push({ id: id, name: NEW_GROUP_NAME, workspaceId: draggedWs, sessionIds: [draggedId, targetId], expanded: true });
          var nextOrder = Object.assign({}, order);
          nextOrder['g:' + id] = [draggedId, targetId];
          var swept = sweepGroups(nextGroups, nextOrder);
          persist(swept.groups, swept.order);
        }

        function moveSession(sessionId, toKey, anchor) {
          var srcWs = workspaceOf[sessionId];
          var allowed = true;
          if (toKey.slice(0, 2) === 'g:') {
            var g = groups.find(function (gg) { return gg.id === toKey.slice(2); });
            allowed = g !== undefined && g.workspaceId === srcWs;
          } else if (toKey.slice(0, 2) === 'w:') {
            allowed = toKey.slice(2) === srcWs;
          } else {
            allowed = srcWs === undefined;
          }
          if (!allowed) return;
          var nextGroups = groups;
          var nextOrder = Object.assign({}, order);
          var fromKey = accountOf[sessionId];
          if (fromKey !== undefined && fromKey.slice(0, 2) === 'g:') {
            var gid = fromKey.slice(2);
            nextGroups = groups.map(function (gx) {
              return gx.id === gid ? Object.assign({}, gx, { sessionIds: gx.sessionIds.filter(function (id) { return id !== sessionId; }) }) : gx;
            });
            if (nextOrder[fromKey] !== undefined) nextOrder[fromKey] = nextOrder[fromKey].filter(function (id) { return id !== sessionId; });
          } else if (fromKey !== undefined && nextOrder[fromKey] !== undefined) {
            nextOrder[fromKey] = nextOrder[fromKey].filter(function (id) { return id !== sessionId; });
          }
          if (toKey.slice(0, 2) === 'g:') {
            var gid2 = toKey.slice(2);
            nextGroups = nextGroups.map(function (gy) {
              return gy.id === gid2 && gy.sessionIds.indexOf(sessionId) === -1
                ? Object.assign({}, gy, { sessionIds: gy.sessionIds.concat([sessionId]) }) : gy;
            });
          }
          function membersOf(key) {
            if (key.slice(0, 2) === 'g:') {
              var gg = nextGroups.find(function (gz) { return gz.id === key.slice(2); });
              return gg ? gg.sessionIds.filter(function (id) { return byId[id] !== undefined && visible(id); }) : [];
            }
            if (key.slice(0, 2) === 'w:') {
              var ww = workspaces.find(function (wx) { return wx.workspaceId === key.slice(2); });
              return ww ? ww.sessionIds.filter(function (id) {
                return byId[id] !== undefined && visible(id) && !groupedMembers.has(id);
              }) : [];
            }
            return (list && list.ids || []).filter(function (id) {
              return byId[id] !== undefined && visible(id) && accountOf[id] === undefined;
            });
          }
          var members = membersOf(toKey);
          var without = members.filter(function (id) { return id !== sessionId; });
          var anchorIndex = anchor === undefined ? without.length : without.indexOf(anchor);
          without.splice(anchorIndex === -1 ? without.length : anchorIndex, 0, sessionId);
          nextOrder[toKey] = without;
          var swept = sweepGroups(nextGroups, nextOrder);
          persist(swept.groups, swept.order);
          if (toKey.slice(0, 2) === 'w:' && workspacesService) {
            workspacesService.insertSessionBefore(toKey.slice(2), sessionId, anchor).then(function () {}, function () {});
          }
        }

        function insertAt(key, sessionId, anchor) {
          if ((accountOf[sessionId] || '') === key) {
            // same-account reorder
            var members;
            if (key === '') {
              members = (list && list.ids || []).filter(function (id) {
                return byId[id] !== undefined && visible(id) && accountOf[id] === undefined;
              });
            } else if (key.slice(0, 2) === 'g:') {
              var gg = groups.find(function (gx) { return gx.id === key.slice(2); });
              members = (gg ? gg.sessionIds : []).filter(function (id) { return byId[id] !== undefined && visible(id); });
            } else {
              var ww = workspaces.find(function (wx) { return wx.workspaceId === key.slice(2); });
              members = (ww ? ww.sessionIds : []).filter(function (id) {
                return byId[id] !== undefined && visible(id) && !groupedMembers.has(id);
              });
            }
            var ids = order[key] !== undefined ? order[key].filter(function (id) { return members.indexOf(id) !== -1; }) : members;
            var without = ids.filter(function (id) { return id !== sessionId; });
            var anchorIndex = anchor === undefined ? without.length : without.indexOf(anchor);
            without.splice(anchorIndex === -1 ? without.length : anchorIndex, 0, sessionId);
            var nextOrder = Object.assign({}, order);
            nextOrder[key] = without;
            persist(groups, nextOrder);
            if (key.slice(0, 2) === 'w:' && workspacesService) {
              workspacesService.insertSessionBefore(key.slice(2), sessionId, anchor).then(function () {}, function () {});
            }
          } else {
            moveSession(sessionId, key, anchor);
          }
        }

        // ---- drag & drop ----
        function onRowDragStart(e, sessionId, key) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', sessionId);
          setDrag({ sessionId: sessionId, fromKey: key, over: null });
        }
        function onRowDragOver(e, sessionId) {
          if (!drag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          var rect = e.currentTarget.getBoundingClientRect();
          var ratio = (e.clientY - rect.top) / rect.height;
          var draggedAccount = accountOf[drag.sessionId] || '';
          var targetAccount = accountOf[sessionId] || '';
          var draggedInGroup = draggedAccount.slice(0, 2) === 'g:';
          var targetInGroup = targetAccount.slice(0, 2) === 'g:';
          var allowCenter = !draggedInGroup && !targetInGroup;
          var half = allowCenter
            ? (ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'center')
            : (ratio < 0.5 ? 'before' : 'after');
          setDrag(function (d) { return d ? Object.assign({}, d, { over: { id: sessionId, half: half } }) : d; });
        }
        function onRowDrop(e, targetId) {
          if (!drag) return;
          e.preventDefault();
          var half = drag.over && drag.over.id === targetId ? drag.over.half : null;
          setDrag(null);
          if (half === 'center') {
            createGroup(drag.sessionId, targetId);
            return;
          }
          if (half !== 'before' && half !== 'after') return;
          var toKey = accountOf[targetId] || '';
          insertAt(toKey, drag.sessionId, half === 'before' ? targetId : undefined);
        }
        function onGroupHeaderDrop(e, gid) {
          if (!drag) return;
          e.preventDefault();
          setDragOverGroup(null);
          setDrag(null);
          if (drag.sessionId === '') return;
          moveSession(drag.sessionId, 'g:' + gid, undefined);
        }
        function onRowDragEnd() {
          setDragOverGroup(null);
          setDrag(null);
        }

        // ---- actions ----
        function openSession(id) { if (sessionsService) sessionsService.open(id); }
        function renameSession(id) { setModal({ kind: 'session-rename', id: id, title: titleOf(id) }); setDraft(titleOf(id)); }
        function forkSession(id) {
          if (!sessionsService) return;
          sessionsService.fork({ sessionId: id, increaseTitle: true }).then(function (childId) {
            sessionsService.open(childId);
          }, function () {});
        }
        function archiveSession(id) {
          if (workspacesService) workspacesService.archiveSession(id).then(function () {}, function (e) { console.error('archive failed', e); });
        }
        function confirmRename() {
          var name = draft.trim();
          if (modal === null || name === '') return;
          if (modal.kind === 'session-rename') {
            var binding = sessionsService && sessionsService.binding(modal.id);
            if (binding && binding.session && typeof binding.session.rename === 'function') {
              binding.session.rename(name).then(function () { setModal(null); }, function (e) { console.error('rename failed', e); });
            } else setModal(null);
          } else if (modal.kind === 'group-rename') {
            persist(groups.map(function (g) { return g.id === modal.id ? Object.assign({}, g, { name: name }) : g; }), order);
            setModal(null);
          } else if (modal.kind === 'group-delete') {
            persist(groups.filter(function (g) { return g.id !== modal.id; }), order);
            setModal(null);
          }
        }

        function openMenuAt(e, menuArg) {
          e.stopPropagation();
          var r = e.currentTarget.getBoundingClientRect();
          setMenu(Object.assign({}, menuArg, { x: r.right, y: r.top }));
        }
        function groupMenu(e, g) {
          openMenuAt(e, {
            kind: 'group', id: g.id, items: [
              { id: 'rename', label: '重命名分组' },
              { id: 'delete', label: '删除分组', danger: true },
            ],
          });
        }
        function sessionMenu(e, id) {
          openMenuAt(e, {
            kind: 'session', id: id, items: [
              { id: 'rename', label: '重命名' },
              { id: 'fork', label: '复制会话' },
              { id: 'archive', label: '归档会话' },
            ],
          });
        }
        function onMenuPick(id) {
          var m = menu;
          if (!m) return;
          if (m.kind === 'group') {
            if (id === 'rename') { setModal({ kind: 'group-rename', id: m.id }); setDraft((groups.find(function (g) { return g.id === m.id; }) || {}).name || ''); }
            if (id === 'delete') { var found = groups.find(function (g) { return g.id === m.id; }) || {}; setModal({ kind: 'group-delete', id: m.id, name: found.name || '' }); }
          } else {
            if (id === 'rename') renameSession(m.id);
            if (id === 'fork') forkSession(m.id);
            if (id === 'archive') archiveSession(m.id);
          }
        }

        // ---- render helpers ----
        function childRow(cid) {
          return react.createElement('div', {
            key: cid,
            className: 'sorg-row sorg-title-sm sorg-child',
            onClick: function () { openSession(cid); },
            children: [
              react.createElement('span', { className: 'sorg-ico' }, isAgentTeamsChild(cid) ? WORKER_ICON : SUBAGENT_ICON),
              react.createElement('span', { className: 'sorg-name' }, childName(cid)),
              react.createElement('span', { className: 'sorg-time' }, timeOf(cid)),
            ],
          });
        }

        function row(key, id) {
          var marker = drag && drag.over && drag.over.id === id ? drag.over.half : null;
          var summary = byId[id];
          var waiting = summary !== undefined && summary.pendingInteraction !== undefined && summary.pendingInteraction !== null;
          var statusDot = waiting ? 'sorg-dot-wait' : (summary && summary.running ? 'sorg-dot-run' : null);
          var children = childrenOf[id] || [];
          var childKey = 's:' + id;
          var childOpen = expanded[childKey] === true;
          var rowEl = react.createElement('div', {
            className: 'sorg-row sorg-title-sm'
              + (id === current ? ' sorg-sel' : '')
              + (drag && drag.sessionId === id ? ' sorg-ghost' : '')
              + (marker === 'center' ? ' sorg-dropOn' : ''),
            draggable: true,
            onClick: function () { openSession(id); },
            onDragStart: function (e) { onRowDragStart(e, id, key); },
            onDragOver: function (e) { onRowDragOver(e, id); },
            onDrop: function (e) { onRowDrop(e, id); },
            onDragEnd: onRowDragEnd,
            children: [
              marker === 'before' && react.createElement('div', { key: 'ln', className: 'sorg-line sorg-line-top' }),
              marker === 'after' && react.createElement('div', { key: 'ln', className: 'sorg-line sorg-line-bottom' }),
              children.length > 0 && react.createElement('span', {
                key: 'cr',
                className: 'sorg-caret',
                onClick: function (e) { e.stopPropagation(); toggleExpanded(childKey); },
              }, childOpen ? '\u25BE' : '\u25B8'),
              statusDot !== null && react.createElement('span', { key: 'st', className: statusDot }),
              react.createElement('span', { className: 'sorg-ico' }, agentTeamsParents.has(id) ? LEADER_ICON : CHAT_ICON),
              react.createElement('span', { className: 'sorg-name' }, titleOf(id)),
              react.createElement('span', { className: 'sorg-time' }, timeOf(id)),
              react.createElement('button', { type: 'button', className: 'sorg-dots', onClick: function (e) { sessionMenu(e, id); } }, '\u22EF'),
            ],
          });
          return react.createElement('div', { key: id, className: 'sorg-grp' },
            rowEl,
            childOpen && react.createElement('div', { className: 'sorg-sub' }, children.map(childRow)),
          );
        }

        function userGroupNode(g) {
          var key = 'g:' + g.id;
          var sessions = orderedIn(key, g.sessionIds.filter(visible));
          var expandedNow = g.expanded !== false;
          var overGroup = drag && dragOverGroup === g.id;
          var dotSize = groupSize(sessions.length);
          return react.createElement('div', { key: key, className: 'sorg-grp' },
            react.createElement('div', {
              className: 'sorg-row' + (overGroup ? ' sorg-dropGroup' : ''),
              onClick: function () { toggleExpanded(key); },
              onDragOver: function (e) {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverGroup(g.id);
              },
              onDragLeave: function () { if (dragOverGroup === g.id) setDragOverGroup(null); },
              onDrop: function (e) { onGroupHeaderDrop(e, g.id); },
              onDragEnd: onRowDragEnd,
            },
              react.createElement('span', { className: 'sorg-caret' }, expandedNow ? '\u25BE' : '\u25B8'),
              react.createElement('span', {
                className: 'sorg-dot',
                style: { '--sorg-dot-color': groupColor(g.id), width: dotSize, height: dotSize },
              }),
              react.createElement('span', { className: 'sorg-name' }, g.name),
              react.createElement('span', { className: 'sorg-time' }, String(sessions.length)),
              react.createElement('button', { type: 'button', className: 'sorg-dots sorg-show', onClick: function (e) { groupMenu(e, g); } }, '\u22EF'),
            ),
            expandedNow && react.createElement('div', { className: 'sorg-sub' }, sessions.map(function (id) { return row(key, id); })),
          );
        }

        function workspaceNode(ws) {
          var key = 'w:' + ws.workspaceId;
          var wsGroups = groups.filter(function (g) { return g.workspaceId === ws.workspaceId; });
          var looseSessions = orderedIn(key, ws.sessionIds.filter(function (id) { return visible(id) && !groupedMembers.has(id); }));
          var expandedNow = isExpanded(key);
          return react.createElement('div', { key: key, className: 'sorg-grp' },
            react.createElement('div', { className: 'sorg-row', onClick: function () { toggleExpanded(key); } },
              react.createElement('span', { className: 'sorg-caret' }, expandedNow ? '\u25BE' : '\u25B8'),
              react.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
              react.createElement('span', { className: 'sorg-name' }, ws.title),
              react.createElement('span', { className: 'sorg-time' }, String(ws.sessionIds.filter(visible).length)),
            ),
            expandedNow && react.createElement('div', { className: 'sorg-sub' },
              wsGroups.map(userGroupNode),
              looseSessions.map(function (id) { return row(key, id); }),
            ),
          );
        }

        var accounted = new Set(Object.keys(accountOf));
        var stray = (list && list.ids || []).filter(function (id) {
          return byId[id] !== undefined && !accounted.has(id) && visible(id);
        });
        var ungroupedKey = '';
        var ungroupedSessions = orderedIn(ungroupedKey, stray);

        if (!wide) {
          return react.createElement('div', { className: 'sorg-rail', onClick: function () { expandSidebar(); } }, WORKSPACE_ICON);
        }

        var modalTitle = modal && (modal.kind === 'group-rename' ? '重命名分组' : modal.kind === 'group-delete' ? '删除分组' : '重命名会话');
        return react.createElement('div', { className: 'sorg-root' },
          react.createElement('div', { className: 'sorg-head' },
            react.createElement('span', { className: 'sorg-title' }, '会话'),
            react.createElement('span', { className: 'sorg-hint' }, '拖拽排序 · 放会话中间建组'),
          ),
          react.createElement('div', { className: 'sorg-list' },
            (workspaces.length === 0 && ungroupedSessions.length === 0 && groups.length === 0)
              && react.createElement('div', { className: 'sorg-empty' }, '暂无会话'),
            workspaces.map(workspaceNode),
            ungroupedSessions.length > 0 && react.createElement('div', { key: ungroupedKey, className: 'sorg-grp' },
              react.createElement('div', { className: 'sorg-row', onClick: function () { toggleExpanded(ungroupedKey); } },
                react.createElement('span', { className: 'sorg-caret' }, isExpanded(ungroupedKey) ? '\u25BE' : '\u25B8'),
                react.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
                react.createElement('span', { className: 'sorg-name' }, '未分组'),
                react.createElement('span', { className: 'sorg-time' }, String(ungroupedSessions.length)),
              ),
              isExpanded(ungroupedKey) && react.createElement('div', { className: 'sorg-sub' }, ungroupedSessions.map(function (id) { return row(ungroupedKey, id); })),
            ),
          ),
          menu && react.createElement(Menu, { items: menu.items, onPick: onMenuPick, onClose: function () { setMenu(null); }, x: menu.x, y: menu.y }),
          modal && react.createElement(Modal, {
            title: modalTitle,
            footer: {
              cancel: function () { setModal(null); },
              confirm: react.createElement('button', {
                type: 'button',
                className: 'sorg-btn sorg-primary',
                disabled: modal.kind !== 'group-delete' && draft.trim() === '',
                onClick: confirmRename,
              }, modal.kind === 'group-delete' ? '删除' : '确定'),
            },
            children: modal.kind === 'group-delete'
              ? react.createElement('div', null, '删除分组"' + (modal.name || '') + '"？其中的会话会回到工作区里。')
              : react.createElement('input', {
                  className: 'sorg-input',
                  value: draft,
                  autoFocus: true,
                  onChange: function (e) { setDraft(e.target.value); },
                  onKeyDown: function (e) { if (e.key === 'Enter') confirmRename(); },
                }),
          }),
        );
      }

      ctx.slots.inject("sidebar.workspaces", function () {
        return ctx.slots.register(
          { name: "sidebar.workspaces", priority: -2 },
          function (props) {
            return react.createElement(Browser, {
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
