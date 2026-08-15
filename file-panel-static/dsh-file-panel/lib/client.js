// ============================================================================
// 文件树浏览面板 — Client 半边(静态版 bundle)
// ----------------------------------------------------------------------------
// 注册进 shell.overlay(root 级浮动层):
//  1. 右侧浮动 📁 小按钮,点击滑出右侧文件栏;
//  2. 文件栏以当前会话 cwd 为根(useSessions 标准 props),目录懒加载;
//  3. 每个文件/文件夹行右侧 ⋯ 菜单:复制文件地址 / 打开文件浏览器查看。
// RPC 走 Typert remote(ctx.remote.filetree.*),由 dsh-file-panel-mount 包
// 挂载描述符;本包只消费(inject ["remote","remote.filetree"]),避免自依赖死锁。
// 注意:组件定义在 apply 内部闭包捕获 ctx(模块顶层没有 ctx)。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-file-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var CSS = `
.ftp-fab{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:2000;pointer-events:auto;width:38px;height:38px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);transition:background .12s,border-color .12s}
.ftp-fab:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.ftp-fab.active{background:rgba(37,99,235,.14);border-color:rgba(37,99,235,.5)}
.ftp-panel{position:fixed;top:0;right:0;bottom:0;width:300px;max-width:86vw;z-index:1990;pointer-events:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-10px 0 32px rgba(0,0,0,.18);transform:translateX(105%);transition:transform .18s ease-out;color:var(--dsw-alias-label-primary);font-family:Inter,var(--dsw-font-family);font-size:12px}
.ftp-panel.open{transform:translateX(0)}
.ftp-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.ftp-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.ftp-btn{width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center}
.ftp-btn:hover{background:var(--dsw-alias-bg-layer-1)}
.ftp-body{flex:1;overflow-y:auto;padding:6px 4px}
.ftp-root{font-size:11px;color:var(--dsw-alias-label-secondary);padding:4px 8px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:4px;word-break:break-all}
.ftp-row{display:flex;align-items:center;gap:4px;height:26px;padding:0 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.ftp-row:hover{background:var(--dsw-alias-bg-layer-1)}
.ftp-arrow{width:14px;flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);text-align:center;display:inline-flex;justify-content:center}
.ftp-ic{flex:none;font-size:13px;width:18px;text-align:center}
.ftp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.ftp-dots{flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;opacity:0;display:flex;align-items:center;justify-content:center}
.ftp-row:hover .ftp-dots,.ftp-dots.show{opacity:1}
.ftp-dots:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.ftp-hint{font-size:11px;color:var(--dsw-alias-label-secondary);padding:10px 12px}
.ftp-empty{font-size:11px;color:var(--dsw-alias-label-secondary);padding:8px 12px}
.ftp-err{font-size:11px;color:#e5484d;padding:6px 12px;word-break:break-all}
.ftp-menu{position:fixed;z-index:2100;pointer-events:auto;min-width:172px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:4px;color:var(--dsw-alias-label-primary);font-size:12px}
.ftp-mi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.ftp-mi:hover{background:var(--dsw-alias-bg-layer-1)}
.ftp-toast{position:fixed;right:14px;bottom:18px;z-index:2200;pointer-events:none;background:rgba(0,0,0,.82);color:#fff;font-size:12px;padding:7px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:60vw;word-break:break-all;font-family:Inter,var(--dsw-font-family)}
`;

    var CSS_ID = "dsh-file-panel/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-file-panel";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var inject = ["slots", "remote", "remote.filetree"];

    function apply(ctx) {
      function FileTreePanel(props) {
        var useSessions = props.useSessions;
        var snap = typeof useSessions === 'function' ? useSessions(function (s) { return s; }) : null;
        var cwd = snap && snap.current && snap.byId[snap.current] ? (snap.byId[snap.current].cwd || null) : null;

        var openState = react.useState(false);
        var open = openState[0];
        var setOpen = openState[1];
        var rootState = react.useState(null);
        var root = rootState[0];
        var setRoot = rootState[1];
        var treeState = react.useState({});
        var tree = treeState[0];
        var setTree = treeState[1];
        var expandedState = react.useState({});
        var expanded = expandedState[0];
        var setExpanded = expandedState[1];
        var menuState = react.useState(null);
        var menu = menuState[0];
        var setMenu = menuState[1];
        var toastState = react.useState(null);
        var toast = toastState[0];
        var setToast = toastState[1];
        var prevCwd = react.useRef(null);
        var loading = react.useRef({});

        function showToast(text) {
          setToast(text);
          window.setTimeout(function () { setToast(null); }, 2400);
        }

        function loadDir(path) {
          if (loading.current[path]) return;
          loading.current[path] = true;
          setTree(function (t) {
            var n = Object.assign({}, t);
            n[path] = { loading: true, error: null, items: (t[path] && t[path].items) || [] };
            return n;
          });
          var p = ctx.remote.filetree.list({ path: path });
          if (p && typeof p.then === 'function') {
            p.then(function (r) {
              delete loading.current[path];
              var res = r && r.ok ? r.value : null;
              setTree(function (t) {
                var n = Object.assign({}, t);
                n[path] = {
                  loading: false,
                  error: res ? null : ((r && r.error && (r.error.message || r.error.code)) || '加载失败'),
                  items: res && res.items ? res.items : [],
                };
                return n;
              });
            }, function () {
              delete loading.current[path];
              setTree(function (t) {
                var n = Object.assign({}, t);
                n[path] = { loading: false, error: '加载失败', items: [] };
                return n;
              });
            });
          } else {
            delete loading.current[path];
          }
        }

        react.useEffect(function () {
          if (cwd === prevCwd.current) return;
          prevCwd.current = cwd;
          setTree({});
          setExpanded({});
          setRoot(cwd);
          if (cwd) loadDir(cwd);
        }, [cwd, open]);

        react.useEffect(function () {
          if (open && root && !tree[root]) loadDir(root);
        }, [open, root, tree]);

        react.useEffect(function () {
          if (!menu) return;
          function onDown(ev) {
            if (ev.target && ev.target.closest && ev.target.closest('.ftp-menu')) return;
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

        function toggleDir(path) {
          if (!expanded[path]) {
            loadDir(path);
            setExpanded(function (e) { var n = Object.assign({}, e); n[path] = true; return n; });
          } else {
            var ne = Object.assign({}, expanded);
            delete ne[path];
            setExpanded(ne);
          }
        }

        function refresh() {
          if (!root) return;
          var paths = [root];
          for (var k in expanded) if (Object.prototype.hasOwnProperty.call(expanded, k)) paths.push(k);
          for (var i = 0; i < paths.length; i++) loadDir(paths[i]);
        }

        function copyPath(path) {
          function fallback() {
            var done = false;
            try {
              var ta = document.createElement('textarea');
              ta.value = path;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              done = document.execCommand('copy');
              document.body.removeChild(ta);
            } catch (e) {
              done = false;
            }
            showToast(done ? '已复制: ' + path : '复制失败');
            setMenu(null);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            var p = navigator.clipboard.writeText(path);
            if (p && typeof p.then === 'function') {
              p.then(function () { showToast('已复制: ' + path); setMenu(null); }, function () { fallback(); });
            } else {
              fallback();
            }
          } else {
            fallback();
          }
        }

        function reveal(path, kind) {
          var p = ctx.remote.filetree.reveal({ path: path, kind: kind });
          var finish = function (r) {
            var msg = '打开失败';
            if (r && r.ok && r.value) {
              msg = r.value.ok ? '已打开文件管理器' : (r.value.error || msg);
            } else if (r && r.error) {
              msg = r.error.message || r.error.code || msg;
            }
            showToast(msg);
            setMenu(null);
          };
          if (p && typeof p.then === 'function') {
            p.then(finish, function () { showToast('打开失败'); setMenu(null); });
          } else {
            showToast('打开失败');
            setMenu(null);
          }
        }

        function openMenu(e, item) {
          e.stopPropagation();
          var r = e.currentTarget.getBoundingClientRect();
          setMenu({
            path: item.path,
            kind: item.kind,
            name: item.name,
            x: Math.min(r.right, window.innerWidth - 180),
            y: r.bottom + 4,
          });
        }

        function renderRows(items, depth) {
          var rows = [];
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var isDir = it.kind === 'dir';
            var isOpen = !!expanded[it.path];
            var node = tree[it.path];
            rows.push(react.createElement('div', {
              key: it.path,
              className: 'ftp-row',
              style: { paddingLeft: 8 + depth * 14 },
              onClick: isDir ? function (p) { return function () { toggleDir(p); }; }(it.path) : undefined,
              title: it.path,
            },
              react.createElement('span', { className: 'ftp-arrow' }, isDir ? (isOpen ? '▾' : '▸') : ''),
              react.createElement('span', { className: 'ftp-ic' }, isDir ? '📁' : (it.kind === 'other' ? '❔' : '📄')),
              react.createElement('span', { className: 'ftp-name' }, it.name),
              react.createElement('button', { className: 'ftp-dots' + (menu && menu.path === it.path ? ' show' : ''), onClick: function (ev) { return openMenu(ev, it); } }, '⋯')
            ));
            if (isDir && isOpen) {
              if (!node || node.loading) {
                rows.push(react.createElement('div', { key: it.path + ':load', className: 'ftp-hint', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '加载中…'));
              } else if (node.error) {
                rows.push(react.createElement('div', { key: it.path + ':err', className: 'ftp-err', style: { paddingLeft: 8 + (depth + 1) * 14 } }, node.error));
              } else if (node.items && node.items.length === 0) {
                rows.push(react.createElement('div', { key: it.path + ':empty', className: 'ftp-empty', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '（空）'));
              } else if (node.items) {
                rows = rows.concat(renderRows(node.items, depth + 1));
              }
            }
          }
          return rows;
        }

        var rootNode = root ? tree[root] : null;
        var body = null;
        if (!root) {
          body = react.createElement('div', { className: 'ftp-hint' }, '未选择会话，无法确定工作目录');
        } else if (!rootNode || rootNode.loading) {
          body = react.createElement('div', { className: 'ftp-hint' }, '加载中…');
        } else if (rootNode.error) {
          body = react.createElement('div', { className: 'ftp-err' }, rootNode.error);
        } else if (!rootNode.items || rootNode.items.length === 0) {
          body = react.createElement('div', { className: 'ftp-empty' }, '（空目录）');
        } else {
          body = renderRows(rootNode.items, 0);
        }

        return react.createElement(react.Fragment, null,
          react.createElement('button', { className: 'ftp-fab' + (open ? ' active' : ''), title: '文件浏览器', onClick: function () { setOpen(!open); } }, '📁'),
          react.createElement('div', { className: 'ftp-panel' + (open ? ' open' : '') },
            react.createElement('div', { className: 'ftp-head' },
              react.createElement('span', { className: 'ftp-title' }, '文件浏览器'),
              react.createElement('button', { className: 'ftp-btn', title: '刷新', onClick: refresh }, '⟳'),
              react.createElement('button', { className: 'ftp-btn', title: '关闭', onClick: function () { setOpen(false); } }, '✕')
            ),
            root ? react.createElement('div', { className: 'ftp-root' }, root) : null,
            react.createElement('div', { className: 'ftp-body' }, body)
          ),
          menu ? react.createElement('div', { className: 'ftp-menu', style: { left: menu.x, top: menu.y } },
            react.createElement('div', { className: 'ftp-mi', onClick: function () { copyPath(menu.path); } }, '📋 复制文件地址'),
            react.createElement('div', { className: 'ftp-mi', onClick: function () { reveal(menu.path, menu.kind); } }, '🖥️ 打开文件浏览器查看')
          ) : null,
          toast ? react.createElement('div', { className: 'ftp-toast' }, toast) : null
        );
      }

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          { name: "shell.overlay", id: "filetree-panel", order: 100 },
          function (props) {
            return react.createElement(FileTreePanel, { useSessions: props.useSessions });
          });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
