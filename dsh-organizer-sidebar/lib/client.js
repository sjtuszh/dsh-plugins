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
//   - 分组与顺序经 ctx.get("remote.organizer").load/save 持久化(由 mount 包挂载,
//     本包 inject ["slots","remote","remote.organizer"],无自依赖死锁)。
// 注意:组件定义在 apply 内部闭包捕获 ctx(模块顶层没有 ctx)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-organizer-sidebar",
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
.sorg-taskArea{height:auto;min-height:76px;resize:vertical;padding:8px 10px;line-height:18px}
.sorg-modal-actions{display:flex;justify-content:flex-end;gap:8px}
.sorg-btn{height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);cursor:pointer;padding:0 14px;font:inherit;font-size:12px}
.sorg-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-btn.sorg-primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
.sorg-spawnBody{display:flex;flex-direction:column;gap:8px}
.sorg-modeToggle{display:flex;gap:6px}
.sorg-modeBtn{flex:1;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px}
.sorg-modeBtn:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-modeBtn.sorg-modeOn{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff;font-weight:600}
.sorg-spawnHint{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:15px}
.sorg-btn:disabled{opacity:.5;cursor:default}
.sorg-rail{width:100%;height:100%;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);display:flex;font-size:18px;cursor:pointer}
.sorg-tabs{flex:none;display:flex;gap:2px;padding:0 8px 4px}
.sorg-tab{flex:1;height:26px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;font:inherit;display:flex;align-items:center;justify-content:center;gap:4px}
.sorg-tab:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-tab.sorg-tabOn{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.sorg-tabBadge{min-width:16px;height:16px;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:10px;line-height:16px;text-align:center;padding:0 4px;font-variant-numeric:tabular-nums}
.sorg-rtBtn{flex:none;height:22px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:11px;font:inherit;padding:0 8px;white-space:nowrap}
.sorg-rtBtn:hover{background:var(--dsw-alias-bg-layer-2)}
.sorg-rtBtn:disabled{opacity:.5;cursor:default}
.sorg-cb{flex:none;width:15px;height:15px;margin:0 4px 0 2px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}
.sorg-hiddenToggle{flex:none;display:flex;justify-content:center;padding:2px 0 0;width:100%}
.sorg-toggleBtn{flex:none;height:24px;border:none;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;font:inherit;padding:0 10px;margin:2px auto;white-space:nowrap}
.sorg-toggleBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sorg-batch{flex:none;display:flex;gap:6px;align-items:center;padding:0 8px 6px;flex-wrap:wrap}
.sorg-batchInfo{font-size:11px;color:var(--dsw-alias-label-secondary);margin-right:auto}
.sorg-selRow{background:var(--dsw-alias-interactive-bg-hover)}
`;

    var CSS_ID = "dsh-organizer-sidebar/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-organizer-sidebar";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // 注:静态客户端 ctx 是代理,未声明即访问会抛错(§4.2)——服务必须按官方
    // ui-workspace 模式在 inject 里声明点号路径,再用属性访问 ctx.sessions /
    // ctx.workspaces(不能用 ctx.get('sessions'),那会触发守卫导致 apply 崩溃)。
    // remote.organizer 是 gateway 安装的 Cordis 服务(remote.<namespace> 显式注册,
    // 非 Proxy),必须 inject "remote.organizer" 才能被注入——单包自 $mount 与
    // inject 不冲突:mount 注册 typert 描述符,remote.organizer 服务的安装由
    // gateway 独立完成,Cordis inject 机制等待依赖就绪,不会自依赖死锁。
    var inject = ["slots", "remote", "sessions", "workspaces"];

    // Typert remote 描述符(原 mount 包内联,单包合并后本包自带):
    // 与 dsh-organizer-sidebar/lib/typert.host.js 清单对应,客户端经它调用 Host。
    var stubSchema = { parse: function (v) { return v; } };
    var TYPERT_REMOTE = {
      package: "dsh-organizer-sidebar",
      descriptors: [
        {
          id: "dsh-organizer-sidebar#organizer/load",
          service: "organizer",
          namespace: "organizer",
          method: "load",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerLoadRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerLoadResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/save",
          service: "organizer",
          namespace: "organizer",
          method: "save",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerSaveRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerSaveResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/delete",
          service: "organizer",
          namespace: "organizer",
          method: "delete",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerDeleteRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerDeleteResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/deleteArchived",
          service: "organizer",
          namespace: "organizer",
          method: "deleteArchived",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerDeleteArchivedRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerDeleteArchivedResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/listDeleted",
          service: "organizer",
          namespace: "organizer",
          method: "listDeleted",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerListDeletedRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerListDeletedResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/restoreArchived",
          service: "organizer",
          namespace: "organizer",
          method: "restoreArchived",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerRestoreRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerRestoreResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/restoreDeleted",
          service: "organizer",
          namespace: "organizer",
          method: "restoreDeleted",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerRestoreRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerRestoreResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/spawnSubagent",
          service: "organizer",
          namespace: "organizer",
          method: "spawnSubagent",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerSpawnSubagentRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerSpawnSubagentResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/endSubagent",
          service: "organizer",
          namespace: "organizer",
          method: "endSubagent",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerEndSubagentRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerEndSubagentResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
        {
          id: "dsh-organizer-sidebar#organizer/forkSubagent",
          service: "organizer",
          namespace: "organizer",
          method: "forkSubagent",
          invocation: { kind: "direct" },
          parameters: [
            {
              name: "request",
              wire: "request",
              source: "json",
              codec: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerForkSubagentRequest", schema: stubSchema },
            },
          ],
          result: { mode: "strict", typeSymbol: "dsh-organizer-sidebar/types#OrganizerForkSubagentResult", schema: stubSchema },
          sourceLocation: { file: "dsh-organizer-sidebar/lib/host.js", line: 1, column: 1 },
        },
      ],
    };

    async function apply(ctx) {
      // 单包合并:挂 Typert remote(fire-and-forget,官方 dsh-api-remotes 同款
      // $mount 语义——它经 enqueue 队列异步完成,不能 await,否则 UI 注册被阻塞)。
      // remoteReady 置位后 Browser 的首次 loadState 才真正调用 remote。
      var remoteReady = false;
      var remoteReadyWaiters = [];
      function whenRemoteReady() {
        if (remoteReady) return Promise.resolve();
        return new Promise(function (resolve) { remoteReadyWaiters.push(resolve); });
      }
      var mp = null;
      try { mp = ctx.remote.$mount(TYPERT_REMOTE); } catch (e) { mp = null; }
      if (mp && typeof mp.then === 'function') {
        mp.then(function () {
          remoteReady = true;
          remoteReadyWaiters.forEach(function (r) { r(); });
          remoteReadyWaiters = [];
        }, function (e) {
          console.error('[dsh-organizer-sidebar] remote $mount failed', e);
          remoteReady = true; // 即使失败也放行,持久化调用会降级
          remoteReadyWaiters.forEach(function (r) { r(); });
          remoteReadyWaiters = [];
        });
      } else {
        remoteReady = true;
      }
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

      // ---- persisted view state (groups nested under a workspace + per-account order + hidden workspaces) ----
      var persisted = { groups: [], order: {}, hiddenWorkspaces: [] };
      function loadState() {
        return whenRemoteReady().then(function () {
          var p = null;
          try {
            p = ctx.get("remote.organizer").load({});
          } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            return p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && typeof res === 'object' && Array.isArray(res.groups)) {
                persisted = {
                  groups: res.groups.filter(function (g) { return g && typeof g.workspaceId === 'string'; }),
                  order: res.order || {},
                  hiddenWorkspaces: Array.isArray(res.hiddenWorkspaces) ? res.hiddenWorkspaces : [],
                };
              }
            }, function () { /* first run: no state yet */ });
          }
          return Promise.resolve();
        });
      }
      function saveState(next) {
        persisted = next;
        var p = null;
        try {
          p = ctx.get("remote.organizer").save({ state: next });
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
        // 隐藏的工作区(workspaceId 数组) + 是否展开显示隐藏工作区
        var hiddenWsState = react.useState(persisted.hiddenWorkspaces || []);
        var hiddenWs = hiddenWsState[0], setHiddenWs = hiddenWsState[1];
        var showHiddenState = react.useState(false);
        var showHidden = showHiddenState[0], setShowHidden = showHiddenState[1];
        var menuState = react.useState(null); // { kind, x, y, id }
        var menu = menuState[0], setMenu = menuState[1];
        var modalState = react.useState(null); // { kind, payload }
        var modal = modalState[0], setModal = modalState[1];
        var draftState = react.useState('');
        var draft = draftState[0], setDraft = draftState[1];
        var spawnTaskState = react.useState('');
        var spawnTask = spawnTaskState[0], setSpawnTask = spawnTaskState[1];
        var dragState = react.useState(null); // { sessionId, fromKey, over: {id, half} }
        var drag = dragState[0], setDrag = dragState[1];
        var dragOverGroupState = react.useState(null); // group id highlight
        var dragOverGroup = dragOverGroupState[0], setDragOverGroup = dragOverGroupState[1];
        // tab: 'main' 会话列表 | 'archived' 已归档 | 'deleted' 已删除
        var tabState = react.useState('main');
        var tab = tabState[0], setTab = tabState[1];
        // 已删除会话列表(由 Host 的 deleted 记录提供)
        var deletedState = react.useState([]);
        var deletedItems = deletedState[0], setDeletedItems = deletedState[1];
        var restoringState = react.useState(null); // 正在还原的 sessionId(禁用按钮)
        var restoring = restoringState[0], setRestoring = restoringState[1];
        // 已归档 tab 多选:selection = Set(由数组承载), selecting 为选择模式开关
        var archSelectState = react.useState([]); // string[] 选中 id
        var archSelected = archSelectState[0], setArchSelected = archSelectState[1];
        var archSelectingState = react.useState(false);
        var archSelecting = archSelectingState[0], setArchSelecting = archSelectingState[1];

        react.useEffect(function () {
          loadState().then(function () {
            setGroups(persisted.groups || []);
            setOrder(persisted.order || {});
            setHiddenWs(persisted.hiddenWorkspaces || []);
          });
        }, []);

        // 切到「已删除」tab 时拉取一次列表
        react.useEffect(function () {
          if (tab !== 'deleted') return;
          var p = null;
          try { p = ctx.get("remote.organizer").listDeleted({}); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && res.ok && Array.isArray(res.items)) setDeletedItems(res.items);
            }, function () {});
          }
        }, [tab]);

        // 离开已归档 tab 时清空选择模式与选中
        react.useEffect(function () {
          if (tab !== 'archived') {
            setArchSelecting(false);
            setArchSelected([]);
          }
        }, [tab]);

        // close menu when clicking anywhere outside it
        react.useEffect(function () {
          if (menu === null) return;
          var onDocClick = function () { setMenu(null); };
          document.addEventListener('click', onDocClick);
          return function () { document.removeEventListener('click', onDocClick); };
        }, [menu]);

        function persist(nextGroups, nextOrder, nextHiddenWs) {
          setGroups(nextGroups);
          setOrder(nextOrder);
          var nh = nextHiddenWs !== undefined ? nextHiddenWs : hiddenWs;
          setHiddenWs(nh);
          saveState({ groups: nextGroups, order: nextOrder, hiddenWorkspaces: nh });
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
        // persistedAlive: 用于保存/迁移分组结构,不要把“当前不是 active 的 blank 会话”
        // 当成丢失;否则只要新开会话导致 current 变化,已有分组就会被 sweep 掉。
        function persistedAlive(id) {
          var s = byId[id];
          if (!s) return false;
          if (s.origin === 'subagent') return false;
          if (archived.has(id)) return false;
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
          // catalog 里的 child id 可能不在 byId(已删除/对账中),排序前过滤掉,
          // 否则 byId[a].createdAt 抛 TypeError 崩溃整个侧边栏。
          // 归档(已释放/删除)的子代理也从展开子智能体列表里剔除,避免"删了还在"。
          childrenOf[ck] = childrenOf[ck].filter(function (id) { return byId[id] !== undefined && !archived.has(id); });
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
          // 子智能体允许重命名:显式 durable session title 优先于不可变 descriptor label。
          var summary = byId[cid];
          if (summary && typeof summary.title === 'string' && summary.title.trim() !== '') return summary.title;
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
            var alive = g.sessionIds.filter(function (id) { return byId[id] !== undefined && persistedAlive(id); });
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
              return gg ? gg.sessionIds.filter(function (id) { return byId[id] !== undefined && persistedAlive(id); }) : [];
            }
            if (key.slice(0, 2) === 'w:') {
              var ww = workspaces.find(function (wx) { return wx.workspaceId === key.slice(2); });
              return ww ? ww.sessionIds.filter(function (id) {
                return byId[id] !== undefined && persistedAlive(id) && !groupedMembers.has(id);
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
                return byId[id] !== undefined && persistedAlive(id) && accountOf[id] === undefined;
              });
            } else if (key.slice(0, 2) === 'g:') {
              var gg = groups.find(function (gx) { return gx.id === key.slice(2); });
              members = (gg ? gg.sessionIds : []).filter(function (id) { return byId[id] !== undefined && persistedAlive(id); });
            } else {
              var ww = workspaces.find(function (wx) { return wx.workspaceId === key.slice(2); });
              members = (ww ? ww.sessionIds : []).filter(function (id) {
                return byId[id] !== undefined && persistedAlive(id) && !groupedMembers.has(id);
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
        // 隐藏工作区:仅加入 hiddenWorkspaces 持久化,不动会话/分组结构。
        function hideWorkspace(wsId) {
          var nh = hiddenWs.slice();
          if (nh.indexOf(wsId) === -1) nh.push(wsId);
          persist(groups, order, nh);
        }
        // 取消隐藏工作区:从 hiddenWorkspaces 移除。
        function unhideWorkspace(wsId) {
          persist(groups, order, hiddenWs.filter(function (x) { return x !== wsId; }));
        }
        // 移除工作区:确认弹窗 → 归档该工作区下所有会话 → 删除工作区(会话归档后不出现在
        // 分组 surface),清理该工作区下的用户分组与顺序持久化,避免孤儿分组残留。
        function removeWorkspace(wsId, wsTitle) {
          setModal({ kind: 'workspace-remove', id: wsId, title: wsTitle });
        }
        function confirmRemoveWorkspace() {
          var wsId = modal.id;
          var wsTitle = modal.title || '';
          setModal(null);
          var ws = workspaces.find(function (w) { return w.workspaceId === wsId; });
          var sids = ws ? ws.sessionIds.slice() : [];
          // 归档所有下属会话(并发,fail-safe),然后再删除工作区
          sids.forEach(function (sid) {
            if (workspacesService) {
              workspacesService.archiveSession(sid).then(function () {}, function (e) { console.error('archive session failed', e); });
            }
          });
          function finishRemove() {
            if (!workspacesService) return;
            workspacesService.delete(wsId).then(function () {
              var nextGroups = groups.filter(function (g) { return g.workspaceId !== wsId; });
              var nextOrder = Object.assign({}, order);
              delete nextOrder['w:' + wsId];
              nextGroups.forEach(function (g) { delete nextOrder['g:' + g.id]; });
              persist(nextGroups, nextOrder, hiddenWs.filter(function (x) { return x !== wsId; }));
            }, function (e) {
              console.error('remove workspace failed', e);
              window.alert('移除工作区失败：' + ((e && (e.message || e.code)) || '请求出错'));
            });
          }
          if (workspacesService) Promise.resolve().then(finishRemove);
        }
        // 删除会话:确认后调用 Host(回收站删除),成功后把会话从本地分组/顺序中移除。
        // 列表本身会随 Host 对账消失;这里同步清理分组数据避免残留引用。
        function deleteSession(id) {
          setModal({ kind: 'session-delete', id: id, title: titleOf(id) });
        }
        function confirmDeleteSession() {
          var sid = modal.id;
          var title = modal.title || '';
          setModal(null);
          var p = null;
          try { p = ctx.get("remote.organizer").delete({ sessionId: sid, title: title }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && res.ok) {
                // 从分组移除该会话,≤1 的分组自动解散;从 order 移除该 id
                var nextGroups = groups.map(function (g) {
                  return Object.assign({}, g, { sessionIds: g.sessionIds.filter(function (x) { return x !== sid; }) });
                });
                var nextOrder = Object.assign({}, order);
                Object.keys(nextOrder).forEach(function (k) {
                  nextOrder[k] = nextOrder[k].filter(function (x) { return x !== sid; });
                });
                var swept = sweepGroups(nextGroups, nextOrder);
                persist(swept.groups, swept.order);
              } else {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '删除失败');
                window.alert('删除失败：' + errMsg);
              }
            }, function () { window.alert('删除失败：请求出错'); });
          }
        }
        // 还原已归档会话:调 Host 从 archivedSessionIds 移除
        function restoreArchived(id) {
          setRestoring(id);
          var p = null;
          try { p = ctx.get("remote.organizer").restoreArchived({ sessionId: id }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              setRestoring(null);
              var res = r && r.ok ? r.value : null;
              if (!(res && res.ok)) {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '还原失败');
                window.alert('还原失败：' + errMsg);
              }
            }, function () { setRestoring(null); window.alert('还原失败：请求出错'); });
          } else setRestoring(null);
        }
        // 批量还原已归档会话:逐个调 restoreArchived,全部结束后清空选择
        function restoreArchivedMany(ids) {
          var pending = ids.length;
          if (pending === 0) return;
          var done = function () {
            pending -= 1;
            if (pending <= 0) setArchSelected([]);
          };
          ids.forEach(function (id) {
            var p = null;
            try { p = ctx.get("remote.organizer").restoreArchived({ sessionId: id }); } catch (e) { p = null; }
            if (p && typeof p.then === 'function') {
              p.then(function (r) {
                var res = r && r.ok ? r.value : null;
                if (!(res && res.ok)) {
                  var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '还原失败');
                  window.alert('还原失败：' + errMsg);
                }
                done();
              }, function () { window.alert('还原失败：请求出错'); done(); });
            } else done();
          });
        }
        // 批量删除已归档会话:调 Host deleteArchived(回收站删除 + 移除归档标记)
        function deleteArchivedMany(ids) {
          if (ids.length === 0) return;
          if (!window.confirm('删除选中的 ' + ids.length + ' 个已归档会话？会话记录会移入系统回收站，可从回收站还原。')) return;
          var titles = {};
          ids.forEach(function (id) {
            var s = byId[id];
            titles[id] = s ? (s.blank ? '新会话' : (s.displayTitle || id)) : id;
          });
          var p = null;
          try { p = ctx.get("remote.organizer").deleteArchived({ ids: ids, titles: titles }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && res.ok) {
                setArchSelected([]);
              } else {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '删除失败');
                window.alert('删除失败：' + errMsg);
                // 部分成功:清掉已成功的,保留失败的
                if (res && res.partial && Array.isArray(res.results)) {
                  var failedIds = res.results.filter(function (x) { return !x.ok; }).map(function (x) { return x.sessionId; });
                  setArchSelected(archSelected.filter(function (x) { return failedIds.indexOf(x) !== -1; }));
                } else setArchSelected([]);
              }
            }, function () { window.alert('删除失败：请求出错'); });
          }
        }
        // 已归档 tab 选择切换
        function toggleArchSelect(id) {
          setArchSelected(archSelected.indexOf(id) === -1 ? archSelected.concat([id]) : archSelected.filter(function (x) { return x !== id; }));
        }
        // 还原已删除会话:调 Host 从回收站还原,成功后从列表移除
        function restoreDeleted(id) {
          setRestoring(id);
          var p = null;
          try { p = ctx.get("remote.organizer").restoreDeleted({ sessionId: id }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              setRestoring(null);
              var res = r && r.ok ? r.value : null;
              if (res && res.ok) {
                setDeletedItems(deletedItems.filter(function (x) { return x.sessionId !== id; }));
              } else {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '还原失败');
                window.alert('还原失败：' + errMsg);
              }
            }, function () { setRestoring(null); window.alert('还原失败：请求出错'); });
          } else setRestoring(null);
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
          } else if (modal.kind === 'subagent-spawn') {
            spawnSubagent(modal.id, name, modal.mode || 'new', spawnTask);
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
              { id: 'spawn-subagent', label: '拉起子智能体' },
            ],
          });
        }
        function workspaceMenu(e, ws) {
          var isHidden = hiddenWs.indexOf(ws.workspaceId) !== -1;
          openMenuAt(e, {
            kind: 'workspace', id: ws.workspaceId, title: ws.title, isHidden: isHidden,
            items: isHidden
              ? [
                  { id: 'unhide', label: '取消隐藏' },
                  { id: 'remove', label: '移除工作区', danger: true },
                ]
              : [
                  { id: 'hide', label: '隐藏工作区' },
                  { id: 'remove', label: '移除工作区', danger: true },
                ],
          });
        }
        function onMenuPick(id) {
          var m = menu;
          if (!m) return;
          if (m.kind === 'group') {
            if (id === 'rename') { setModal({ kind: 'group-rename', id: m.id }); setDraft((groups.find(function (g) { return g.id === m.id; }) || {}).name || ''); }
            if (id === 'delete') { var found = groups.find(function (g) { return g.id === m.id; }) || {}; setModal({ kind: 'group-delete', id: m.id, name: found.name || '' }); }
          } else if (m.kind === 'archived') {
            if (id === 'restore') restoreArchived(m.id);
            if (id === 'delete') deleteArchivedOne(m.id);
          } else if (m.kind === 'workspace') {
            if (id === 'hide') hideWorkspace(m.id);
            if (id === 'unhide') unhideWorkspace(m.id);
            if (id === 'remove') removeWorkspace(m.id, m.title);
          } else if (m.kind === 'subagent') {
            if (id === 'rename-subagent') renameSession(m.id);
            if (id === 'fork-subagent') forkSubagent(m.id, m.name || childName(m.id));
            if (id === 'end-subagent') endSubagent(m.parentId, m.id);
          } else {
            if (id === 'rename') renameSession(m.id);
            if (id === 'fork') forkSession(m.id);
            if (id === 'archive') archiveSession(m.id);
            if (id === 'spawn-subagent') { setModal({ kind: 'subagent-spawn', id: m.id, title: titleOf(m.id), mode: 'new' }); setDraft(''); setSpawnTask(''); }
          }
        }
        // 已归档会话三点菜单(未进入批量模式时可用):单条还原 / 单条删除
        function archivedMenu(e, id) {
          openMenuAt(e, {
            kind: 'archived', id: id, items: [
              { id: 'restore', label: '还原' },
              { id: 'delete', label: '删除', danger: true },
            ],
          });
        }
        // 单条删除已归档会话:复用批量删除端点(回收站删除 + 移除归档标记)
        function deleteArchivedOne(id) {
          if (!window.confirm('删除已归档会话？会话记录会移入系统回收站，可从回收站还原。')) return;
          var s = byId[id];
          var title = s ? (s.blank ? '新会话' : (s.displayTitle || id)) : id;
          var titles = {}; titles[id] = title;
          var p = null;
          try { p = ctx.get("remote.organizer").deleteArchived({ ids: [id], titles: titles }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (!(res && res.ok)) {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '删除失败');
                window.alert('删除失败：' + errMsg);
              }
            }, function () { window.alert('删除失败：请求出错'); });
          }
        }

        // 拉起子智能体:确认改名弹窗(modal.kind==='subagent-spawn')里的名称后调用端点。
        function spawnSubagent(parentId, name, mode, task) {
          var p = null;
          try { p = ctx.get("remote.organizer").spawnSubagent({ parentSessionId: parentId, name: name, mode: mode, task: task }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && res.ok) {
                setModal(null);
                window.alert('已拉起子智能体' + (res.childId ? '：' + res.childId : ''));
              } else {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '拉起失败');
                window.alert('拉起失败：' + errMsg);
              }
            }, function () { window.alert('拉起失败：请求出错'); });
          } else {
            setModal(null);
            window.alert('拉起失败：服务不可用');
          }
        }
        // 分叉复制子智能体:Host 用 fork provider 继承源子代理上下文,名称自动递增去重。
        function forkSubagent(sourceChildId, sourceName) {
          var p = null;
          try { p = ctx.get("remote.organizer").forkSubagent({ sourceChildId: sourceChildId, sourceName: sourceName }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (res && res.ok) {
                window.alert('已分叉复制子智能体：' + (res.name || res.childId));
              } else {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '分叉复制失败');
                window.alert('分叉复制失败：' + errMsg);
              }
            }, function () { window.alert('分叉复制失败：请求出错'); });
          } else {
            window.alert('分叉复制失败：服务不可用');
          }
        }
        // 子代理三点菜单:重命名 / 分叉复制 / 删除(结束)
        function subagentMenu(e, parentId, cid) {
          openMenuAt(e, {
            kind: 'subagent', id: cid, parentId: parentId, name: childName(cid), items: [
              { id: 'rename-subagent', label: '重命名' },
              { id: 'fork-subagent', label: '分叉复制' },
              { id: 'end-subagent', label: '删除(结束)子智能体', danger: true },
            ],
          });
        }
        // 删除(结束)子智能体:Host interrupt + drain 释放 + 归档会话,从侧栏表面消失。
        function endSubagent(parentId, childId) {
          if (!window.confirm('删除(结束)该子智能体？将中断运行、释放资源并归档其会话记录。')) return;
          var p = null;
          try { p = ctx.get("remote.organizer").endSubagent({ childSessionId: childId, parentSessionId: parentId }); } catch (e) { p = null; }
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              var res = r && r.ok ? r.value : null;
              if (!(res && res.ok)) {
                var errMsg = (res && res.error) || ((r && r.error && (r.error.message || r.error.code)) || '结束失败');
                window.alert('结束失败：' + errMsg);
              }
            }, function () { window.alert('结束失败：请求出错'); });
          }
        }

        // ---- render helpers ----
        // 子 agent 行:自身运行中(running)显示绿点,等待用户(pendingInteraction)显示黄点
        // 子代理行支持递归子代(分叉复制是源子代理的真正 fork 子代理,自然嵌套在源下)。
        function childRow(cid, parentId) {
          var csummary = byId[cid];
          var kids = childrenOf[cid] || [];
          var cwaiting = csummary !== undefined && csummary.pendingInteraction !== undefined && csummary.pendingInteraction !== null;
          var hasActiveChild = kids.some(function (k) {
            var s = byId[k];
            return s !== undefined && (s.running || (s.pendingInteraction !== undefined && s.pendingInteraction !== null));
          });
          var cstatusDot = cwaiting ? 'sorg-dot-wait' : (csummary && csummary.running ? 'sorg-dot-run' : (hasActiveChild ? 'sorg-dot-run' : null));
          var childKey = 's:' + cid;
          var childOpen = expanded[childKey] === true;
          var rowEl = react.createElement('div', {
            className: 'sorg-row sorg-title-sm sorg-child',
            onClick: function () { openSession(cid); },
            children: [
              kids.length > 0 && react.createElement('span', {
                key: 'cr', className: 'sorg-caret',
                onClick: function (e) { e.stopPropagation(); toggleExpanded(childKey); },
              }, childOpen ? '\u25BE' : '\u25B8'),
              react.createElement('span', { className: 'sorg-ico' }, isAgentTeamsChild(cid) ? WORKER_ICON : SUBAGENT_ICON),
              cstatusDot !== null && react.createElement('span', { key: 'st', className: cstatusDot }),
              react.createElement('span', { className: 'sorg-name' }, childName(cid)),
              react.createElement('span', { className: 'sorg-time' }, timeOf(cid)),
              react.createElement('button', { type: 'button', className: 'sorg-dots sorg-show', onClick: function (e) { subagentMenu(e, parentId, cid); } }, '\u22EF'),
            ],
          });
          return react.createElement('div', { key: cid, className: 'sorg-grp' },
            rowEl,
            childOpen && react.createElement('div', { className: 'sorg-sub' }, kids.map(function (kid) { return childRow(kid, cid); })),
          );
        }

        function row(key, id) {
          var marker = drag && drag.over && drag.over.id === id ? drag.over.half : null;
          var summary = byId[id];
          var waiting = summary !== undefined && summary.pendingInteraction !== undefined && summary.pendingInteraction !== null;
          var children = childrenOf[id] || [];
          // 自身运行中 → 绿点;等待用户 → 黄点;否则若有任一子 agent 在活动(运行或等待)→ 绿点
          var hasActiveChild = children.some(function (c) {
            var cs = byId[c];
            if (cs === undefined) return false;
            if (cs.running) return true;
            return cs.pendingInteraction !== undefined && cs.pendingInteraction !== null;
          });
          var statusDot = waiting ? 'sorg-dot-wait'
            : (summary && summary.running ? 'sorg-dot-run'
            : (hasActiveChild ? 'sorg-dot-run' : null));
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
            childOpen && react.createElement('div', { className: 'sorg-sub' }, children.map(function (cid) { return childRow(cid, id); })),
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
          var isHidden = hiddenWs.indexOf(ws.workspaceId) !== -1;
          var wsGroups = groups.filter(function (g) { return g.workspaceId === ws.workspaceId; });
          var looseSessions = orderedIn(key, ws.sessionIds.filter(function (id) { return visible(id) && !groupedMembers.has(id); }));
          var expandedNow = isExpanded(key);
          return react.createElement('div', { key: key, className: 'sorg-grp' },
            react.createElement('div', { className: 'sorg-row' + (isHidden ? ' sorg-ghost' : ''), onClick: function () { toggleExpanded(key); } },
              react.createElement('span', { className: 'sorg-caret' }, expandedNow ? '\u25BE' : '\u25B8'),
              react.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
              react.createElement('span', { className: 'sorg-name' }, ws.title),
              react.createElement('span', { className: 'sorg-time' }, String(ws.sessionIds.filter(visible).length)),
              react.createElement('button', { type: 'button', className: 'sorg-dots', onClick: function (e) { workspaceMenu(e, ws); } }, '\u22EF'),
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

        // ---- 已归档 tab:archivedSessionIds 里的会话,按归档顺序(注册表顺序)排列 ----
        // 支持选择模式:点 checkbox 勾选,可批量还原/删除
        function archivedList() {
          var ids = (wsState && wsState.archivedSessionIds) || [];
          if (ids.length === 0) {
            return react.createElement('div', { className: 'sorg-empty' }, '没有已归档的会话');
          }
          var allSelected = archSelected.length === ids.length;
          return react.createElement('div', null,
            react.createElement('div', { className: 'sorg-batch' },
              archSelecting
                ? react.createElement(react.Fragment, null,
                    react.createElement('span', { className: 'sorg-batchInfo' }, '已选 ' + archSelected.length + ' / ' + ids.length),
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-rtBtn',
                      onClick: function () { setArchSelected(allSelected ? [] : ids.slice()); },
                    }, allSelected ? '取消全选' : '全选'),
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-rtBtn',
                      disabled: archSelected.length === 0,
                      onClick: function () { restoreArchivedMany(archSelected.slice()); },
                    }, '还原选中'),
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-rtBtn',
                      disabled: archSelected.length === 0,
                      onClick: function () { deleteArchivedMany(archSelected.slice()); },
                    }, '删除选中'),
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-rtBtn',
                      onClick: function () { setArchSelecting(false); setArchSelected([]); },
                    }, '取消'),
                  )
                : react.createElement(react.Fragment, null,
                    react.createElement('span', { className: 'sorg-batchInfo' }, '共 ' + ids.length + ' 个已归档会话'),
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-rtBtn',
                      onClick: function () { setArchSelecting(true); },
                    }, '批量操作'),
                  ),
            ),
            react.createElement('div', { className: 'sorg-grp' },
              ids.map(function (id) {
                var s = byId[id];
                var title = s ? (s.blank ? '新会话' : (s.displayTitle || id)) : id;
                var checked = archSelected.indexOf(id) !== -1;
                return react.createElement('div', {
                  key: id,
                  className: 'sorg-row sorg-title-sm' + (checked ? ' sorg-selRow' : ''),
                  onClick: function () { openSession(id); },
                  children: [
                    // 仅批量操作模式显示勾选框;默认只显示三点菜单(还原/删除)
                    archSelecting && react.createElement('input', {
                      type: 'checkbox',
                      className: 'sorg-cb',
                      checked: checked,
                      onChange: function (e) { e.stopPropagation(); toggleArchSelect(id); },
                      onClick: function (e) { e.stopPropagation(); },
                    }),
                    react.createElement('span', { className: 'sorg-ico' }, '\u{1F4C1}'), // 📁 closed folder
                    react.createElement('span', { className: 'sorg-name' }, title),
                    react.createElement('span', { className: 'sorg-time' }, timeOf(id)),
                    archSelecting
                      ? null
                      : react.createElement('button', {
                          type: 'button',
                          className: 'sorg-dots',
                          onClick: function (e) { archivedMenu(e, id); },
                        }, '\u22EF'),
                  ],
                });
              }),
            ),
          );
        }

        // ---- 已删除 tab:Host deleted 记录(标题与删除时间),可还原 ----
        function deletedList() {
          if (deletedItems.length === 0) {
            return react.createElement('div', { className: 'sorg-empty' }, '没有已删除的会话');
          }
          function deletedTime(ts) {
            if (!ts) return '';
            var diff = Date.now() - ts;
            var m = Math.floor(diff / 6e4);
            if (m < 1) return '刚刚';
            if (m < 60) return m + '分前';
            if (m < 1440) return Math.floor(m / 60) + '时前';
            return Math.floor(m / 1440) + '天前';
          }
          return react.createElement('div', { className: 'sorg-grp' },
            deletedItems.map(function (it) {
              return react.createElement('div', {
                key: it.sessionId,
                className: 'sorg-row sorg-title-sm',
                onClick: function () { openSession(it.sessionId); },
                children: [
                  react.createElement('span', { className: 'sorg-ico' }, '\u{1F5D1}'), // 🗑️ wastebasket
                  react.createElement('span', { className: 'sorg-name' }, it.title || it.sessionId),
                  react.createElement('span', { className: 'sorg-time' }, deletedTime(it.deletedAt)),
                  react.createElement('button', {
                    type: 'button',
                    className: 'sorg-rtBtn',
                    disabled: restoring === it.sessionId,
                    onClick: function (e) { e.stopPropagation(); restoreDeleted(it.sessionId); },
                  }, restoring === it.sessionId ? '还原中…' : '还原'),
                ],
              });
            }),
          );
        }

        if (!wide) {
          return react.createElement('div', { className: 'sorg-rail', onClick: function () { expandSidebar(); } }, WORKSPACE_ICON);
        }

        var modalTitle = modal && (modal.kind === 'group-rename' ? '重命名分组'
          : modal.kind === 'group-delete' ? '删除分组'
          : modal.kind === 'session-delete' ? '删除会话'
          : modal.kind === 'workspace-remove' ? '移除工作区'
          : modal.kind === 'subagent-spawn' ? '拉起子智能体'
          : '重命名会话');
        var modalConfirmText = modal && (modal.kind === 'group-delete' || modal.kind === 'session-delete' || modal.kind === 'workspace-remove') ? '移除' : '确定';
        var modalConfirmDisabled = modal !== null && modal.kind !== 'group-delete' && modal.kind !== 'session-delete' && modal.kind !== 'workspace-remove' && draft.trim() === '';
        var modalChildren = null;
        if (modal !== null && modal.kind === 'group-delete') {
          modalChildren = react.createElement('div', null, '删除分组"' + (modal.name || '') + '"？其中的会话会回到工作区里。');
        } else if (modal !== null && modal.kind === 'session-delete') {
          modalChildren = react.createElement('div', null,
            '删除会话"' + (modal.title || '') + '"？会话记录会移入系统回收站，可从回收站还原。');
        } else if (modal !== null && modal.kind === 'workspace-remove') {
          modalChildren = react.createElement('div', null,
            '移除工作区"' + (modal.title || '') + '"？其下所有会话会被归档到「已归档」，工作区本身被删除。此操作不可撤销。');
        } else if (modal !== null && modal.kind === 'subagent-spawn') {
          // 命名弹窗:全新 / 继承 切换 + 名称输入
          modalChildren = react.createElement('div', { className: 'sorg-spawnBody' },
            react.createElement('div', { className: 'sorg-modeToggle' },
              react.createElement('button', {
                type: 'button',
                className: 'sorg-modeBtn' + (modal.mode !== 'inherit' ? ' sorg-modeOn' : ''),
                onClick: function () { setModal(Object.assign({}, modal, { mode: 'new' })); },
              }, '全新'),
              react.createElement('button', {
                type: 'button',
                className: 'sorg-modeBtn' + (modal.mode === 'inherit' ? ' sorg-modeOn' : ''),
                onClick: function () { setModal(Object.assign({}, modal, { mode: 'inherit' })); },
              }, '继承'),
            ),
            react.createElement('input', {
              className: 'sorg-input',
              value: draft,
              autoFocus: true,
              placeholder: '子智能体名称',
              onChange: function (e) { setDraft(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter') confirmRename(); },
            }),
            react.createElement('textarea', {
              className: 'sorg-input sorg-taskArea',
              rows: 4,
              value: spawnTask,
              placeholder: '任务（可省略，作为子智能体初始指令；继承模式下子代理已带父上下文）',
              onChange: function (e) { setSpawnTask(e.target.value); },
            }),
            react.createElement('div', { className: 'sorg-spawnHint' },
              modal.mode === 'inherit' ? '继承：子智能体将继承父会话的已完成轮次上下文。' : '全新：子智能体在独立上下文中运行，不继承父会话。'),
          );
        } else {
          modalChildren = react.createElement('input', {
            className: 'sorg-input',
            value: draft,
            autoFocus: true,
            onChange: function (e) { setDraft(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') confirmRename(); },
          });
        }
        return react.createElement('div', { className: 'sorg-root' },
          react.createElement('div', { className: 'sorg-head' },
            react.createElement('span', { className: 'sorg-title' }, '会话'),
            react.createElement('span', { className: 'sorg-hint' }, '拖拽排序 · 放会话中间建组'),
          ),
          react.createElement('div', { className: 'sorg-tabs' },
            react.createElement('button', {
              type: 'button',
              className: 'sorg-tab' + (tab === 'main' ? ' sorg-tabOn' : ''),
              onClick: function () { setTab('main'); },
            }, '会话'),
            react.createElement('button', {
              type: 'button',
              className: 'sorg-tab' + (tab === 'archived' ? ' sorg-tabOn' : ''),
              onClick: function () { setTab('archived'); },
            }, '已归档',
              archived.size > 0 && react.createElement('span', { className: 'sorg-tabBadge' }, String(archived.size))),
            react.createElement('button', {
              type: 'button',
              className: 'sorg-tab' + (tab === 'deleted' ? ' sorg-tabOn' : ''),
              onClick: function () { setTab('deleted'); },
            }, '已删除',
              deletedItems.length > 0 && react.createElement('span', { className: 'sorg-tabBadge' }, String(deletedItems.length))),
          ),
          react.createElement('div', { className: 'sorg-list' },
            tab === 'main' && react.createElement(react.Fragment, null,
              (function () {
                var visibleWs = workspaces.filter(function (w) { return hiddenWs.indexOf(w.workspaceId) === -1; });
                var hiddenItems = workspaces.filter(function (w) { return hiddenWs.indexOf(w.workspaceId) !== -1; });
                return react.createElement(react.Fragment, null,
                  (visibleWs.length === 0 && ungroupedSessions.length === 0 && groups.length === 0)
                    && react.createElement('div', { className: 'sorg-empty' }, '暂无会话'),
                  visibleWs.map(workspaceNode),
                  ungroupedSessions.length > 0 && react.createElement('div', { key: ungroupedKey, className: 'sorg-grp' },
                    react.createElement('div', { className: 'sorg-row', onClick: function () { toggleExpanded(ungroupedKey); } },
                      react.createElement('span', { className: 'sorg-caret' }, isExpanded(ungroupedKey) ? '\u25BE' : '\u25B8'),
                      react.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
                      react.createElement('span', { className: 'sorg-name' }, '未分组'),
                      react.createElement('span', { className: 'sorg-time' }, String(ungroupedSessions.length)),
                    ),
                    isExpanded(ungroupedKey) && react.createElement('div', { className: 'sorg-sub' }, ungroupedSessions.map(function (id) { return row(ungroupedKey, id); })),
                  ),
                  hiddenItems.length > 0 && react.createElement('div', { className: 'sorg-hiddenToggle' },
                    react.createElement('button', {
                      type: 'button',
                      className: 'sorg-toggleBtn',
                      onClick: function () { setShowHidden(!showHidden); },
                    }, showHidden ? '隐藏工作区' + '\u25BE' : '隐藏工作区 (' + hiddenItems.length + ')' + '\u25B8'),
                  ),
                  showHidden && hiddenItems.map(workspaceNode),
                );
              })(),
            ),
            tab === 'archived' && react.createElement(archivedList, null),
            tab === 'deleted' && react.createElement(deletedList, null),
          ),
          menu && react.createElement(Menu, { items: menu.items, onPick: onMenuPick, onClose: function () { setMenu(null); }, x: menu.x, y: menu.y }),
          modal && react.createElement(Modal, {
            title: modalTitle,
            footer: {
              cancel: function () { setModal(null); },
              confirm: react.createElement('button', {
                type: 'button',
                className: 'sorg-btn sorg-primary',
                disabled: modalConfirmDisabled,
                onClick: modal.kind === 'session-delete' ? confirmDeleteSession
                  : modal.kind === 'workspace-remove' ? confirmRemoveWorkspace
                  : confirmRename,
              }, modalConfirmText),
            },
            children: modalChildren,
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
