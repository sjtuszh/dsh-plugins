// ============================================================================
// 侧栏会话管理器 — 实验区影子浏览器(Client 半边,动态版 v2)
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.client 传入(函数体,返回 Cordis Plugin)。
//
// 以 priority:-1 注册 sidebar.workspaces 单槽位,顶掉官方 WorkspaceBrowser
// (同槽位最低 priority 渲染,官方注册保留 → 停用本插件即还原官方)。
//
// 功能(对话管理):
//  - 工作区分组会话列表 + 未分组桶 + 搜索(内容命中)
//  - 会话行 ⋯ 菜单:打开 / 改名 / 归档 / 分叉 / 在文件管理器中打开(cwd)
//  - 工作区 ⋯ 菜单:改名 / 新建会话 / 上移下移 / 删除注册
//  - 头部:新建工作区(native picker)+ 搜索框;rail 折叠态显示图标列
//
// v2 变更:未分组会话(无归属工作区)不显示上移/下移。
// 数据:标准 props useSessions/useWorkspaces + ctx.workspaces/ctx.sessions;
// 会话改名无客户端 Remote → host.call('sessman:rename')。
// ============================================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    styles.insert(`
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
.sbm-hint{font-size:11px;color:var(--dsw-alias-label-secondary);padding:8px 12px}
.sbm-menu{position:fixed;z-index:2600;pointer-events:auto;min-width:168px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:4px;color:var(--dsw-alias-label-primary);font-size:12px}
.sbm-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.sbm-mi:hover{background:var(--dsw-alias-bg-layer-2)}
.sbm-toast{position:fixed;right:14px;bottom:18px;z-index:2700;pointer-events:none;background:rgba(0,0,0,.82);color:#fff;font-size:12px;padding:7px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:60vw;font-family:Inter,var(--dsw-font-family)}
.sbm-rail{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px}
.sbm-railBtn{width:34px;height:34px;border:none;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
.sbm-railBtn:hover{background:var(--dsw-alias-bg-layer-2)}
`);

    function ShadowBrowser(props) {
      const useSessions = props.useSessions;
      const useWorkspaces = props.useWorkspaces;
      const wide = props.wide !== false;
      const wsSnap = useWorkspaces((s) => s);
      const sSnap = useSessions((s) => s);
      const workspaces = ctx.get('workspaces');
      const sessions = ctx.get('sessions');

      const [menu, setMenu] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const [query, setQuery] = React.useState('');
      const [searching, setSearching] = React.useState(false);
      const [hits, setHits] = React.useState(null);

      const showToast = (t) => {
        setToast(t);
        ctx.timeout(() => setToast(null), 2200);
      };

      const byId = (sSnap && sSnap.byId) || {};
      const archived = new Set((wsSnap && wsSnap.archivedSessionIds) || []);
      const items = (wsSnap && wsSnap.items) || [];
      const current = sSnap && sSnap.current;

      React.useEffect(() => {
        if (!menu) return;
        const onDown = (ev) => {
          if (ev.target && ev.target.closest && ev.target.closest('.sbm-menu')) return;
          setMenu(null);
        };
        const onKey = (ev) => { if (ev.key === 'Escape') setMenu(null); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey);
        };
      }, [menu]);

      const openMenu = (e, kind, id, extra) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ kind, id, x: Math.min(r.right, window.innerWidth - 176), y: r.bottom + 4, extra: extra || null });
      };

      const actOpen = (id) => { if (sessions) sessions.open(id); setMenu(null); };
      const actFork = async (id) => {
        try {
          const child = await sessions.fork({ sessionId: id });
          sessions.open(child);
          showToast('已分叉为新会话');
        } catch (e) { showToast('分叉失败'); }
        setMenu(null);
      };
      const actRename = (kind, id) => {
        const cur = kind === 'ws'
          ? ((items.find((w) => w.workspaceId === id) || {}).title || '')
          : ((byId[id] && byId[id].displayTitle) || (byId[id] && byId[id].title) || '');
        const next = window.prompt('新名称', cur);
        if (!next || !next.trim()) { setMenu(null); return; }
        const t = next.trim();
        if (kind === 'ws') {
          workspaces.rename(id, t).then(() => showToast('已改名')).catch(() => showToast('改名失败'));
        } else {
          host.call('sessman:rename', { sessionId: id, title: t })
            .then((r) => showToast(r && r.ok ? '已改名' : ((r && r.error) || '改名失败')))
            .catch(() => showToast('改名失败'));
        }
        setMenu(null);
      };
      const actArchive = (id) => {
        workspaces.archiveSession(id).then(() => showToast('已归档')).catch(() => showToast('归档失败'));
        setMenu(null);
      };
      const actOpenPath = (id) => {
        const s = byId[id];
        if (s && s.cwd && workspaces) workspaces.openPath(s.cwd).catch(() => {});
        setMenu(null);
      };
      const actNewSession = (wsId) => { workspaces.startSession(wsId || undefined); setMenu(null); };
      const actMoveWs = (id, dir) => {
        const idx = items.findIndex((w) => w.workspaceId === id);
        const target = dir < 0 ? items[idx - 1] : items[idx + 1];
        workspaces.insertBefore(id, target ? target.workspaceId : undefined)
          .then(() => {}).catch(() => showToast('移动失败'));
        setMenu(null);
      };
      const actMoveSession = (id, dir) => {
        const ws = items.find((w) => (w.sessionIds || []).indexOf(id) >= 0);
        if (!ws) { setMenu(null); return; }
        const ids = ws.sessionIds;
        const idx = ids.indexOf(id);
        const anchor = dir < 0 ? ids[idx - 1] : ids[idx + 1];
        workspaces.insertSessionBefore(ws.workspaceId, id, anchor)
          .then(() => {}).catch(() => showToast('移动失败'));
        setMenu(null);
      };
      const actDeleteWs = async (id) => {
        if (window.confirm('删除该工作区注册？（目录与会话日志保留，会话将变为未分组）')) {
          try { await workspaces.delete(id); showToast('已删除注册'); } catch (e) { showToast('删除失败'); }
        }
        setMenu(null);
      };
      const actNewWorkspace = async () => {
        try {
          const p = await workspaces.pickDirectory();
          if (p) {
            await workspaces.create({ path: p });
            showToast('已添加工作区');
          }
        } catch (e) { showToast('添加失败'); }
      };
      const doSearch = async () => {
        const q = (query || '').trim();
        if (!q) { setHits(null); return; }
        if (!sessions) return;
        setSearching(true);
        try {
          const r = await sessions.search(q, new AbortController().signal);
          setHits(r && r.ok ? r.items : []);
        } catch (e) { setHits([]); }
        setSearching(false);
      };

      if (!wide) {
        return React.createElement('div', { className: 'sbm-rail' },
          React.createElement('button', { className: 'sbm-railBtn', title: '展开侧栏', onClick: props.expandSidebar }, '🗂'),
          items.map((w) => React.createElement('button', {
            key: w.workspaceId,
            className: 'sbm-railBtn',
            title: w.title || w.path,
            onClick: props.expandSidebar,
          }, (w.title || '?').slice(0, 1).toUpperCase())),
        );
      }

      const sessionRow = (id) => {
        const s = byId[id];
        if (!s) return null;
        const title = s.displayTitle || s.title || id.slice(0, 8);
        return React.createElement('div', {
          key: id,
          className: 'sbm-row' + (id === current ? ' sbm-current' : ''),
          onClick: () => actOpen(id),
          title: s.cwd || '',
        },
          React.createElement('span', { className: 'sbm-ic' }, s.running ? '●' : (s.blank ? '○' : '💬')),
          React.createElement('span', { className: 'sbm-name' }, title),
          React.createElement('button', { className: 'sbm-dots' + (menu && menu.id === id && menu.kind === 'sess' ? ' show' : ''), onClick: (e) => openMenu(e, 'sess', id) }, '⋯'),
        );
      };

      let body = null;
      if (hits !== null) {
        body = React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'sbm-section' }, '搜索结果' + (searching ? '…' : ' (' + hits.length + ')')),
          hits.length === 0
            ? React.createElement('div', { className: 'sbm-empty' }, searching ? '搜索中…' : '无结果')
            : hits.map((h) => {
              const s = byId[h.sessionId];
              return React.createElement('div', {
                key: h.sessionId,
                className: 'sbm-row',
                onClick: () => actOpen(h.sessionId),
                title: h.sessionId,
              },
                React.createElement('span', { className: 'sbm-ic' }, '🔎'),
                React.createElement('span', { className: 'sbm-name' }, (s && (s.displayTitle || s.title)) || h.sessionId.slice(0, 10)),
              );
            }),
        );
      } else if (items.length === 0 && Object.keys(byId).length === 0) {
        body = React.createElement('div', { className: 'sbm-empty' }, '暂无会话，点右上角 ⊕ 添加工作区');
      } else {
        body = React.createElement(React.Fragment, null,
          items.map((w) => {
            const rows = (w.sessionIds || []).filter((id) => !archived.has(id)).map(sessionRow);
            return React.createElement('div', { key: w.workspaceId, className: 'sbm-ws' },
              React.createElement('div', { className: 'sbm-wsHead', onClick: () => actNewSession(w.workspaceId) },
                React.createElement('span', { className: 'sbm-wsTitle' }, w.title || w.path),
                React.createElement('span', { className: 'sbm-wsCount' }, rows.length),
                React.createElement('button', { className: 'sbm-dots' + (menu && menu.id === w.workspaceId && menu.kind === 'ws' ? ' show' : ''), onClick: (e) => openMenu(e, 'ws', w.workspaceId) }, '⋯'),
              ),
              rows,
            );
          }),
          (() => {
            const wsIds = new Set();
            items.forEach((w) => (w.sessionIds || []).forEach((id) => wsIds.add(id)));
            const ungrouped = Object.keys(byId).filter((id) => !wsIds.has(id) && !archived.has(id));
            if (ungrouped.length === 0) return null;
            return React.createElement('div', { className: 'sbm-ws' },
              React.createElement('div', { className: 'sbm-wsHead' },
                React.createElement('span', { className: 'sbm-wsTitle' }, '未分组'),
                React.createElement('span', { className: 'sbm-wsCount' }, ungrouped.length),
              ),
              ungrouped.map(sessionRow),
            );
          })(),
        );
      }

      const menuItems = [];
      if (menu) {
        if (menu.kind === 'sess') {
          menuItems.push({ t: '打开', fn: () => actOpen(menu.id) });
          menuItems.push({ t: '改名…', fn: () => actRename('sess', menu.id) });
          menuItems.push({ t: '归档', fn: () => actArchive(menu.id) });
          menuItems.push({ t: '分叉为新会话', fn: () => actFork(menu.id) });
          if (items.some((w) => (w.sessionIds || []).indexOf(menu.id) >= 0)) {
            menuItems.push({ t: '上移', fn: () => actMoveSession(menu.id, -1) });
            menuItems.push({ t: '下移', fn: () => actMoveSession(menu.id, 1) });
          }
          const s = byId[menu.id];
          if (s && s.cwd) menuItems.push({ t: '在文件管理器中打开', fn: () => actOpenPath(menu.id) });
        } else if (menu.kind === 'ws') {
          menuItems.push({ t: '改名…', fn: () => actRename('ws', menu.id) });
          menuItems.push({ t: '新建会话', fn: () => actNewSession(menu.id) });
          menuItems.push({ t: '上移', fn: () => actMoveWs(menu.id, -1) });
          menuItems.push({ t: '下移', fn: () => actMoveWs(menu.id, 1) });
          menuItems.push({ t: '删除注册…', fn: () => actDeleteWs(menu.id) });
        }
      }

      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'sbm-root' },
          React.createElement('div', { className: 'sbm-head' },
            React.createElement('span', { className: 'sbm-title' }, '工作区'),
            React.createElement('button', { className: 'sbm-iconBtn', title: '新建工作区', onClick: actNewWorkspace }, '⊕'),
          ),
          React.createElement('input', {
            className: 'sbm-search',
            placeholder: '搜索会话内容…',
            value: query,
            onChange: (e) => { setQuery(e.target.value); if (!e.target.value.trim()) setHits(null); },
            onKeyDown: (e) => { if (e.key === 'Enter') doSearch(); },
          }),
          React.createElement('div', { className: 'sbm-scroll' }, body),
        ),
        menu && React.createElement('div', { className: 'sbm-menu', style: { left: menu.x, top: menu.y } },
          menuItems.map((mi) => React.createElement('div', { key: mi.t, className: 'sbm-mi', onClick: mi.fn }, mi.t)),
        ),
        toast && React.createElement('div', { className: 'sbm-toast' }, toast),
      );
    }

    slots.inject('sidebar.workspaces', () => slots.register(
      { name: 'sidebar.workspaces', priority: -1 },
      (props) => React.createElement(ShadowBrowser, {
        useSessions: props.useSessions,
        useWorkspaces: props.useWorkspaces,
        wide: props.wide,
        expandSidebar: props.expandSidebar,
      }),
    ));
  },
};
