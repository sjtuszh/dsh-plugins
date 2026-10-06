# 新机 DSH 配置指南（Windows）

把本机这套 DeepSeek Harness 环境完整复刻到一台新机器：**装 DSH → 过认证 → 装插件 → 配 MCP → 可选扩展/托盘 → 验证**。

> 适用：Windows 10/11。参考环境：Node **24.18.0**、DSH **0.1.5-rc.2**、profile **web**、`$DSH_HOME = %USERPROFILE%\.dsh`。
> 相关背景与踩坑细节见本仓库 [MEMORY.md](../MEMORY.md)；维护工具在 [tools/](../tools/)。

---

## 0. 前置

| 依赖 | 说明 |
|---|---|
| Node.js | ≥ 22，推荐 **24.x**（自带 npm 11）。`node -v` 确认 |
| Git | 拉插件源码用（`git -v`） |
| PowerShell 7（可选） | 本指南命令在 Windows PowerShell 5.1 下也能跑 |
| VS Code（可选） | 想要面板内嵌 GUI 才需要，见 §6 |

---

## 1. 安装 DSH

```powershell
npm i -g @deepseek-ai/dsh
dsh --version
```

`dsh` 是唯一受支持的启动器；`web` / `headless` / `sdk` / `sdk-minimal` / `acp` 这几个 profile **首次使用时会从随附模板自动初始化**到 `$DSH_HOME\profiles\<name>`，不需要手动建目录。

---

## 2. 首次启动与**认证**（最容易卡住的一步）

```powershell
dsh web                      # 等价于 dsh --profile web；监听 127.0.0.1:3080
```

启动输出里会有一行：

```
dsh web: http://127.0.0.1:3080/?token=xxxxxxxx
```

### 规则（DSH 0.1.5 起）

1. **必须用这条带 `?token=` 的完整 URL 打开一次**。直接开 `http://127.0.0.1:3080/` 会得到
   `401 dsh web authentication required; reopen the URL printed by dsh web.`
2. 该 URL **只对根路径有效**（`/?token=…`，GET，且只有一个 token 参数）。用它访问后服务器会
   `303` 跳到干净的 `/`，并给**这个浏览器**种下会话 cookie。
3. cookie 属性：`host-only` / `Path=/` / `HttpOnly` / **`SameSite=Strict`**，有效期 `cookieMaxAgeDays`（默认 **30 天**），
   用 `$DSH_HOME\.credentials.yaml` 里持久化的 `client-connection/browser-session` 密钥签名
   → **重启 dsh web 后 cookie 依然有效**，不用每次重新登录。
4. **authority 必须一致**：给 `127.0.0.1:3080` 铸的 cookie 对 `localhost:3080` 无效（cookie 名与签名都绑定 host:port）。
5. token 本身**每次启动都变**，所以别把带 token 的 URL 收藏成书签。

### 常用启动参数

```powershell
dsh web --port 8080            # 换端口
dsh web --no-open              # 不自动拉起默认浏览器
dsh web --trusted-host 192.168.1.116:4080   # 额外放行给 /api 的 Host/Origin 信任围栏（LAN/反代场景）
```

> `--host 0.0.0.0` 被官方**刻意拒绝**（会暴露 RCE 面）。要跨机访问就用插件 `dsh-lan`（见 §3），它另起一个网关进程。

### 嵌入 iframe 的场景（VS Code 内置浏览器等）

cookie 是 `SameSite=Strict`，而 iframe 属第三方上下文——**Chromium 不会种也不会发它**，所以「拿 token URL 打开一次」也救不回来；
此外 `/api` 的信任围栏还会直接拒绝 `Sec-Fetch-Site: cross-site`。本仓库给了现成解法：

```powershell
node tools\dsh-embed-proxy.mjs          # 回环注入代理：127.0.0.1:3081 → 127.0.0.1:3080，服务端侧代出示凭据
# 然后在 VS Code 内置浏览器里打开 http://127.0.0.1:3081
```

细节与安全边界见 [tools/README.md](../tools/README.md#认证为什么-iframe-里打不开-gui以及怎么绕过)。

---

## 3. 安装插件（本机这套）

### 3.1 一张表

| 插件 | 版本 | 作用 |
|---|---|---|
| `dsh-cost-panel` | 1.7.1 | 双轨计费面板：会话头实时计费 / 历史调用 / 定价表 / 跨会话总量统计 / API 余额 |
| `dsh-organizer-sidebar` | 1.3.8 | 会话侧边栏组织器：拖拽分组排序、归档/回收站双 tab、批量还原、子代理管理 |
| `dsh-xchat` | 1.0.8 | 跨会话知识桥：`@` 会话候选 + 拖拽会话入聊天窗 + `xchat_query` 工具 |
| `dsh-lan` | 0.2.1 | LAN 网关（`0.0.0.0:4080` → 本机 3080）+ 机器切换器 |
| `dsh-file-actions` | 0.1.0 | 给**官方**右侧栏文件树加行内 ⋯ 菜单（复制地址 / 在文件管理器中显示） |
| `dsh-tray` | — | Windows 托盘启动器（独立工具，不是插件；可选，见 §7） |

> 已移除：`dsh-computer-use`（本地 fork，npm 上该包属上游作者）、`dsh-agent-teams`（fork 仓库，其 npm 包已改名 `dsh-agent-squad`）。

### 3.2 安装命令

```powershell
dsh plugin --profile web add dsh-cost-panel@1.7.1
dsh plugin --profile web add dsh-organizer-sidebar@1.3.8
dsh plugin --profile web add dsh-xchat@1.0.8
dsh plugin --profile web add dsh-lan@0.2.1
dsh plugin --profile web add dsh-file-actions@0.1.0

# 装完必须重启 dsh web（客户端模块图与 bundle 都是启动时缓存的）
```

`dsh plugin` 是在 profile 目录里转发给 **pnpm**。插件包内声明了 `dsh.bundle.patch`，安装时其 patch 会自动挂载，
并把包名追加进 `profiles\web\package.json` 的 `dsh.profile.bundles`。

**本地开发版**（改源码时用 link）：

```powershell
dsh plugin --profile web add link:C:/path/to/dsh-plugins/dsh-file-actions
```

### 3.3 pnpm 11 的 `minimumReleaseAge`（刚发布的版本装不上）

pnpm 11 默认拒绝「发布不足 10 天」的版本，报「Already up to date」之类。在
`$DSH_HOME\profiles\web\pnpm-workspace.yaml` 里放行：

```yaml
minimumReleaseAgeExclude:
  - dsh-cost-panel@1.7.1
  - dsh-xchat@1.0.8
  - dsh-organizer-sidebar@1.3.8
  - dsh-file-actions@0.1.0
  - dsh-lan@0.2.1
```

---

## 4. API 凭据

模型凭据放在 `$DSH_HOME\.credentials.yaml`（GUI 设置里填也可以）：

```yaml
refs:
  DEEPSEEK_API_KEY: sk-...
  OPENAI_API_KEY: sk-...
```

> 同一个文件里还会自动生成 `records.client-connection/browser-session`（上面那个会话签名密钥）——**别删**，删了所有浏览器的登录都会失效。

---

## 5. MCP 服务器

DSH 用官方 `@deepseek-ai/dsh-mcp-client` 桥接外部 MCP：**每台服务器一条配置行**，工具以
`mcp__<serverName>__<tool>` 暴露给模型。加上 `dsh web` 的行即可（写在
`$DSH_HOME\profiles\web\cordis.patch.yml` 的用户层，或 home 级 `$DSH_HOME\cordis.patch.yml`）。

字段（官方 schema）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `transport` | 必填 | `stdio` 或 `streamable-http` |
| `serverName` | 必填 | 工具命名空间，`[A-Za-z0-9_-]{1,32}`，同一作用域内唯一 |
| `command`/`args`/`env`/`cwd` | — | stdio：可执行文件、参数、附加环境变量、工作目录 |
| `url`/`headers` | — | streamable-http：端点与额外请求头 |
| `toolCallTimeoutMs` | `60000` | 单次 `tools/call` 超时 |
| `failOnStartupError` | `false` | 启动连不上时是否直接让插件激活失败 |
| `reconnect.*` | 开启 | 断线重连（`enabled`/`initialDelayMs`/`maxDelayMs`/`maxAttempts`） |

### 5.1 GitHub MCP（本机在用）

```yaml
- insert:
    - id: mcp-github
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: github
        transport: stdio
        command: 'C:\Users\<你>\.dsh\bin\github-mcp-server.exe'   # 官方 github/github-mcp-server 二进制
        args: ['stdio']
        env:
          GITHUB_PERSONAL_ACCESS_TOKEN: 'github_pat_<你的PAT>'
```

也可以走 npx（不下载二进制）：

```yaml
        command: npx
        args: ['-y', '@modelcontextprotocol/server-github']
```

> **PAT 要带 `repo`（读私库/推送）**；如果还要删仓库，需要单独的 `delete_repo` scope。
> PAT 过期后 MCP 工具会报 `401 Bad credentials`——换一个即可。

### 5.2 立创商城 / 嘉立创（**官方目前没有 MCP**）

截至 2026-10 的实地核查：

- **立创商城没有官方 MCP**（GitHub 搜「立创商城 mcp」0 结果；`org:jlcpcb` 只有 PCB 名片等无关仓库）
- npm 上的 `@jlcpcb/mcp`（或 `jlc-mcp`）**不是官方**：维护者是个人（`l3wi`），仓库 `l3wi/jlc-cli`，
  功能是 JLCPCB/LCSC 元件检索 + 转 KiCad 符号/封装
- **官方的 AI 接入在 `github.com/easyeda`（嘉立创EDA）**，但形态是 **SKILL + 网关**，不是 MCP：
  - [`easyeda/easyeda-api-skill`](https://github.com/easyeda/easyeda-api-skill)（⭐855）—— 为 AI 编程工具提供 EasyEDA Pro API 与 WebSocket 桥接
  - [`easyeda/eext-run-api-gateway`](https://github.com/easyeda/eext-run-api-gateway) —— Run API Gateway 扩展
  - [`easyeda/extension-dev-mcp-tools`](https://github.com/easyeda/extension-dev-mcp-tools) —— 官方 MCP，但用途是**调试 EDA 扩展**，不是选型采购

**要"元件搜索/库存/价格"这类能力**，目前只能用社区实现（非官方，自行评估维护状况）：

| 项目 | 说明 |
|---|---|
| [`SpectraSynq/mcp-lcsc`](https://github.com/SpectraSynq/mcp-lcsc) | 基于**立创 OpenAPI** 的元件查询 MCP |
| [`mageoch/JLCPCB-MCP-Server`](https://github.com/mageoch/JLCPCB-MCP-Server) | JLCPCB/LCSC 元件搜索 |
| `@jlcpcb/mcp`（npm，个人维护） | 元件检索 + 转 KiCad 库（`bin: jlc-mcp`） |

接进 DSH 的写法（以 stdio 为例，把 command/args 换成你选的那套）：

```yaml
- insert:
    - id: mcp-lcsc
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: lcsc
        transport: stdio
        command: npx
        args: ['-y', '<该 MCP 的包名或仓库启动方式>']
        toolCallTimeoutMs: 120000
```

### 5.3 LTspice MCP（本机在用，装 LTspice 26.1+ 自带）

```yaml
- insert:
    - id: mcp-ltspice
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: ltspice
        transport: stdio
        command: 'C:\Program Files\ADI\LTspice\ltspice-mcp-bridge.exe'
        args: []
        toolCallTimeoutMs: 300000
```

无参启动 = 有 GUI 就附着 GUI，没有就在需要时自起隐藏 headless 实例；想固定附着可加 `args: ['--pid','<N>']`。

---

## 6. 可选：VS Code 面板扩展

装 VS Code 扩展 **`fengze233.dsh-vscode-panel`**（在 DSH GUI 里以内嵌面板呈现）。注意：

- 它会把客户端桥接插件 **`dsh-vscode-bridge`** 自动装进 `profiles\web\node_modules` 并在
  `cordis.patch.yml` 里插一段带 `# dsh-vscode-bridge: begin/end` 标记的行 → **由扩展自己管理，别手动删**
- 若该面板提示 **"DSH requires browser sign-in"**：把当前实例的启动 URL
  （`dsh web: http://127.0.0.1:3080/?token=…`）粘进它的登录框一次即可（会话 30 天）。
  用托盘启动器看不到控制台时，见 §7 的「复制登录 URL」

---

## 7. 可选：托盘启动器 `dsh-tray`

源码与自检在本仓库 [`dsh-tray/`](../dsh-tray/)：

```powershell
cd dsh-tray
.\build-tray.ps1                     # 渲染鲸鱼图标 + csc 编译 + 写配置 + 建桌面快捷方式
```

- 托盘会**后台启动 dsh web** 并把 stdout/stderr 追加到 `dsh-tray.log`（**token 在日志里打码**），
  启动行同时落盘到 `dsh-tray-login-url.txt`
- 右键菜单：**显示页面 / 复制登录 URL / 重启 / 退出**。「复制登录 URL」会先验证 token 属于当前实例
  （有效兑换返回 303），失效就明确报错，绝不复制死 token
- 不想用托盘时，命令行取回登录 URL：`powershell -File dsh-tray\dsh-login-url.ps1`
- 改完 `DshTray.cs` 可离线自检（不启动托盘、不碰正在跑的 dsh）：`dsh-tray\selfcheck.exe DshTray.exe "<URL>"`

---

## 8. 验证清单

```powershell
# 1) 装配里有没有你的插件行（期望 6 行左右非官方行）
dsh --profile web --dump-config | Select-String 'dsh-cost-panel|dsh-organizer-sidebar|dsh-xchat|dsh-lan|dsh-file-actions|mcp-'

# 2) 已装插件体检（inject / bundle.patch / 残留 API）
node tools\inventory-installed.mjs "$env:USERPROFILE\.dsh\profiles\web\node_modules"

# 3) 页面侧：重启 dsh web 后刷新，确认计费胶囊、组织器侧栏、右栏文件树 ⋯ 菜单、LAN 按钮都在
```

---

## 9. 踩坑速查（本仓库 MEMORY 的精华）

| 症状 | 原因 / 解法 |
|---|---|
| `401 dsh web authentication required` | 用了裸地址。必须用启动时打印的 `?token=` URL 打开一次；cookie 有效期 30 天 |
| iframe 里（VS Code 内置浏览器）怎么都打不开 | cookie 是 `SameSite=Strict`，第三方上下文发不出去 → 用 `tools/dsh-embed-proxy.mjs` |
| `dsh web` 起不来，报 `cannot get property "x" without inject` | 客户端 `inject` 必须与 `apply()` 实际访问的服务**一一对应**（含 `remote.xxx` 点号路径） |
| 改了插件页面没变化 | 客户端模块图/bundle 是**启动时缓存**的 → 必须重启 `dsh web` |
| pnpm 说 "Already up to date" 装不上新版本 | `minimumReleaseAge` 10 天限制 → 加进 `minimumReleaseAgeExclude` |
| `npm publish` 报 `403 E_STAGE_REQUIRED` | npm 已收窄 bypass-2FA token：只能 `npm stage publish`，再由维护者 **2FA 批准** |
| `npm stage approve` 报 404 `staged version not found` | 那个 404 在说「身份没建立」——要么没用人类会话（`npm login`），要么缺 `--otp` |
| MCP 工具不出现 | 服务器连不上：看 `dsh web` 启动日志；`failOnStartupError: true` 可让它直接报错而不是静默降级 |
| GitHub MCP 报 `401 Bad credentials` | PAT 过期/被吊销 → 换一个（本机 `cordis.patch.yml` 里那把已失效） |

---

## 10. 一页速记

```powershell
npm i -g @deepseek-ai/dsh                 # 装 DSH
dsh web                                   # 首次自动建 web profile，记下带 ?token= 的 URL
# 用那条 URL 打开一次浏览器 → 完成认证
dsh plugin --profile web add dsh-cost-panel@1.7.1
dsh plugin --profile web add dsh-organizer-sidebar@1.3.8
dsh plugin --profile web add dsh-xchat@1.0.8
dsh plugin --profile web add dsh-lan@0.2.1
dsh plugin --profile web add dsh-file-actions@0.1.0
# 在 cordis.patch.yml 里加 MCP 行（GitHub / 立创商城社区版 / LTspice）
# 重启 dsh web
```
