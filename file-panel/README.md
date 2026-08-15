# 文件树浏览面板（file-panel）

在 DeepSeek Harness Web GUI **页面右侧**浮动显示文件树的动态 Cordis 插件。

- **右侧中间浮动 📁 小按钮** → 点击滑出右侧文件栏（`shell.overlay` 根级浮动层，300px 动画过渡）；打开时按钮**贴面板左缘**移动
- 文件栏以**当前会话 cwd** 为根，目录懒加载、可展开/折叠，带刷新按钮
- 刷新策略：**每次点击 📁 按钮刷新** + 面板打开时**每 30s 自动刷新**（root + 已展开目录）
- 每个文件/文件夹行右侧 **⋯** → 菜单：
  - **复制文件地址**：`navigator.clipboard.writeText`（失败回退 `execCommand`），Toast 提示
  - **打开文件浏览器查看**：直接打开目标目录——**文件打开其父目录、文件夹打开自身**（`explorer.exe "目录"` 经临时 .cmd 执行；不用 `/select,`，规避 argv/命令传递的引号解析坑）

## ✨ 特性

- **Host RPC**：`filetree:list`（`fs.resolve/stat/listDir/processPath`，条目自带 type，目录在前名称排序）、`filetree:reveal`（`explorer.exe "目标目录"`——文件→父目录、文件夹→自身，经临时 .cmd + `cmd /c` 执行）
- **会话感知**：根目录跟随当前会话 cwd（`useSessions` 快照的 `current` 会话），切换会话自动重置
- **双轨路径归一化**：正斜杠的盘符路径自动转反斜杠（`nativeOf`）
- **懒加载**：展开目录才拉取，带缓存与并发去重（loading 表）；面板内菜单点击外部/Esc 关闭

## 🛠 使用（动态插件）

1. 在 DSH 会话中调用 `cordis_define`，将 [`src/host.js`](src/host.js) 的内容作为 `code.host`、[`src/client.js`](src/client.js) 的内容作为 `code.client`。
2. 调用 `cordis_run` 激活（Client 半边首次需要用户在界面批准）。
3. 页面右侧出现 📁 即成功；点击滑出文件栏，悬停行显示 ⋯ 菜单。

> 动态插件定义于当前进程，DSH 重启后需重新定义。如需长期挂载，仓库已提供现成静态版 [`../file-panel-static/`](../file-panel-static/README.md)（双包 profile 挂载 + Typert remote）。

## 📐 架构

| 半边 | 文件 | 职责 |
|------|------|------|
| Host | `src/host.js` | `filetree:list` 列目录 / `filetree:reveal` 打开资源管理器；只依赖 `fs`/`subprocess`（均判 undefined） |
| Client | `src/client.js` | `shell.overlay` 槽位注册浮动按钮+文件栏；`useSessions` 取当前会话 cwd；懒加载树；⋯ 菜单（复制/打开） |

客户端只依赖两个 Host RPC：`filetree:list` 与 `filetree:reveal`。
