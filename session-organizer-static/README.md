# 会话侧边栏组织器 · 单包静态版（npm: dsh-session-organizer）

与动态版（`../organizer-client.js` / `organizer-host.js`）功能等价，以**静态插件**挂载：
随 `dsh web` 启动自动加载，进程重启、浏览器刷新都不需要任何操作，无需批准。

## 安装（推荐：npm 包）

```powershell
# 正式版（发布 10 天后 pnpm 供应链策略放行，可直接装）
dsh plugin --profile <name> add dsh-session-organizer

# 刚发布时 pnpm minimumReleaseAge 会拦截，钉版本号安装：
dsh plugin --profile <name> add dsh-session-organizer@1.0.0
```

安装后重启 `dsh web`。回滚：`dsh plugin --profile <name> rm dsh-session-organizer` + 重启。

## 开发（本目录）

- `dsh-session-organizer/`：**单包**（npm 发布单元）
  - `lib/host.js` — Host：`SessionOrganizerService extends TypertRemoteService`（organizer 服务 7 端点）
  - `lib/client.js` — Client：UI bundle（priority -2 影子替换 `sidebar.workspaces`）+ **自 `$mount` Typert remote**（async apply 先挂 remote 再注册 UI，官方 dsh-api-remotes 同款，无自依赖死锁）
  - `lib/typert.host.js` / `lib/typert.remote-client.js` — Typert 严格清单
  - `cordis.patch.yml` — bundle patch（`dsh plugin add` 时自动应用，一行 insert）
  - `package.json` — `dsh.bundle.patch` + `dsh.client` 声明（照 dsh-cost-panel 范本）
- 预检：`node --check` 四个 lib 文件 + `npm pack` 打包确认
- 发布：`npm publish`（版本号已就绪即发；注意 pnpm 装包侧 minimumReleaseAge）

## 历史

- 曾为**双包**（`dsh-session-organizer` + `dsh-session-organizer-mount`），因"单包内既 mount 又 inject 自己的 remote 会自依赖死锁"而拆分。
- 现**合并回单包**：参照官方 `@deepseek-ai/dsh-api-remotes`（async apply 先 `$mount`，inject 只声明 `remote` 不声明 `remote.organizer`），UI 在 mount 完成后渲染，无死锁。mount 包已删除。

## 已知风险（MEMORY §4/§5/§11）

- 静态客户端 ctx 是代理，未声明即访问会抛错：inject 声明点号路径 + 属性访问（`ctx.sessions` / `ctx.workspaces`），不能用 `ctx.get('sessions')`（触发守卫）。
- 若挂载后 UI 不出现：检查 bundle patch 是否生效（`dsh --profile web --dump-config`）、typert 清单校验、浏览器控制台报错。
- zod v4 依赖在 hoisted 根（`profiles\node_modules\zod`），换环境时确认版本兼容。
