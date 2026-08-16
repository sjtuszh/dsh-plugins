# 侧栏会话管理器（sidebar-manager）

官方侧栏会话浏览区的"对话管理"改造 —— **实验区影子浏览器**。

## 实验区机制（关键）

以 **`priority: -1`** 注册官方 `sidebar.workspaces` 单槽位（官方注册在 `priority: 0`）：
槽位系统**最低 priority 渲染**（源码：`register at a different priority to shadow it (lowest renders)`），
官方注册原样保留 → **停用本插件即还原官方**，零风险、秒级回滚。

## 功能（对话管理）

- 工作区分组会话列表 + 未分组桶 + 会话**内容搜索**（Enter）
- 会话行 ⋯ 菜单：**打开 / 改名… / 归档 / 分叉为新会话 / 上移·下移 / 在文件管理器中打开**（未分组会话隐藏排序项）
- 工作区 ⋯ 菜单：**改名… / 新建会话 / 上移·下移 / 删除注册…**（确认后仅删注册，日志保留）
- 头部 ⊕ 新建工作区（native picker）；侧栏折叠时显示图标列

## 数据通道

| 能力 | 来源 |
|---|---|
| 会话/工作区列表 | 标准 props `useSessions` / `useWorkspaces`（快照） |
| 打开/分叉/搜索 | `ctx.sessions`（open/fork/search） |
| 归档/排序/改名/新建/删除注册 | `ctx.workspaces`（archiveSession/insertSessionBefore/rename/insertBefore/startSession/delete/create/pickDirectory） |
| **会话改名** | Host RPC `sessman:rename` → `sessionTitle.rename`（客户端无此 Remote） |
| 在文件管理器中打开 | `ctx.workspaces.openPath(session.cwd)` |

## 会话改名（含冷会话，v2）

`sessionTitle.rename` 要求 **live session**。冷会话（未在当前进程打开）先物化：

```
persistence.load(id) → sessions.prepare(id, {seedSource:'persistence', seed: events, meta})  // 从日志还原
→ sessions.enter(session)  // 装 append 发布钩子,不 announce
→ sessionTitle.rename(session, title)
→ detach()                 // 移除钩子;title 事件已进全局 session/event 总线,持久化异步冲刷(安全)
```

与官方 host-apiproxy `session.rename`（冷会话先 `agents.resume`）语义等价但更轻（不拉起完整 Agent）。

## 使用（动态版）

1. `cordis_define`：`src/host.js` → `code.host`，`src/client.js` → `code.client`
2. `cordis_run` 激活（客户端半边需批准）
3. 左侧栏变为"工作区"管理器；`cordis_stop` 立即还原官方浏览器

## 本体化（验证通过后进行，二选一）

- **A 固化静态插件**：按 `file-panel-static/` 套路做成 profile 挂载包（`dsh-sidebar-manager`，priority -1 行；改名 RPC 走 Typert remote）——官方包不动，行为本体化，可回滚
- **B 补丁官方包**：改 `profiles/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` 的 `sidebar.workspaces` 注册处（112KB 可读文件；升级会被覆盖，需维护补丁）
