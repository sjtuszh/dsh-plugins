// dsh-session-organizer dynamic plugin — CLIENT half (v3).
// Hierarchy: workspace → [user group → sessions] + loose sessions.
// Interaction (no timers):
//   - drop a session on another session's MIDDLE band → create a group "新建分组"
//     with both (workspace-scoped: only when both sessions share a workspace)
//   - drop on the TOP/BOTTOM band of a session → insert before/after that session
//     (same account = reorder; different account = move the session between
//      groups / workspace loose list / ungrouped)
//   - drop on a group header → add the dragged session to that group
//   - a group that ends up with ≤1 session auto-dissolves (its session returns
//     to the workspace loose list)
//   - three-dot menus auto-close on pointer leave / outside click
//   - session three-dot menu: rename / fork / archive (no file-manager item)
// State persists through the Host half (host.call 'org-load' / 'org-save').

return {
  apply(ctx) {
    const stylesDispose = styles.insert(`
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
`);

    const sessionsService = ctx.get('sessions');
    const workspacesService = ctx.get('workspaces');

    const SESSION_ICON = '\u{1F454}'; // necktie 👔
    const WORKSPACE_ICON = '\u{1F4C2}'; // open folder 📂
    const NEW_GROUP_NAME = '新建分组';

    // stable per-group dot color (hashed id) + size grows with session count
    const groupColor = (id) => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      return 'hsl(' + (h % 360) + ', 70%, 55%)';
    };
    const groupSize = (count) => Math.min(20, 8 + Math.min(count, 8) * 1.5);

    // ---- persisted view state (groups nested under a workspace + per-account order) ----
    let persisted = { groups: [], order: {} };
    const loadState = async () => {
      try {
        const r = await host.call('org-load', {});
        if (r && typeof r === 'object' && Array.isArray(r.groups)) {
          persisted = { groups: r.groups.filter((g) => g && typeof g.workspaceId === 'string'), order: r.order || {} };
        }
      } catch (e) { /* first run: no state yet */ }
    };
    const saveState = (next) => {
      persisted = next;
      host.call('org-save', { state: next }).catch(() => {});
    };

    // ---- small primitives ----
    function Menu({ items, onPick, onClose, x, y }) {
      return React.createElement('div', {
        className: 'sorg-menu',
        style: { left: x, top: y },
        onClick: (e) => e.stopPropagation(),
        onMouseLeave: onClose,
      }, items.map((item) => React.createElement('div', {
        key: item.id,
        className: 'sorg-mi' + (item.danger ? ' sorg-danger' : ''),
        onClick: () => { onClose(); onPick(item.id); },
      }, item.label)));
    }

    function Modal({ title, children, footer }) {
      return React.createElement('div', {
        className: 'sorg-mask',
        onClick: (e) => { if (e.target === e.currentTarget) footer.cancel(); },
      }, React.createElement('div', { className: 'sorg-modal' },
        React.createElement('div', { className: 'sorg-modal-title' }, title),
        children,
        React.createElement('div', { className: 'sorg-modal-actions' },
          React.createElement('button', { type: 'button', className: 'sorg-btn', onClick: footer.cancel }, '取消'),
          footer.confirm)));
    }

    // ---- main browser ----
    function Browser({ wide, expandSidebar, useSessions, useWorkspaces }) {
      const list = useSessions((s) => s);
      const wsState = useWorkspaces((s) => s);
      const [groups, setGroups] = React.useState(persisted.groups);
      const [order, setOrder] = React.useState(persisted.order);
      const [menu, setMenu] = React.useState(null); // { kind, x, y, id }
      const [modal, setModal] = React.useState(null); // { kind, payload }
      const [draft, setDraft] = React.useState('');
      const [drag, setDrag] = React.useState(null); // { sessionId, fromKey, over: {id, half} }
      const [dragOverGroup, setDragOverGroup] = React.useState(null); // group id highlight

      React.useEffect(() => {
        loadState().then(() => {
          setGroups(persisted.groups || []);
          setOrder(persisted.order || {});
        });
      }, []);

      // close menu when clicking anywhere outside it
      React.useEffect(() => {
        if (menu === null) return;
        const onDocClick = () => setMenu(null);
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
      }, [menu]);

      const persist = (nextGroups, nextOrder) => {
        setGroups(nextGroups);
        setOrder(nextOrder);
        saveState({ groups: nextGroups, order: nextOrder });
      };

      const current = list && list.current;
      const archived = new Set((wsState && wsState.archivedSessionIds) || []);
      const workspaces = (wsState && wsState.items) || [];
      const byId = (list && list.byId) || {};

      // sessionId → workspaceId (first workspace wins)
      const workspaceOf = {};
      for (const ws of workspaces) for (const id of ws.sessionIds) {
        if (workspaceOf[id] === undefined) workspaceOf[id] = ws.workspaceId;
      }

      const visible = (id) => {
        const s = byId[id];
        if (!s) return false;
        if (s.origin === 'subagent') return false;
        if (archived.has(id)) return false;
        if (s.blank && id !== current) return false;
        return true;
      };
      const titleOf = (id) => {
        const s = byId[id];
        if (!s) return id;
        return s.blank ? '新会话' : (s.displayTitle || id);
      };
      const timeOf = (id) => {
        const s = byId[id];
        if (!s || !s.updatedAt) return '';
        const diff = Date.now() - s.updatedAt;
        const m = Math.floor(diff / 6e4);
        if (m < 1) return '现在';
        if (m < 60) return m + '分';
        if (m < 1440) return Math.floor(m / 60) + '时';
        return Math.floor(m / 1440) + '天';
      };

      const [expanded, setExpanded] = React.useState({});
      const toggleExpanded = (key) => {
        setExpanded((e) => {
          const next = { ...e, [key]: !e[key] };
          if (key.startsWith('g:')) {
            const id = key.slice(2);
            persist(groups.map((g) => g.id === id ? { ...g, expanded: next[key] } : g), order);
          }
          return next;
        });
      };
      const isExpanded = (key) => expanded[key] !== false;

      // account key a session currently lives in: 'g:<id>' (user group) |
      // 'w:<wsId>' (workspace loose) | '' (ungrouped)
      const accountOf = {};
      for (const g of groups) for (const id of g.sessionIds) accountOf[id] = 'g:' + g.id;
      for (const ws of workspaces) for (const id of ws.sessionIds) {
        if (accountOf[id] === undefined) accountOf[id] = 'w:' + ws.workspaceId;
      }

      // sessions that live in some user group
      const groupedMembers = new Set();
      for (const g of groups) for (const id of g.sessionIds) groupedMembers.add(id);

      // ---- persistence helpers ----
      const sweepGroups = (gs, ord) => {
        // dissolve groups with ≤1 session; drop their order keys
        const kept = [];
        const nextOrder = { ...ord };
        for (const g of gs) {
          const alive = g.sessionIds.filter((id) => byId[id] !== undefined && visible(id));
          if (alive.length < 2) {
            delete nextOrder['g:' + g.id];
            continue;
          }
          if (alive.length !== g.sessionIds.length) g.sessionIds = alive;
          kept.push(g);
        }
        return { groups: kept, order: nextOrder };
      };

      const orderedIn = (key, members) => {
        if (order[key] === undefined) return members;
        const listed = order[key].filter((id) => members.includes(id));
        return listed.concat(members.filter((id) => !listed.includes(id)));
      };

      // ---- mutations ----
      const createGroup = (draggedId, targetId) => {
        const draggedWs = workspaceOf[draggedId];
        const targetWs = workspaceOf[targetId];
        if (draggedId === targetId || draggedWs === undefined || targetWs !== draggedWs) return;
        const id = 'g' + Date.now();
        const nextGroups = groups.filter((g) => !g.sessionIds.includes(draggedId) && !g.sessionIds.includes(targetId));
        nextGroups.push({ id, name: NEW_GROUP_NAME, workspaceId: draggedWs, sessionIds: [draggedId, targetId], expanded: true });
        const nextOrder = { ...order };
        nextOrder['g:' + id] = [draggedId, targetId];
        const swept = sweepGroups(nextGroups, nextOrder);
        persist(swept.groups, swept.order);
      };

      const moveSession = (sessionId, toKey, anchor) => {
        // workspace-boundary guard: a session may only move inside its own
        // workspace's accounts (a group or the loose list of ITS workspace),
        // or into ungrouped only when it belongs to no workspace.
        const srcWs = workspaceOf[sessionId];
        let allowed = true;
        if (toKey.startsWith('g:')) {
          const g = groups.find((gg) => gg.id === toKey.slice(2));
          allowed = g !== undefined && g.workspaceId === srcWs;
        } else if (toKey.startsWith('w:')) {
          allowed = toKey.slice(2) === srcWs;
        } else {
          allowed = srcWs === undefined;
        }
        if (!allowed) return;
        // remove the session from its current account
        let nextGroups = groups;
        let nextOrder = { ...order };
        const fromKey = accountOf[sessionId];
        if (fromKey !== undefined && fromKey.startsWith('g:')) {
          const gid = fromKey.slice(2);
          nextGroups = groups.map((g) => g.id === gid ? { ...g, sessionIds: g.sessionIds.filter((id) => id !== sessionId) } : g);
          if (nextOrder[fromKey] !== undefined) nextOrder[fromKey] = nextOrder[fromKey].filter((id) => id !== sessionId);
        } else if (fromKey !== undefined && nextOrder[fromKey] !== undefined) {
          nextOrder[fromKey] = nextOrder[fromKey].filter((id) => id !== sessionId);
        }
        // join the target account
        if (toKey.startsWith('g:')) {
          const gid = toKey.slice(2);
          nextGroups = nextGroups.map((g) => g.id === gid && !g.sessionIds.includes(sessionId)
            ? { ...g, sessionIds: [...g.sessionIds, sessionId] } : g);
        }
        const membersOf = (key) => {
          if (key.startsWith('g:')) {
            const g = nextGroups.find((gg) => gg.id === key.slice(2));
            return g ? g.sessionIds.filter((id) => byId[id] !== undefined && visible(id)) : [];
          }
          if (key.startsWith('w:')) {
            const ws = workspaces.find((ww) => ww.workspaceId === key.slice(2));
            return ws ? ws.sessionIds.filter((id) => byId[id] !== undefined && visible(id) && !groupedMembers.has(id)) : [];
          }
          return (list && list.ids || []).filter((id) => byId[id] !== undefined && visible(id) && accountOf[id] === undefined);
        };
        const members = membersOf(toKey);
        const without = members.filter((id) => id !== sessionId);
        const anchorIndex = anchor === undefined ? without.length : without.indexOf(anchor);
        without.splice(anchorIndex === -1 ? without.length : anchorIndex, 0, sessionId);
        nextOrder[toKey] = without;
        const swept = sweepGroups(nextGroups, nextOrder);
        persist(swept.groups, swept.order);
        // mirror into the host workspace order when the target is a workspace loose list
        if (toKey.startsWith('w:') && workspacesService) {
          workspacesService.insertSessionBefore(toKey.slice(2), sessionId, anchor).catch(() => {});
        }
      };

      const insertAt = (key, sessionId, anchor) => {
        if ((accountOf[sessionId] ?? '') === key) {
          // same-account reorder
          const members = key === '' ? (list && list.ids || []).filter((id) => byId[id] !== undefined && visible(id) && accountOf[id] === undefined)
            : key.startsWith('g:')
              ? (groups.find((g) => g.id === key.slice(2))?.sessionIds || []).filter((id) => byId[id] !== undefined && visible(id))
              : (workspaces.find((ws) => ws.workspaceId === key.slice(2))?.sessionIds || []).filter((id) => byId[id] !== undefined && visible(id) && !groupedMembers.has(id));
          const ids = order[key] !== undefined ? order[key].filter((id) => members.includes(id)) : members;
          const without = ids.filter((id) => id !== sessionId);
          const anchorIndex = anchor === undefined ? without.length : without.indexOf(anchor);
          without.splice(anchorIndex === -1 ? without.length : anchorIndex, 0, sessionId);
          const nextOrder = { ...order, [key]: without };
          persist(groups, nextOrder);
          if (key.startsWith('w:') && workspacesService) {
            workspacesService.insertSessionBefore(key.slice(2), sessionId, anchor).catch(() => {});
          }
        } else {
          moveSession(sessionId, key, anchor);
        }
      };

      // ---- drag & drop ----
      const onRowDragStart = (e, sessionId, key) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', sessionId);
        setDrag({ sessionId, fromKey: key, over: null });
      };
      const onRowDragOver = (e, sessionId) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        // inside a group, dragging between its own sessions only reorders:
        // the center "create group" zone is disabled for same-group pairs.
        const draggedAccount = accountOf[drag.sessionId] ?? '';
        const targetAccount = accountOf[sessionId] ?? '';
        const sameGroup = draggedAccount.startsWith('g:') && draggedAccount === targetAccount;
        const half = sameGroup
          ? (ratio < 0.5 ? 'before' : 'after')
          : (ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'center');
        setDrag((d) => d ? { ...d, over: { id: sessionId, half } } : d);
      };
      const onRowDrop = (e, targetId) => {
        if (!drag) return;
        e.preventDefault();
        const half = drag.over && drag.over.id === targetId ? drag.over.half : null;
        setDrag(null);
        if (half === 'center') {
          createGroup(drag.sessionId, targetId);
          return;
        }
        if (half !== 'before' && half !== 'after') return;
        const toKey = accountOf[targetId] ?? '';
        insertAt(toKey, drag.sessionId, half === 'before' ? targetId : undefined);
      };
      const onGroupHeaderDrop = (e, gid) => {
        if (!drag) return;
        e.preventDefault();
        setDragOverGroup(null);
        setDrag(null);
        if (drag.sessionId === '') return;
        moveSession(drag.sessionId, 'g:' + gid, undefined);
      };
      const onRowDragEnd = () => {
        setDragOverGroup(null);
        setDrag(null);
      };

      // ---- actions ----
      const openSession = (id) => { if (sessionsService) sessionsService.open(id); };
      const renameSession = (id) => { setModal({ kind: 'session-rename', id, title: titleOf(id) }); setDraft(titleOf(id)); };
      const forkSession = (id) => {
        if (!sessionsService) return;
        sessionsService.fork({ sessionId: id, increaseTitle: true }).then((childId) => sessionsService.open(childId)).catch(() => {});
      };
      const archiveSession = (id) => {
        if (workspacesService) workspacesService.archiveSession(id).catch((e) => console.error('archive failed', e));
      };
      const confirmRename = () => {
        const name = draft.trim();
        if (modal === null || name === '') return;
        if (modal.kind === 'session-rename') {
          const binding = sessionsService && sessionsService.binding(modal.id);
          if (binding && binding.session && typeof binding.session.rename === 'function') {
            binding.session.rename(name).then(() => setModal(null)).catch((e) => console.error('rename failed', e));
          } else setModal(null);
        } else if (modal.kind === 'group-rename') {
          persist(groups.map((g) => g.id === modal.id ? { ...g, name } : g), order);
          setModal(null);
        } else if (modal.kind === 'group-delete') {
          persist(groups.filter((g) => g.id !== modal.id), order);
          setModal(null);
        }
      };

      const openMenuAt = (e, menu) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ ...menu, x: r.right, y: r.top });
      };
      const groupMenu = (e, g) => openMenuAt(e, {
        kind: 'group', id: g.id, items: [
          { id: 'rename', label: '重命名分组' },
          { id: 'delete', label: '删除分组', danger: true },
        ],
      });
      const sessionMenu = (e, id) => openMenuAt(e, {
        kind: 'session', id, items: [
          { id: 'rename', label: '重命名' },
          { id: 'fork', label: '复制会话' },
          { id: 'archive', label: '归档会话' },
        ],
      });
      const onMenuPick = (id) => {
        const m = menu;
        if (!m) return;
        if (m.kind === 'group') {
          if (id === 'rename') { setModal({ kind: 'group-rename', id: m.id }); setDraft(groups.find((g) => g.id === m.id)?.name || ''); }
          if (id === 'delete') setModal({ kind: 'group-delete', id: m.id, name: groups.find((g) => g.id === m.id)?.name || '' });
        } else {
          if (id === 'rename') renameSession(m.id);
          if (id === 'fork') forkSession(m.id);
          if (id === 'archive') archiveSession(m.id);
        }
      };

      // ---- render helpers ----
      const row = (key, id) => {
        const marker = drag && drag.over && drag.over.id === id ? drag.over.half : null;
        return React.createElement('div', {
          key: id,
          className: 'sorg-row sorg-title-sm'
            + (id === current ? ' sorg-sel' : '')
            + (drag && drag.sessionId === id ? ' sorg-ghost' : '')
            + (marker === 'center' ? ' sorg-dropOn' : ''),
          draggable: true,
          onClick: () => openSession(id),
          onDragStart: (e) => onRowDragStart(e, id, key),
          onDragOver: (e) => onRowDragOver(e, id),
          onDrop: (e) => onRowDrop(e, id),
          onDragEnd: onRowDragEnd,
          children: [
            marker === 'before' && React.createElement('div', { key: 'ln', className: 'sorg-line sorg-line-top' }),
            marker === 'after' && React.createElement('div', { key: 'ln', className: 'sorg-line sorg-line-bottom' }),
            React.createElement('span', { className: 'sorg-ico' }, SESSION_ICON),
            React.createElement('span', { className: 'sorg-name' }, titleOf(id)),
            React.createElement('span', { className: 'sorg-time' }, timeOf(id)),
            React.createElement('button', { type: 'button', className: 'sorg-dots', onClick: (e) => sessionMenu(e, id) }, '\u22EF'),
          ],
        });
      };

      const userGroupNode = (g) => {
        const key = 'g:' + g.id;
        const sessions = orderedIn(key, g.sessionIds.filter(visible));
        const expandedNow = g.expanded !== false;
        const overGroup = drag && dragOverGroup === g.id;
        const dotSize = groupSize(sessions.length);
        return React.createElement('div', { key, className: 'sorg-grp' },
          React.createElement('div', {
            className: 'sorg-row' + (overGroup ? ' sorg-dropGroup' : ''),
            onClick: () => toggleExpanded(key),
            onDragOver: (e) => {
              if (!drag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverGroup(g.id);
            },
            onDragLeave: () => { if (dragOverGroup === g.id) setDragOverGroup(null); },
            onDrop: (e) => onGroupHeaderDrop(e, g.id),
            onDragEnd: onRowDragEnd,
          },
            React.createElement('span', { className: 'sorg-caret' }, expandedNow ? '\u25BE' : '\u25B8'),
            React.createElement('span', {
              className: 'sorg-dot',
              style: { '--sorg-dot-color': groupColor(g.id), width: dotSize, height: dotSize },
            }),
            React.createElement('span', { className: 'sorg-name' }, g.name),
            React.createElement('span', { className: 'sorg-time' }, String(sessions.length)),
            React.createElement('button', { type: 'button', className: 'sorg-dots sorg-show', onClick: (e) => groupMenu(e, g) }, '\u22EF'),
          ),
          expandedNow && React.createElement('div', { className: 'sorg-sub' }, sessions.map((id) => row(key, id))),
        );
      };

      const workspaceNode = (ws) => {
        const key = 'w:' + ws.workspaceId;
        const wsGroups = groups.filter((g) => g.workspaceId === ws.workspaceId);
        const looseSessions = orderedIn(key, ws.sessionIds.filter((id) => visible(id) && !groupedMembers.has(id)));
        const expandedNow = isExpanded(key);
        return React.createElement('div', { key, className: 'sorg-grp' },
          React.createElement('div', { className: 'sorg-row', onClick: () => toggleExpanded(key) },
            React.createElement('span', { className: 'sorg-caret' }, expandedNow ? '\u25BE' : '\u25B8'),
            React.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
            React.createElement('span', { className: 'sorg-name' }, ws.title),
            React.createElement('span', { className: 'sorg-time' }, String(ws.sessionIds.filter(visible).length)),
          ),
          expandedNow && React.createElement('div', { className: 'sorg-sub' },
            wsGroups.map(userGroupNode),
            looseSessions.map((id) => row(key, id)),
          ),
        );
      };

      const accounted = new Set(Object.keys(accountOf));
      const stray = (list && list.ids || []).filter((id) => byId[id] !== undefined && !accounted.has(id) && visible(id));
      const ungroupedKey = '';
      const ungroupedSessions = orderedIn(ungroupedKey, stray);

      if (!wide) {
        return React.createElement('div', { className: 'sorg-rail', onClick: () => expandSidebar() }, WORKSPACE_ICON);
      }

      const modalTitle = modal && (modal.kind === 'group-rename' ? '重命名分组' : modal.kind === 'group-delete' ? '删除分组' : '重命名会话');
      return React.createElement('div', { className: 'sorg-root' },
        React.createElement('div', { className: 'sorg-head' },
          React.createElement('span', { className: 'sorg-title' }, '会话'),
          React.createElement('span', { className: 'sorg-hint' }, '拖拽排序 · 放会话中间建组'),
        ),
        React.createElement('div', { className: 'sorg-list' },
          (workspaces.length === 0 && ungroupedSessions.length === 0 && groups.length === 0)
            && React.createElement('div', { className: 'sorg-empty' }, '暂无会话'),
          workspaces.map(workspaceNode),
          ungroupedSessions.length > 0 && React.createElement('div', { key: ungroupedKey, className: 'sorg-grp' },
            React.createElement('div', { className: 'sorg-row', onClick: () => toggleExpanded(ungroupedKey) },
              React.createElement('span', { className: 'sorg-caret' }, isExpanded(ungroupedKey) ? '\u25BE' : '\u25B8'),
              React.createElement('span', { className: 'sorg-ico' }, WORKSPACE_ICON),
              React.createElement('span', { className: 'sorg-name' }, '未分组'),
              React.createElement('span', { className: 'sorg-time' }, String(ungroupedSessions.length)),
            ),
            isExpanded(ungroupedKey) && React.createElement('div', { className: 'sorg-sub' }, ungroupedSessions.map((id) => row(ungroupedKey, id))),
          ),
        ),
        menu && React.createElement(Menu, { items: menu.items, onPick: onMenuPick, onClose: () => setMenu(null), x: menu.x, y: menu.y }),
        modal && React.createElement(Modal, {
          title: modalTitle,
          footer: {
            cancel: () => setModal(null),
            confirm: React.createElement('button', {
              type: 'button',
              className: 'sorg-btn sorg-primary',
              disabled: modal.kind !== 'group-delete' && draft.trim() === '',
              onClick: confirmRename,
            }, modal.kind === 'group-delete' ? '删除' : '确定'),
          },
          children: modal.kind === 'group-delete'
            ? React.createElement('div', null, '删除分组"' + (modal.name || '') + '"？其中的会话会回到工作区里。')
            : React.createElement('input', {
                className: 'sorg-input',
                value: draft,
                autoFocus: true,
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') confirmRename(); },
              }),
        }),
      );
    }

    const slots = ctx.get('slots');
    if (slots === undefined) return;
    slots.inject('sidebar.workspaces', () => slots.register(
      { name: 'sidebar.workspaces', priority: -2 },
      (props) => React.createElement(Browser, props),
    ));
  },
};
