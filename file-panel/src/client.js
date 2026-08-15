// ============================================================================
// 文件树浏览面板 — Client 半边(动态版 v2)
// ----------------------------------------------------------------------------
// 用法:作为 cordis_define 的 code.client 传入(函数体,返回 Cordis Plugin)。
//
// 职责:
//  1. 注册进 shell.overlay(root 级浮动层):
//     页面右侧中间浮动 📁 小按钮,点击滑出右侧文件栏(300px 动画过渡);
//  2. 文件栏以当前会话 cwd 为根(useSessions 标准 props),目录懒加载可展开;
//  3. 每个文件/文件夹行右侧 ⋯ 按钮 → 菜单:
//     复制文件地址(navigator.clipboard,失败回退 execCommand)/
//     打开文件浏览器查看(host.call filetree:reveal)。
//
// v2 变更:
//  - 图标贴面板左缘(open 时 right:310px,随面板动画过渡);
//  - 面板实底(--dsw-alias-bg-layer-1),行悬停用 layer-2(深色主题更亮,不再发黑);
//  - 每次点击 📁 都刷新根目录;面板打开时每 30s 自动刷新(root + 已展开目录)。
//
// 依赖两个 Host RPC:filetree:list / filetree:reveal。
// 注意:组件函数定义在 apply 内部以闭包捕获 ctx(模块顶层没有 ctx)。
// ============================================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    styles.insert(`
.ftp-fab{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:2000;pointer-events:auto;width:38px;height:38px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);transition:right .18s ease-out,background .12s,border-color .12s}
.ftp-fab:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.ftp-fab.active{background:rgba(37,99,235,.14);border-color:rgba(37,99,235,.5)}
.ftp-fab.panel-open{right:310px}
.ftp-panel{position:fixed;top:0;right:0;bottom:0;width:300px;max-width:86vw;z-index:1990;pointer-events:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-10px 0 32px rgba(0,0,0,.18);transform:translateX(105%);transition:transform .18s ease-out;color:var(--dsw-alias-label-primary);font-family:Inter,var(--dsw-font-family);font-size:12px}
.ftp-panel.open{transform:translateX(0)}
.ftp-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.ftp-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.ftp-btn{width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center}
.ftp-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.ftp-body{flex:1;overflow-y:auto;padding:6px 4px}
.ftp-root{font-size:11px;color:var(--dsw-alias-label-secondary);padding:4px 8px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:4px;word-break:break-all}
.ftp-row{display:flex;align-items:center;gap:4px;height:26px;padding:0 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.ftp-row:hover{background:var(--dsw-alias-bg-layer-2)}
.ftp-arrow{width:14px;flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);text-align:center;display:inline-flex;justify-content:center}
.ftp-ic{flex:none;font-size:13px;width:18px;text-align:center}
.ftp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.ftp-dots{flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;opacity:0;display:flex;align-items:center;justify-content:center}
.ftp-row:hover .ftp-dots,.ftp-dots.show{opacity:1}
.ftp-dots:hover{background:var(--dsw-alias-bg-layer-2)}
.ftp-hint{font-size:11px;color:var(--dsw-alias-label-secondary);padding:10px 12px}
.ftp-empty{font-size:11px;color:var(--dsw-alias-label-secondary);padding:8px 12px}
.ftp-err{font-size:11px;color:#e5484d;padding:6px 12px;word-break:break-all}
.ftp-menu{position:fixed;z-index:2100;pointer-events:auto;min-width:172px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:4px;color:var(--dsw-alias-label-primary);font-size:12px}
.ftp-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.ftp-mi:hover{background:var(--dsw-alias-bg-layer-2)}
.ftp-toast{position:fixed;right:14px;bottom:18px;z-index:2200;pointer-events:none;background:rgba(0,0,0,.82);color:#fff;font-size:12px;padding:7px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:60vw;word-break:break-all;font-family:Inter,var(--dsw-font-family)}
`);

    function FileTreePanel(props) {
      const useSessions = props.useSessions;
      const snap = typeof useSessions === 'function' ? useSessions((s) => s) : null;
      const cwd = snap && snap.current && snap.byId[snap.current] ? (snap.byId[snap.current].cwd || null) : null;

      const [open, setOpen] = React.useState(false);
      const [root, setRoot] = React.useState(null);
      const [tree, setTree] = React.useState({});
      const [expanded, setExpanded] = React.useState({});
      const [menu, setMenu] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const prevCwd = React.useRef(null);
      const loading = React.useRef({});

      const showToast = (text) => {
        setToast(text);
        ctx.timeout(() => setToast(null), 2400);
      };

      const loadDir = async (path) => {
        if (loading.current[path]) return;
        loading.current[path] = true;
        setTree((t) => ({ ...t, [path]: { loading: true, error: null, items: (t[path] && t[path].items) || [] } }));
        let res = null;
        try {
          res = await host.call('filetree:list', { path });
        } catch (e) {
          res = null;
        }
        delete loading.current[path];
        const ok = res && res.ok;
        setTree((t) => ({ ...t, [path]: { loading: false, error: ok ? null : ((res && res.error) || '加载失败'), items: ok ? (res.items || []) : [] } }));
      };

      const refresh = () => {
        if (!root) return;
        const paths = [root];
        for (const p of Object.keys(expanded)) paths.push(p);
        paths.forEach((p) => loadDir(p));
      };
      const refreshRef = React.useRef(refresh);
      refreshRef.current = refresh;

      React.useEffect(() => {
        if (cwd === prevCwd.current) return;
        prevCwd.current = cwd;
        setTree({});
        setExpanded({});
        setRoot(cwd);
        if (cwd) loadDir(cwd);
      }, [cwd, open]);

      React.useEffect(() => {
        if (open && root && !tree[root]) loadDir(root);
      }, [open, root, tree]);

      // 打开时每 30s 自动刷新(root + 已展开目录)
      React.useEffect(() => {
        if (!open) return;
        const dispose = ctx.interval(() => refreshRef.current(), 30000);
        return dispose;
      }, [open]);

      React.useEffect(() => {
        if (!menu) return;
        const onDown = (ev) => {
          if (ev.target && ev.target.closest && ev.target.closest('.ftp-menu')) return;
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

      const toggleDir = (path) => {
        if (!expanded[path]) {
          loadDir(path);
          setExpanded((e) => ({ ...e, [path]: true }));
        } else {
          const ne = { ...expanded };
          delete ne[path];
          setExpanded(ne);
        }
      };

      const copyPath = async (path) => {
        let done = false;
        try {
          await navigator.clipboard.writeText(path);
          done = true;
        } catch (e) {
          try {
            const ta = document.createElement('textarea');
            ta.value = path;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            done = document.execCommand('copy');
            document.body.removeChild(ta);
          } catch (e2) {
            done = false;
          }
        }
        showToast(done ? '已复制: ' + path : '复制失败');
        setMenu(null);
      };

      const reveal = async (path, kind) => {
        let res = null;
        try {
          res = await host.call('filetree:reveal', { path, kind });
        } catch (e) {
          res = null;
        }
        showToast(res && res.ok ? '已打开文件管理器' : ((res && res.error) || '打开失败'));
        setMenu(null);
      };

      const openMenu = (e, item) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ path: item.path, kind: item.kind, name: item.name, x: Math.min(r.right, window.innerWidth - 180), y: r.bottom + 4 });
      };

      const renderRows = (items, depth) => {
        const rows = [];
        for (const it of items) {
          const isDir = it.kind === 'dir';
          const isOpen = !!expanded[it.path];
          const node = tree[it.path];
          rows.push(React.createElement('div', { key: it.path, className: 'ftp-row', style: { paddingLeft: 8 + depth * 14 }, onClick: isDir ? () => toggleDir(it.path) : undefined, title: it.path },
            React.createElement('span', { className: 'ftp-arrow' }, isDir ? (isOpen ? '▾' : '▸') : ''),
            React.createElement('span', { className: 'ftp-ic' }, isDir ? '📁' : (it.kind === 'other' ? '❔' : '📄')),
            React.createElement('span', { className: 'ftp-name' }, it.name),
            React.createElement('button', { className: 'ftp-dots' + (menu && menu.path === it.path ? ' show' : ''), onClick: (e) => openMenu(e, it) }, '⋯'),
          ));
          if (isDir && isOpen) {
            if (!node || node.loading) rows.push(React.createElement('div', { key: it.path + ':load', className: 'ftp-hint', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '加载中…'));
            else if (node.error) rows.push(React.createElement('div', { key: it.path + ':err', className: 'ftp-err', style: { paddingLeft: 8 + (depth + 1) * 14 } }, node.error));
            else if (node.items && node.items.length === 0) rows.push(React.createElement('div', { key: it.path + ':empty', className: 'ftp-empty', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '（空）'));
            else if (node.items) rows.push(...renderRows(node.items, depth + 1));
          }
        }
        return rows;
      };

      const rootNode = root ? tree[root] : null;
      let body = null;
      if (!root) body = React.createElement('div', { className: 'ftp-hint' }, '未选择会话，无法确定工作目录');
      else if (!rootNode || rootNode.loading) body = React.createElement('div', { className: 'ftp-hint' }, '加载中…');
      else if (rootNode.error) body = React.createElement('div', { className: 'ftp-err' }, rootNode.error);
      else if (!rootNode.items || rootNode.items.length === 0) body = React.createElement('div', { className: 'ftp-empty' }, '（空目录）');
      else body = renderRows(rootNode.items, 0);

      return React.createElement(React.Fragment, null,
        React.createElement('button', { className: 'ftp-fab' + (open ? ' active panel-open' : ''), title: '文件浏览器', onClick: () => { setOpen(!open); refresh(); } }, '📁'),
        React.createElement('div', { className: 'ftp-panel' + (open ? ' open' : '') },
          React.createElement('div', { className: 'ftp-head' },
            React.createElement('span', { className: 'ftp-title' }, '文件浏览器'),
            React.createElement('button', { className: 'ftp-btn', title: '刷新', onClick: refresh }, '⟳'),
            React.createElement('button', { className: 'ftp-btn', title: '关闭', onClick: () => setOpen(false) }, '✕'),
          ),
          root ? React.createElement('div', { className: 'ftp-root' }, root) : null,
          React.createElement('div', { className: 'ftp-body' }, body),
        ),
        menu && React.createElement('div', { className: 'ftp-menu', style: { left: menu.x, top: menu.y } },
          React.createElement('div', { className: 'ftp-mi', onClick: () => copyPath(menu.path) }, '📋 复制文件地址'),
          React.createElement('div', { className: 'ftp-mi', onClick: () => reveal(menu.path, menu.kind) }, '🖥️ 打开文件浏览器查看'),
        ),
        toast && React.createElement('div', { className: 'ftp-toast' }, toast),
      );
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'filetree-panel', order: 100 },
      (props) => React.createElement(FileTreePanel, { useSessions: props.useSessions }),
    ));
  },
};
