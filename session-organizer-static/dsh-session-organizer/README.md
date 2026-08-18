# dsh-organizer-sidebar

DeepSeek Harness（DSH）会话侧边栏组织器 —— **静态插件**，随 dsh profile 启动自动加载、无需批准。

替换官方 `sidebar.workspaces`，提供拖拽排序/分组、归档/删除双 tab、批量还原删除、Typert remote 持久化。

## 安装

```powershell
dsh plugin --profile <name> add dsh-organizer-sidebar
```

> ⚠️ pnpm v11 默认 `minimumReleaseAge: 10 天`：刚发布的包会被拒绝。刚发布后安装请**钉版本号**：
> `dsh plugin --profile <name> add dsh-organizer-sidebar@<version>`，
> 或给 profile 的 `pnpm-workspace.yaml` 加 `minimumReleaseAgeExclude`，或用 `npm install` 绕过。

安装后重启 `dsh web` 生效。回滚：`dsh plugin --profile <name> rm dsh-organizer-sidebar` 并重启。

## 功能

- **层级**：工作区 → [用户分组 → 会话] + 散列会话；分组 <2 会话自动解散
- **拖拽排序**：拖会话到另一会话**中间带** → 建组（仅双方都不在分组内）；
  拖到上/下缘 → 插入线排序（同账户=排序，跨账户=移动）；拖到分组头 → 加入该分组
- **图标**：💬 普通 / 👔 agent-teams 队长 / 👷 成员 / 🔧 其他子代理；工作区 📂；分组=彩色圆点
- **状态点**：绿=运行中，黄=等待用户
- **tab 栏**：会话 / **已归档**（查看 + 批量还原/删除）/ **已删除**（回收站还原）
- **删除走 Windows 回收站**（可还原，不物理删除）；拒绝删除运行中的会话（先归档）
- 会话菜单：重命名 / 复制 / 归档；分组菜单：重命名/删除
- 分组与顺序经 Typert remote 持久化到 `$DSH_HOME/session-organizer/.dsh-session-organizer.json`

## 架构（单包）

| 面 | 实现 |
|---|---|
| Host | `SessionOrganizerService extends TypertRemoteService`（`organizer` 服务：load/save/delete/deleteArchived/listDeleted/restoreArchived/restoreDeleted）|
| Client | UI bundle（priority -2 影子替换 `sidebar.workspaces`）+ 自 `$mount` Typert remote（fire-and-forget，`whenRemoteReady` 门控首次加载，无自依赖死锁）|
| Typert | `lib/typert.host.js` 严格清单（7 个端点）|

## 开发 / 预检

```powershell
node --check lib/host.js
node --check lib/client.js
node --check lib/typert.host.js
npm pack          # 打包验证（files: lib + cordis.patch.yml + README.md）
```

## License

MIT
