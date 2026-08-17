# dsh-xchat — 跨会话知识桥（XChat 创造模式）

DSH 插件：实现**对话间的相互通信**。在一个对话中需要另一个会话的知识时，在目标会话名下**原生拉起一个继承该会话完整记忆的 fork 子代理**，向它询问关键信息并取回回复；信息不够可反复追问；用完结束并归档删除子代理。

本包是**双组件**结构：

| 组件 | 位置 | 职责 |
|---|---|---|
| 静态 client 包 | `lib/client.js` + `cordis.patch.yml` | `@` 会话候选菜单（任意位置触发、主题自适应）、拖拽会话到聊天窗 |
| Agent 预设「XChat 创造模式」 | `preset/` 目录 | `xchat_query` 工具（start/ask/stop）+ 创造模式全部权限（cordis_inspect / define / run、preset 创作 skill） |

## 功能

### 1. `@` 会话候选（客户端）
- **任意位置触发**：行首/空格后的 `@` 走原生输入触发菜单；紧跟字母/汉字/数字（如 `你好@`）由自绘菜单接管
- 候选来自 client `sessions.list`，显示真实标题 + 状态；**子代理会话被过滤**（防止误选引发链式派生）
- 选中插入 `@会话名 `，Esc 关闭，点击外部关闭
- 从侧边栏**拖拽会话**到聊天窗自动变成 `@会话名 `

### 2. `xchat_query` 工具（预设层）
| action | 行为 |
|---|---|
| `start` | 解析 `@会话名`/`\会话名` → 目标会话不 live 时 `agents.resume` 恢复 → `subagents.startContinuable({ provider: 'fork' })` 拉起继承目标会话完整记忆的子代理 → 等待其整理回复 |
| `ask` | `subagents.followup` 向同一子代理追问（保持记忆） |
| `stop` | 打断当前 turn（interrupt）+ **归档删除**子代理（可回收站还原） |

设计要点：
- **每个调用方会话对同一目标各分配一个同级专用子代理**（`callerId + targetId` 归属）
- **目标解析排除所有子代理**（含 `xchat:*`），杜绝链式派生
- 每次 start 前**全局限定清理孤儿**（30 秒限流）：进程重启后遗留的 `xchat:*` 子代理会被自动归档
- 子代理创建后自动命名 `xchat:<目标名>`，便于识别与过滤

### 3. 创造模式权限（随预设自带）
- `cordis_inspect_list` / `cordis_inspect_query` / `cordis_inspect_self`：运行时检查
- `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`：动态插件实验
- `editing-cordis-compositions` + `cordis-plugin-development` skill

## 安装

### A. 客户端（`@` 菜单）

1. 安装包到 profile：
   ```powershell
   # 复制（或 link）到 web profile 的 node_modules
   Copy-Item -Recurse C:\Users\22320\Desktop\dsh_WS\dsh-plugins\dsh-xchat C:\Users\22320\.dsh\profiles\web\node_modules\dsh-xchat
   ```
   或 link（推荐，改代码即时生效）：
   ```powershell
   # 在 profile 目录执行
   pnpm link C:\Users\22320\Desktop\dsh_WS\dsh-plugins\dsh-xchat
   ```

2. 在 `C:\Users\22320\.dsh\profiles\web\cordis.patch.yml` 添加：
   ```yaml
   - insert:
       - id: xchat
         name: dsh-xchat
   ```

3. 重启 `dsh web`。

### B. Agent 预设（`xchat_query` 工具 + 创造模式权限）

1. 把本包 `preset/` 目录整体复制到用户预设根：
   ```powershell
   Copy-Item -Recurse C:\Users\22320\Desktop\dsh_WS\dsh-plugins\dsh-xchat\preset C:\Users\22320\.dsh\.agent-presets\xchat-pro
   ```

2. 新建会话，选择预设 **XChat 创造模式**（id: `xchat-pro`）。

## 使用

- 输入框任意位置输入 `@` → 选择会话 → 发送，例如：
  > 参考 @会话名 问一下它之前讨论的关键结论
- 模型会调用 `xchat_query`：start（拉起记忆子代理并询问）→ ask（追问）→ stop（结束并归档删除）

## 已知限制

- **`tool-cordis` 每进程只能挂一个预设**：同一进程内请勿同时打开「创造模式」会话和「XChat 创造模式」会话（后者已包含创造模式全部权限，可完全替代前者）。
- 子代理创建在**目标会话名下**（父 = 目标会话，继承其完整记忆）；stop 归档后可回收站还原。

## 源码

- `lib/client.js`：`@` 菜单（候选过滤子代理、拖拽、自绘菜单）
- `lib/host.js`：no-op（工具已迁至预设层）
- `preset/agent.cordis.yml`：预设组合（创造模式 + `tool-xchat` + 路由 persona）
- `preset/dsh-xchat-tool/index.js`：`xchat_query` 实现
