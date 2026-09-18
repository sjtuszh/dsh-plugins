// ============================================================================
// dsh-file-actions — 客户端半边（静态版 bundle）
// ----------------------------------------------------------------------------
// 目标：让官方右侧栏「文件」树(files tab)的每一行都有 ⋯ 菜单：
//   1. 复制文件地址（原生绝对路径，Windows 用反斜杠拼写）
//   2. 在文件管理器中显示（文件 → 其父目录，目录 → 自身）
//
// 做法（不改官方包）：
//   * 右侧栏 tab 注册表允许一个 kind 同时有一份 builtin 与一份 extension，
//     extension 档生效、离开后 builtin 恢复（见 ui-sidebar-right README §扩展席位）。
//     官方 Files 的 kind 是 "files"、档位 "builtin"，所以本插件以 "extension"
//     档注册同一 kind，正文注册在 sidebar.right.pane.tab（key = 本实现 id）。
//   * 「在文件管理器中显示」直接 POST 官方路由 /open-in-app/open
//     （body {app:'explorer', path:<绝对目录>}），复用官方主机能力与同源认证围栏，
//     本插件因此不需要任何主机端代码。
//   * 列目录仍走官方 Remote：remote.workspaceFiles.list(sessionId, 绝对路径, signal)。
//
// 卸载本插件（或它加载失败）→ extension 消失 → 官方文件树自动回来。
// ============================================================================

window.__ModuleLoader__.load({
  id: 'dsh-file-actions',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var react = require('react');
    var e = react.createElement;

    /** 接管的 tab kind（官方 @deepseek-ai/dsh-client-ui-sidebar-files 的 kind）。 */
    var KIND = 'files';
    /** 本实现在 tab 系统里的身份，同时是正文注册的 key。 */
    var ID = 'dsh-file-actions';
    /** 需要的浏览器服务：席位、tab 注册表、Remote 载体及其工作区文件命名空间。 */
    var inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles'];
    /** 装配时绑定的 Remote 载体（供正文组件列目录用；正文定义在 apply 之外）。 */
    var boundRemote = null;

    /* ======================================================================
     * 资源地址：复刻 @deepseek-ai/dsh-util-workspace-path 的 fileAddressFor，
     * 以便文件行用官方的 tab.actions.openResource 打开到文档预览。
     * ==================================================================== */

    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }

    function encodePath(path) {
      return path.split('/').map(encodeSegment).join('/');
    }

    function sessionFileAddress(sessionId, path) {
      var normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' + encodePath(normalized);
    }

    function isAbsolutePath(path) {
      return /^[A-Za-z]:[\\/]/.test(path) || path.indexOf('\\\\') === 0 || path.charAt(0) === '/';
    }

    function fileAddressFor(sessionId, cwd, path) {
      var normalized = path.replace(/\\/g, '/');
      if (!isAbsolutePath(normalized)) return sessionFileAddress(sessionId, normalized);
      var root = cwd === undefined || cwd === null ? '' : cwd.replace(/\\/g, '/').replace(/\/+$/, '');
      if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '');
      if (root !== '' && normalized.indexOf(root + '/') === 0) {
        return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
      }
      return sessionFileAddress(sessionId, normalized);
    }

    /* ======================================================================
     * 路径小工具
     * ==================================================================== */

    /** 子项绝对路径：与官方一致，统一用 `/` 拼接（主机端能解析混合分隔符）。 */
    function childPath(parent, name) {
      return parent.replace(/[/\\]+$/, '') + '/' + name;
    }

    /** 拆出目录前缀与末段（用于标题行灰显目录部分）。 */
    function pathParts(path) {
      var trimmed = path.replace(/[/\\]+$/, '');
      if (trimmed === '') return { directory: '', name: path };
      var cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1;
      return { directory: trimmed.slice(0, cut), name: trimmed.slice(cut) };
    }

    /** 父目录（文件 → 它所在目录）。 */
    function parentDir(path) {
      var trimmed = path.replace(/[/\\]+$/, '');
      var cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      if (cut <= 0) return trimmed;
      var head = trimmed.slice(0, cut);
      return /^[A-Za-z]:$/.test(head) ? head + '\\' : head;
    }

    /** 复制用拼写：Windows 盘符路径换成反斜杠。 */
    function nativePath(path) {
      return /^[A-Za-z]:\//.test(path) ? path.replace(/\//g, '\\') : path;
    }

    function assign(base, patch) {
      return Object.assign({}, base, patch);
    }

    function kv(key, value) {
      var out = {};
      out[key] = value;
      return out;
    }

    /** 目录优先，其后按自然序、不分大小写。 */
    function orderEntries(entries) {
      return entries.slice().sort(function (a, b) {
        var ad = a.type === 'directory' ? 0 : 1;
        var bd = b.type === 'directory' ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      });
    }

    /** 列目录失败 → 一行中文说明。 */
    function failureLine(error) {
      var code = error && error.code;
      if (code === 'workspace-file/not-found') return '这个目录不在了。可能已被移动或删除。';
      if (code === 'outside-workspace') return '这个目录在工作区之外，侧栏不会读取它。';
      if (code === 'not-directory') return '这不是一个目录。';
      var message = error && (error.message || error.code);
      return '读取失败：' + (message === undefined || message === '' ? '未知错误' : String(message));
    }

    /* ======================================================================
     * 行内动作
     * ==================================================================== */

    /** 复制文本：优先 Clipboard API，退回临时 textarea。 */
    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return new Promise(function (resolve, reject) {
        try {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.left = '-9999px';
          document.body.appendChild(area);
          area.select();
          var ok = document.execCommand('copy');
          area.remove();
          if (ok) resolve();
          else reject(new Error('copy rejected'));
        } catch (error) {
          reject(error);
        }
      });
    }

    /**
     * 在系统文件管理器中显示一个路径：调用官方 open-in-app 路由。
     * 官方只接受「存在的绝对目录」，所以文件取其父目录、目录取自身。
     */
    function reveal(path, isDirectory) {
      var directory = isDirectory ? path : parentDir(path);
      return fetch('/open-in-app/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: 'explorer', path: directory })
      }).then(function (response) {
        if (response.ok) return { ok: true };
        return response.json().then(
          function (body) {
            return { ok: false, error: (body && body.message) || 'HTTP ' + response.status };
          },
          function () {
            return { ok: false, error: 'HTTP ' + response.status };
          }
        );
      });
    }

    /* ======================================================================
     * 样式
     * ==================================================================== */

    var CSS = [
      '.dfa-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:inherit;position:relative}',
      '.dfa-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.22)}',
      '.dfa-headpath{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;opacity:.85}',
      '.dfa-dim{opacity:.55}',
      '.dfa-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:5px;background:transparent;color:inherit;opacity:.7;cursor:pointer;font-size:13px;line-height:1}',
      '.dfa-iconbtn:hover{background:rgba(127,127,127,.18);opacity:1}',
      '.dfa-body{flex:1;min-height:0;overflow:auto;padding:2px 0 8px}',
      '.dfa-level{list-style:none;margin:0;padding:0}',
      '.dfa-level .dfa-level{padding-left:12px}',
      '.dfa-item{list-style:none;margin:0}',
      '.dfa-rowwrap{position:relative;display:flex;align-items:center}',
      '.dfa-row{flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:3px 6px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}',
      '.dfa-row:hover{background:rgba(127,127,127,.14)}',
      '.dfa-row.is-other{opacity:.5;cursor:default}',
      '.dfa-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.dfa-glyph{flex:none;width:16px;text-align:center;font-size:13px}',
      '.dfa-caret{flex:none;width:10px;text-align:center;font-size:9px;opacity:.6;transition:transform .12s}',
      '.dfa-caret.is-open{transform:rotate(90deg)}',
      '.dfa-note{list-style:none;padding:4px 8px;font-size:12px;opacity:.6}',
      '.dfa-note.dfa-fail{opacity:.85}',
      '.dfa-status{padding:10px;font-size:12px;opacity:.7}',
      '.dfa-dots{flex:none;width:20px;height:20px;margin-right:2px;border:0;border-radius:5px;background:transparent;color:inherit;opacity:0;cursor:pointer;font-size:14px;line-height:1}',
      '.dfa-rowwrap:hover .dfa-dots,.dfa-dots.is-open{opacity:.75}',
      '.dfa-dots:hover{background:rgba(127,127,127,.2);opacity:1}',
      '.dfa-menu{position:fixed;z-index:60;min-width:182px;padding:4px;border:1px solid rgba(127,127,127,.3);border-radius:8px;background:var(--dsh-menu-bg,#22242a);box-shadow:0 8px 24px rgba(0,0,0,.35)}',
      '.dfa-mi{padding:5px 9px;border-radius:5px;font-size:12.5px;white-space:nowrap;cursor:pointer}',
      '.dfa-mi:hover{background:rgba(127,127,127,.22)}',
      '.dfa-flash{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:50;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.78);color:#fff;font-size:12px;pointer-events:none}'
    ].join('\n');

    /* ======================================================================
     * 行内 ⋯ 菜单
     * ==================================================================== */

    function RowMenu(props) {
      var path = props.path;
      var isDirectory = props.isDirectory;
      var tree = props.tree;
      var state = react.useState(false);
      var open = state[0];
      var setOpen = state[1];
      /** 菜单的视口坐标（固定定位，避免被面板的 overflow 裁掉）。 */
      var placeState = react.useState(null);
      var place = placeState[0];
      var setPlace = placeState[1];
      var buttonRef = react.useRef(null);

      var menuWidth = 182;
      var menuHeight = 84;

      /** 打开前按按钮位置定位；贴近视口底部时向上翻转。 */
      var openMenu = function () {
        var button = buttonRef.current;
        if (button === null) {
          setOpen(true);
          return;
        }
        var rect = button.getBoundingClientRect();
        var top = rect.bottom + 4;
        if (top + menuHeight > window.innerHeight - 8) top = Math.max(8, rect.top - menuHeight - 4);
        var left = Math.min(Math.max(8, rect.right - menuWidth), Math.max(8, window.innerWidth - menuWidth - 8));
        setPlace({ top: top, left: left });
        setOpen(true);
      };

      // 打开期间：点别处、按 Esc、滚动或改窗口大小都关闭。
      react.useEffect(
        function () {
          if (!open) return undefined;
          var close = function () {
            setOpen(false);
          };
          var onKey = function (event) {
            if (event.key === 'Escape') setOpen(false);
          };
          var timer = setTimeout(function () {
            document.addEventListener('click', close);
            document.addEventListener('keydown', onKey);
            window.addEventListener('resize', close);
            window.addEventListener('scroll', close, true);
          }, 0);
          return function () {
            clearTimeout(timer);
            document.removeEventListener('click', close);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
          };
        },
        [open]
      );

      var run = function (action) {
        return function (event) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          action();
        };
      };

      var items = [
        e(
          'div',
          {
            key: 'copy',
            className: 'dfa-mi',
            onClick: run(function () {
              copyText(nativePath(path)).then(
                function () {
                  tree.flash('已复制文件地址');
                },
                function () {
                  tree.flash('复制失败：浏览器拒绝了剪贴板写入');
                }
              );
            })
          },
          '📋 复制文件地址'
        ),
        e(
          'div',
          {
            key: 'reveal',
            className: 'dfa-mi',
            onClick: run(function () {
              reveal(path, isDirectory).then(function (result) {
                if (result.ok) tree.flash(isDirectory ? '已在文件管理器中打开' : '已在文件管理器中显示');
                else tree.flash('打开失败：' + result.error);
              });
            })
          },
          isDirectory ? '🖥️ 在文件管理器中打开' : '🖥️ 在文件管理器中显示'
        )
      ];

      return e(
        'div',
        { className: 'dfa-menuwrap', style: { position: 'relative', flex: 'none' } },
        e(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            className: 'dfa-dots' + (open ? ' is-open' : ''),
            title: '更多操作',
            'aria-label': '更多操作',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            onClick: function (event) {
              event.preventDefault();
              event.stopPropagation();
              if (open) setOpen(false);
              else openMenu();
            }
          },
          '⋯'
        ),
        open
          ? e(
              'div',
              {
                className: 'dfa-menu',
                role: 'menu',
                style: place === null ? undefined : { top: place.top, left: place.left }
              },
              items
            )
          : null
      );
    }

    /* ======================================================================
     * 树
     * ==================================================================== */

    /** 一行的内容：目录（可展开）／文件（打开到文档预览）／其它（灰显）。 */
    function Entry(props) {
      var tree = props.tree;
      var entry = props.entry;
      var path = childPath(props.parent, entry.name);
      var label = e('span', { className: 'dfa-name' }, entry.name);

      if (entry.type === 'directory') {
        var expanded = tree.state.expanded.indexOf(path) >= 0;
        return e(
          'li',
          { className: 'dfa-item', 'data-fa-entry': 'directory', 'data-fa-path': path },
          e(
            'div',
            { className: 'dfa-rowwrap' },
            e(
              'button',
              {
                type: 'button',
                className: 'dfa-row',
                'aria-expanded': expanded,
                title: path,
                onClick: function () {
                  tree.onToggle(path);
                }
              },
              e('span', { className: 'dfa-caret' + (expanded ? ' is-open' : '') }, '▶'),
              e('span', { className: 'dfa-glyph' }, expanded ? '📂' : '📁'),
              label
            ),
            e(RowMenu, { path: path, isDirectory: true, tree: tree })
          ),
          expanded ? e('ul', { className: 'dfa-level' }, e(Level, { path: path, tree: tree })) : null
        );
      }

      if (entry.type === 'file') {
        return e(
          'li',
          { className: 'dfa-item', 'data-fa-entry': 'file', 'data-fa-path': path },
          e(
            'div',
            { className: 'dfa-rowwrap' },
            e(
              'button',
              {
                type: 'button',
                className: 'dfa-row',
                title: path,
                onClick: function () {
                  tree.onOpen(path);
                }
              },
              e('span', { className: 'dfa-glyph' }, '📄'),
              label
            ),
            e(RowMenu, { path: path, isDirectory: false, tree: tree })
          )
        );
      }

      return e(
        'li',
        { className: 'dfa-item', 'data-fa-entry': 'other', 'data-fa-path': path },
        e(
          'div',
          { className: 'dfa-rowwrap' },
          e(
            'span',
            { className: 'dfa-row is-other', title: '这不是文件或目录，没法打开。' },
            e('span', { className: 'dfa-glyph' }, '•'),
            label
          )
        )
      );
    }

    /** 一个目录的当前层：读取中／失败／内容。 */
    function Level(props) {
      var tree = props.tree;
      var level = tree.state.levels[props.path];
      if (level === undefined || level.status === 'loading') return e('li', { className: 'dfa-note' }, '正在读取…');
      if (level.status === 'failed') return e('li', { className: 'dfa-note dfa-fail' }, failureLine(level.error));
      var entries = orderEntries(level.entries || []);
      var nodes = [];
      if (entries.length === 0) nodes.push(e('li', { className: 'dfa-note', key: 'empty' }, '空目录'));
      entries.forEach(function (entry) {
        nodes.push(e(Entry, { key: entry.name, parent: props.path, entry: entry, tree: tree }));
      });
      if (level.truncated) nodes.push(e('li', { className: 'dfa-note', key: 'truncated' }, '条目太多，只显示了一部分。'));
      return e(react.Fragment, null, nodes);
    }

    /** 标题行：工作目录（目录部分灰显）+ 重新读取。 */
    function Header(props) {
      var parts = pathParts(props.root);
      return e(
        'div',
        { className: 'dfa-head' },
        e(
          'div',
          { className: 'dfa-headpath', title: props.root },
          parts.directory === '' ? null : e('span', { className: 'dfa-dim' }, parts.directory),
          e('span', null, parts.name)
        ),
        e(
          'button',
          {
            type: 'button',
            className: 'dfa-iconbtn',
            title: '重新读取',
            'aria-label': '重新读取',
            onClick: props.onReload
          },
          '⟳'
        )
      );
    }

    /**
     * 正文：以会话工作目录为根的文件树。
     * 参数由席位注入：useTabInfo / sessionId / useSessions。
     * 状态住在本组件的 React state 里（每 tab 一份），目录懒加载、展开态保留。
     */
    function Body(props) {
      var useTabInfo = props.useTabInfo;
      var sessionId = props.sessionId;
      var useSessions = props.useSessions;

      var info = useTabInfo();
      var tab = info.tab;
      var signal = tab.signal;
      var cwd = useSessions(function (sessions) {
        var session = sessions.byId[sessionId];
        return session === undefined ? undefined : session.cwd;
      });

      var treeState = react.useState(null);
      var tree = treeState[0];
      var setTree = treeState[1];
      var flashState = react.useState(null);
      var flash = flashState[0];
      var setFlash = flashState[1];
      /** 每个绝对路径的请求代数：只有最新一次请求的结算被采纳。 */
      var generations = react.useRef({});
      var flashTimer = react.useRef(null);

      var flashMessage = react.useCallback(
        function (message) {
          setFlash(message);
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(function () {
            setFlash(null);
            flashTimer.current = null;
          }, 1600);
        },
        [setFlash]
      );

      react.useEffect(function () {
        return function () {
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
        };
      }, []);

      /** 记一次结算结果，仍带代数校验。 */
      var settle = react.useCallback(
        function (path, generation, level) {
          setTree(function (current) {
            if (current === null || generations.current[path] !== generation) return current;
            return assign(current, { levels: assign(current.levels, kv(path, level)) });
          });
        },
        [setTree]
      );

      /** 读一个绝对目录（懒加载 + 重读共用）。 */
      var load = react.useCallback(
        function (path) {
          var generation = (generations.current[path] || 0) + 1;
          generations.current[path] = generation;
          setTree(function (current) {
            if (current === null) return current;
            return assign(current, { levels: assign(current.levels, kv(path, { status: 'loading' })) });
          });
          var pending;
          try {
            pending = boundRemote.workspaceFiles.list(sessionId, path, signal);
          } catch (error) {
            settle(path, generation, { status: 'failed', error: { code: 'unavailable', message: String((error && error.message) || error) } });
            return;
          }
          Promise.resolve(pending).then(
            function (result) {
              if (result && result.ok) {
                settle(path, generation, {
                  status: 'ready',
                  entries: result.value.entries || [],
                  truncated: Boolean(result.value.truncated)
                });
              } else {
                settle(path, generation, { status: 'failed', error: (result && result.error) || { code: 'unavailable' } });
              }
            },
            function (error) {
              if (signal && signal.aborted) return;
              settle(path, generation, { status: 'failed', error: { code: 'unavailable', message: String((error && error.message) || error) } });
            }
          );
        },
        [sessionId, signal, settle]
      );

      // 会话工作目录到手 → 播种该 tab 的树（根已展开）。
      react.useEffect(
        function () {
          if (cwd === undefined || cwd === null || cwd === '') return;
          setTree(function (current) {
            if (current !== null && current.root === cwd) return current;
            return { root: cwd, levels: {}, expanded: [cwd] };
          });
        },
        [cwd]
      );

      // 展开中但还没读过的层，全部补读（含首次的根）。
      react.useEffect(
        function () {
          if (tree === null) return;
          tree.expanded.forEach(function (path) {
            if (tree.levels[path] === undefined) load(path);
          });
        },
        [tree, load]
      );

      // tab 记录被中止（关闭/换成别的 tab）→ 忘掉代数，晚到的结算不再写入。
      react.useEffect(
        function () {
          if (!signal) return undefined;
          var onAbort = function () {
            generations.current = {};
          };
          signal.addEventListener('abort', onAbort);
          return function () {
            signal.removeEventListener('abort', onAbort);
          };
        },
        [signal]
      );

      if (cwd === undefined) {
        return e('div', { className: 'dfa-status' }, e('p', null, '这个会话还没有工作区目录。'));
      }
      if (tree === null) return null;

      var api = {
        state: tree,
        flash: flashMessage,
        onToggle: function (path) {
          setTree(function (current) {
            if (current === null) return current;
            var at = current.expanded.indexOf(path);
            var expanded = at >= 0 ? current.expanded.filter(function (item) { return item !== path; }) : current.expanded.concat([path]);
            return assign(current, { expanded: expanded });
          });
        },
        onOpen: function (path) {
          tab.actions.openResource(fileAddressFor(sessionId, tree.root, path));
        }
      };

      var reload = function () {
        setTree(function (current) {
          return current === null ? current : assign(current, { levels: {} });
        });
      };

      return e(
        'div',
        { className: 'dfa-root', 'data-fa-root': tree.root },
        e(Header, { root: tree.root, onReload: reload }),
        e('div', { className: 'dfa-body' }, e('ul', { className: 'dfa-level' }, e(Level, { path: tree.root, tree: api }))),
        flash === null ? null : e('div', { className: 'dfa-flash' }, flash)
      );
    }

    /* ======================================================================
     * 装配
     * ==================================================================== */

    function apply(ctx) {
      // 正文组件在 apply 之外定义，这里绑定它列目录要用的 Remote 载体。
      boundRemote = ctx.remote;

      // 样式表：随插件生死。
      ctx.effect(
        function () {
          var style = document.createElement('style');
          style.setAttribute('data-dsh-file-actions', '');
          style.textContent = CSS;
          document.head.appendChild(style);
          return function () {
            style.remove();
          };
        },
        'file-actions: styles'
      );

      // 类型：以 extension 档接管 kind "files"（高于 builtin）。
      ctx.effect(
        function () {
          return ctx.sidebarRightTabs.register({
            id: ID,
            kind: KIND,
            priority: 'extension',
            title: function () {
              return '文件';
            },
            guide: [
              {
                order: 10,
                title: function () {
                  return '工作区文件';
                },
                description: function () {
                  return '浏览会话工作区的文件（每行 ⋯ 可复制地址 / 在文件管理器中显示）';
                }
              }
            ]
          });
        },
        'file-actions: files type'
      );

      // 正文：以本实现 id 为 key。
      ctx.effect(
        function () {
          return ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, Body);
          });
        },
        'file-actions: files tab body'
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    /** 调试/冒烟测试口（不参与运行时逻辑）。 */
    exports.__internals = {
      KIND: KIND,
      ID: ID,
      Body: Body,
      Header: Header,
      Entry: Entry,
      Level: Level,
      RowMenu: RowMenu,
      fileAddressFor: fileAddressFor,
      sessionFileAddress: sessionFileAddress,
      nativePath: nativePath,
      parentDir: parentDir,
      childPath: childPath,
      pathParts: pathParts,
      orderEntries: orderEntries,
      failureLine: failureLine
    };
    return module.exports;
  }
});
