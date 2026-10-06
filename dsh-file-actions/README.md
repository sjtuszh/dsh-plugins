# dsh-file-actions

给**官方右侧栏「文件」树**的每一行加一个 **⋯ 菜单**：

- **📋 复制文件地址** —— 复制该文件/目录的绝对路径（Windows 盘符路径用反斜杠拼写）。
- **🖥️ 在文件管理器中显示** —— 文件打开其所在目录、目录打开自身（Windows 上即资源管理器）。

## 为什么不是改官方包

官方文件树的每行**没有**行级菜单席位（`ui-sidebar-files` README 明确写了「没有搜索、产物过滤、拖拽、重命名、右键菜单」）。但右侧栏 tab 注册表有一条公开通道：

> 一个 kind 最多承载一份 `builtin` 与一份 `extension` 注册（**extension 生效；它离开后 builtin 恢复**）

官方「文件」tab 的 kind 是 `files`、档位 `builtin`。本插件以 `priority: 'extension'` 注册**同一个 kind**，于是接管该 tab 的正文，并自绘一棵带 ⋯ 菜单的文件树：

```js
ctx.sidebarRightTabs.register({ id: 'dsh-file-actions', kind: 'files', priority: 'extension', title, guide })
ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-file-actions' }, Body))
```

结果：**不碰官方任何文件**，升级不会被覆盖；卸载本插件（或它加载失败）官方文件树自动回来。

## 主机半边是空的

「在文件管理器中显示」直接调用**官方** `open-in-app` 路由：

```
POST /open-in-app/open    { "app": "explorer", "path": "<绝对目录>" }
```

官方路由自带同源/浏览器信任围栏与认证，且只接受「存在的绝对目录」，所以文件取其父目录。因此本插件**不需要**自造 explorer 调用、临时 `.cmd`、`subprocess` 或 Typert remote——`lib/host.js` 是空实现，它存在的唯一目的是让 dsh 把 `lib/client.js` 作为该插件的客户端 bundle 提供。

## 功能对齐

列目录沿用官方 Remote（`remote.workspaceFiles.list(sessionId, 绝对路径, signal)`），并保持官方行为：以会话工作目录为根、逐层懒加载、目录优先自然序、`other` 条目灰显、截断/空层/失败各一行、标题行显示根路径并提供「重新读取」、点文件用官方资源地址（`dsh-resource://file/session/...`）打开到文档预览。

增量只有两点：**每行的 ⋯ 菜单**，以及菜单用视口内固定定位（贴近底部时向上翻转，避免被面板滚动容器裁掉）。

## 安装

```powershell
dsh plugin --profile web add link:C:/Users/22320/Desktop/dsh_WS/dsh-plugins/dsh-file-actions
# 重启 dsh web 后刷新页面
```

## 卸载 / 回滚

```powershell
dsh plugin --profile web remove dsh-file-actions
# 或仅在 profile 的 cordis.patch.yml 里注释掉 file-actions 那一行
# 重启 dsh web —— 官方文件树立即恢复
```

## 冒烟测试（不必重启）

`lib/client.js` 是纯客户端 bundle，可用真 React 服务端渲染 + 桩 ctx 离线验证。测试脚本在仓库的 [`tools/`](../tools/)：

```powershell
# 在 dsh-plugins/ 仓库根目录
# 需要任意一个含 react + react-dom 的 node_modules；没有就临时装一个：
npm i --prefix "$env:TEMP\dsh-smoke" react react-dom
node tools/smoke-file-actions.mjs `
  dsh-file-actions/lib/client.js `
  "$env:TEMP\dsh-smoke/node_modules"
```

覆盖：bundle 自注册、`apply()` 无异常并返回 disposer、注册项（kind/档位/id/guide/标题）、资源地址与路径工具、Header/Entry/Level/RowMenu 渲染、行内 ⋯ 按钮存在。

桩 ctx 带 **Cordis 式 inject 门禁**（读未声明服务即抛 `cannot get property "x" without inject`），并附回归证明：故意删掉 `'remote'` 声明时测试必须失败——本插件正是栽在这一条上（详见仓库 README「两条硬约定」）。

## 已知限制

- 官方只接受**目录**给 open-in-app，所以「在文件管理器中显示」是打开所在目录并**不选中**该文件（与旧插件行为一致）。
- 接管期间官方文件树的正文被本实现取代（功能按上文对齐）；官方若在后续版本改动 `files` kind 的语义，需要跟进。
- 行图标使用 emoji 而非官方 `ui-primitives` 的图标组件，以免依赖该内部模块 id。

## License

MIT
