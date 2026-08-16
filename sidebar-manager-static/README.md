# 侧栏会话管理器 · 静态版（profile 挂载，本体化方案 A）

与动态实验区（`../sidebar-manager/`）功能等价，以**静态插件**挂载：随 `dsh web` 启动自动加载，客户端改动刷新即生效、Host/typert 改动需重启。

> ⚠️ **状态：源码就绪，等待实验区 UX 验收后安装**。当前动态版 `sbm-1` 运行中；装静态版前先 `cordis_stop sbm-1`（避免双影子）。

## 架构（双包 + Typert，参照 `../file-panel-static/`）

| 包 | 角色 |
|---|---|
| `dsh-sidebar-manager` | Host：`sessman` 服务（`TypertRemoteService`，改名含冷会话物化）+ typert 清单 + UI bundle（priority -1 影子替换 `sidebar.workspaces`，inject `["slots","remote","remote.sessman"]`） |
| `dsh-sidebar-manager-mount` | 仅 `ctx.remote.$mount(TYPERT_REMOTE)`（防自依赖死锁） |

## 安装 / 更新

```powershell
$dst = "$HOME\.dsh\profiles\web\node_modules"
Copy-Item -Recurse dsh-sidebar-manager        $dst\dsh-sidebar-manager
Copy-Item -Recurse dsh-sidebar-manager-mount  $dst\dsh-sidebar-manager-mount
# zod 已在 profiles\node_modules(hoisted 根),无需复制
```

`profiles/web/cordis.patch.yml` 的 insert 列表追加两行：

```yaml
    - id: sidebar-manager
      name: dsh-sidebar-manager
    - id: sidebar-manager-mount
      name: dsh-sidebar-manager-mount
```

重启 `dsh web`（host/typert 生效）。`client.js` 改动刷新浏览器即可。

## 回滚

删除上述两行 + 删除两个包目录 + 重启 → 官方浏览器还原。

## 已知风险（参照 MEMORY §11）

- 静态客户端 ctx 是代理：UI 包必须 `inject ["slots","remote","remote.sessman"]`（已声明）
- 网关要求 `typertRemote` 绑定：host 服务必须继承 `TypertRemoteService`（已实现，MEMORY §11.4b）
- 冷会话改名物化链路已用动态探针实证（before→renamed→after→restored 四段全过）
