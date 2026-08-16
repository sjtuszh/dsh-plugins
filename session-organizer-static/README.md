# 会话侧边栏组织器 · 静态版（profile 挂载）

与动态版（`../organizer-client.js` / `organizer-host.js` 定义）功能等价，以**静态插件**挂载：
随 `dsh web` 启动自动加载，进程重启、浏览器刷新都不需要任何操作，无需批准。

> 此前单包静态版曾在 dsh 启动时崩溃（`dsh打不开`），根因极可能是**单包内既挂 remote 又消费 remote
> 的自依赖死锁 + Host 侧普通 `ctx.provide` 无 `typertRemote` 绑定**（MEMORY §4.3 / §11.4b）。
> 本版完全复刻 file-panel-static 已验证的双包 + TypertRemoteService 结构。

## 功能（与动态版 v12 等价）

- **层级**：工作区 → [用户分组 → 会话] + 散列会话；分组 <2 会话自动解散
- **拖拽排序**：拖会话到另一会话**中间带** → 建组（仅当双方都不在分组内）；
  拖到**上/下缘** → 蓝色插入线，松手插入（同账户=排序，跨账户=移动）；拖到**分组头** → 加入该分组
- **图标语义**：💬 普通会话 / 👔 agent-teams 队长 / 👷 成员 / 🔧 其他子代理；工作区 📂；
  分组 = 按 id 着色的圆点，尺寸随成员数增长
- **状态点**：绿=运行中，黄=等待用户（approval/plan/answer）
- 会话三点菜单：重命名 / 复制会话 / 归档会话（**无**"在文件管理器中打开"）；分组菜单：重命名/删除
- 分组与顺序经 Typert remote 持久化到工作区根 `.dsh-session-organizer.json`

## 架构（双包 + Typert，参照 `../file-panel-static/`）

| 包 | 角色 |
|---|---|
| `dsh-session-organizer` | Host：`SessionOrganizerService extends TypertRemoteService`（`organizer` 服务，`load`/`save` 读写成 `.dsh-session-organizer.json`）+ typert 清单 + UI bundle（priority -2 影子替换 `sidebar.workspaces`，inject `["slots","remote","remote.organizer"]`） |
| `dsh-session-organizer-mount` | 仅 `ctx.remote.$mount(TYPERT_REMOTE)`（防自依赖死锁） |

## 安装 / 更新

```powershell
$dst = "$HOME\.dsh\profiles\web\node_modules"
Copy-Item -Recurse dsh-session-organizer        $dst\dsh-session-organizer
Copy-Item -Recurse dsh-session-organizer-mount  $dst\dsh-session-organizer-mount
# zod / dsh-typert-protocol 已在 profiles\node_modules(hoisted 根),无需复制
```

`profiles/web/cordis.patch.yml` 的 insert 列表追加两行：

```yaml
    - id: session-organizer
      name: dsh-session-organizer
    - id: session-organizer-mount
      name: dsh-session-organizer-mount
```

重启 `dsh web`（host/typert 生效）。`client.js` 改动刷新浏览器即可。

> ⚠️ **同时使用动态版会重复**：静态版挂载后请 `cordis_stop` 不再运行动态版，否则侧栏出现两份。

## 回滚

删除上述两行 + 删除两个包目录 + 重启 → 官方浏览器还原（分组数据文件保留在 `.dsh-session-organizer.json`）。

## 预检（不必重启即可跑）

```powershell
node --check dsh-session-organizer/lib/host.js
node --check dsh-session-organizer/lib/typert.host.js
node --check dsh-session-organizer/lib/client.js
node --check dsh-session-organizer-mount/lib/client.js
dsh --profile web --dump-config   # 确认组合树含 session-organizer 两行
```

## 已知风险（按 MEMORY §4/§5/§11 实录）

- 静态客户端 ctx 是代理，**未声明即访问会抛错**：UI 包必须
  `inject: ["slots","remote","remote.organizer","sessions","workspaces"]`，访问服务用属性形式
  `ctx.sessions` / `ctx.workspaces`——**不能用 `ctx.get('sessions')`**（真实踩坑：`ctx.get` 触发守卫使
  apply 崩溃、槽位未注册，侧边栏仍是官方版；属性访问已在 inject 声明则放行，参照官方 ui-workspace 的
  `inject: ["slots","sessions","workspaces","locale"]` 写法）。
- 双条目顺序由依赖保证：mount 包先 `$mount` 出 `remote.organizer`，UI 包才激活。
- 若挂载后 UI 不出现：检查（a）patch 两行是否都在；（b）`dsh --profile web --dump-config` 组合树；
  （c）typert 清单校验错误（启动日志 `typert-loader: dsh-session-organizer …`）；
  （d）浏览器控制台 `without inject` 报错（客户端 apply 崩溃）。
- zod v4 依赖已在 hoisted 根（`profiles\node_modules\zod`），换环境时确认版本兼容。
