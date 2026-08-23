# dsh-computer-use — 架构 & 使用指南

本文件是 **新用户与 Agent 的快速上手 + 二次开发手册**。它回答三件事：

1. **怎么让新人（和一个全新的 Agent）最快把这个插件用起来**；
2. **这个插件内部是怎么组织的**（三层架构）；
3. **怎么在上面做二次开发**（加 Provider、改工具、扩展能力）。

> 功能清单、完整配置项、第三方依赖表见 [README.md](README.md)。本文件聚焦"能用 + 能改"。
> 版本协议见 [docs/protocol.md](docs/protocol.md)，安全模型见 [docs/security.md](docs/security.md)，Provider 编写见 [docs/provider-authoring.md](docs/provider-authoring.md)。

---

## 0. 它解决什么问题（30 秒版）

让一个 DSH Agent 能**看屏幕、点鼠标、敲键盘**，并在这个过程里：
- 用 **三种引擎之一**做背后的事：`fake`（测试）/ `playwright`（隔离 Chromium）/ **`windows`（干净指纹，驱动你自己的真实浏览器）**；
- 遇到 **Cloudflare 人机验证 / 登录墙** 时，**暂停并把浏览器交给真人处理**，用户点一下"我已完成验证，继续"，Agent 再接管。

> 核心价值：`windows` provider 通过 **OS 级 SendInput** 从 *外部* 驱动你真实浏览器，浏览器进程内**零自动化标记**，所以能过 Cloudflare——这是 `playwright` 做不到的。

---

## 1. 快速启动（新用户）

### 1.1 前提
- 一个能跑的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。
- Windows（`windows` provider 的原生 helper 仅限 Windows；`playwright` 跨平台）。

### 1.2 安装到你的 DSH profile

```sh
dsh plugin --profile web add dsh-computer-use
```

或者手动编辑 `~/.dsh/profiles/web/package.json` 的 `dependencies` 与 `dsh.profile.bundles`：

```jsonc
"dependencies": {
  "dsh-computer-use": "link:C:/your/path/to/dsh-computer-use"   // 本地开发用 link；npm 装用版本号
},
"dsh": {
  "profile": {
    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-computer-use"]
  }
}
```

### 1.3 选择引擎（关键一步）

在 profile 的 `cordis.patch.yml` 里覆写默认 provider：

```yaml
- id: computer-use
  config:
    provider: windows          # fake | playwright | windows
    confirmActions: false
    windowsWindowState: normal
```

> - **`fake`**：默认，纯内存，用于快速验证工具能调用、无需真浏览器。
> - **`playwright`**：隔离 Chromium，能自己开页导航，但**带自动化指纹**，Cloudflare 大概率拦。
> - **`windows`（推荐用于"上网不被拦"）**：驱动你自己桌面开的浏览器，干净指纹。**它不自己导航**，需要你先手动开好浏览器窗口。

### 1.4 构建（windows helper 需要）

`windows` provider 依赖一个自包含原生 helper（SendInput）。首次用前构建：

```sh
pnpm install
pnpm build        # 打包 src→lib + dotnet publish native helper
```

产物：`dsh-computer-use-helper.exe`（约 69MB，自包含，无需装 .NET）。

### 1.5 重启并验证

重启 DSH web，然后让 Agent 调用 `computer_observe`（不带参数）。若返回 `{sessionId, targets:[...]}` 且能看到你桌面的窗口列表 → 成功。

---

## 2. Agent 使用指南（给 Agent 本人的操作手册）

这套东西对 Agent 来说就 4 个工具。**调用顺序和配合方式是关键。**

### 2.1 四个工具一览

| 工具 | 干什么 | 关键参数 |
|------|--------|---------|
| `computer_observe` | ①不带 `sessionId` → 开会话并列出目标；②带 `sessionId` 不带 `targetId` → 列目标；③带两者 → 观察一个目标（截图+无障碍树）| `sessionId` / `targetId` / `includeScreenshot` / `includeAccessibility` / `startUrl`(仅 playwright) |
| `computer_act` | 对某个观察做**恰好一个**动作，返回新观察 | `sessionId` / `targetId` / `observationId` / `action` |
| `computer_take_over` | **暂停**并把人/浏览器交给用户（人机验证、登录）| `sessionId` / `reason` |
| `computer_resume` | 用户完成后 **恢复** 接管，重新观察 | `sessionId` / `targetId` / `include*` |

（`computer_perceive` / `computer_stop` 也在，但核心是上面四件套。）

### 2.2 Agent 的标准工作流

```
computer_observe（开/列目标）
   → 选 targetId
   → computer_observe(target)          # 拿到截图 + accessibility
   → 判断"是否被人机验证/登录墙挡住"
        ├─ 正常 → computer_act(做动作) → 循环观察-动作
        └─ 被挡 → computer_take_over(reason)  # 暂停，交给人
                    用户手动处理
                  → computer_resume(target)   # 恢复，继续
```

### 2.3 关键规则（Agent 必须遵守）

1. **元素/截图 id 只在产生它的那次观察里有效**；每次 `act` 前最好基于**最新**观察。过期观察直接操作会 fail-closed。
2. **`windows` provider 不自己导航**——它只驱动你已开窗口。需要新页面时，先让用户开好，或换 `playwright`。
3. **`computer_take_over` 后必须停止一切后续动作**，把原因讲清楚，等待用户；用户完成后才 `computer_resume`。
4. **判断"被挡"**：看标题/无障碍树里有没有 `Are you a robot` / `请稍候` / `captcha` / `登录` / `access denied` 等。这个判断逻辑应放在你（或上层插件如 hwb-1）里，工具本身不做内容分类（见 4.2 安全边界）。
5. **截图是无障碍树看不到时的补充**；`accessibility` 模式不依赖 vision 模型，`analyze` 模式需要 vision 路由（见 README "Vision model"）。

### 2.4 一个可复制的 Agent 提示词片段

```text
你可以用 computer_observe / computer_act 看屏幕并操作浏览器。
流程：先 computer_observe() 拿到 sessionId 和 targets → 选一个目标 →
computer_observe(sessionId,targetId) 抓截图+无障碍树 →
若页面被人机验证/登录挡住，调用 computer_take_over 并停下等待用户；
用户完成后调用 computer_resume 恢复。
每次 computer_act 前确保基于最新观察的 observationId。
```

---

## 3. 架构总览（三层）

从上到下：

```
┌─────────────────────────────────────────────────────────┐
│  ① Tool 层  src/tools.ts                                  │
│     computer_observe / computer_act / computer_stop /      │
│     computer_take_over / computer_resume / perceive        │
│     （把模型参数 → 转成 ctx.computerUse 调用）                │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│  ② Seam 层  src/service.ts  →  ctx.computerUse           │
│     ComputerUseRuntime：注册 provider / resolve() 选哪个   │
│     （provider 注册表 + 配置/自动选择）                      │
└──────────────┬──────────────────────────────────────────┘
               │ resolve() 返回一个 provider
┌──────────────▼──────────────────────────────────────────┐
│  ③ Provider 层  src/providers/*                          │
│     fake.ts     内存假实现（测试/无密钥演示）                │
│     playwright.ts  隔离 Chromium（CDP，有自动化指纹）        │
│     windows.ts    桌面原生（native helper + SendInput）     │
└──────────────────────────────────────────────────────────┘
```

### 3.1 各层职责

| 层 | 文件 | 职责 |
|----|------|------|
| **Tool** | `src/tools.ts`, `src/perception.ts` | 面向模型。负责 schema、可读的展示。**不再写 `computer-use/*` 会话事件**（这些 out-of-repo 事件类型不被 harness 会话读取器识别，写了会导致会话日志被拒载；模型通过工具返回值读取浏览器状态）。**永远不直接接触具体 provider 的细节**。 |
| **Seam** | `src/service.ts` | `ctx.computerUse`。维护 `Map<id, ComputerUseProvider>`，`resolve()` 决定用谁（先配置，后自动，多个可用会报歧义）。 |
| **Provider** | `src/providers/*` | 实现 `ComputerUseProvider` 接口。持有每个会话的真实状态（浏览器/窗口），返回 provider-neutral 的结果，不泄漏内部指针。 |

### 3.2 Provider 选择逻辑（service.ts 的 resolve）

```ts
private resolve(): ComputerUseProvider {
  if (this.providerId !== undefined) {          // 1. 显式配置优先
    const p = this.providers.get(this.providerId)
    if (!p) throw ... 'not registered'
    if (!p.available()) throw ... 'unavailable'
    return p
  }
  const usable = [...this.providers.values()].filter(p => p.available())
  if (usable.length > 1) throw ... 'PROVIDER_AMBIGUOUS'  // 多个可用要明确配置
  return usable[0] ?? throw ... 'PROVIDER_UNAVAILABLE'
}
```

> **给 Agent / 给运维**：所以"什么时候用 windows、什么时候用 playwright"**不是 Agent 运行时自己切换的**，而是由 `cordis.patch.yml` 的 `provider:` 一行写死的。想切换，改配置或（在插件里）动态 `settings.update`，别指望 resolve 自动帮你选。

### 3.3 `windows` provider 内部（src/providers/windows.ts + src/native/*）

```
windows.ts
  └── NativeHelperTransport (src/native/transport.ts)
        └── PipeConnection (src/native/connection.ts)
              └── .NET helper  (native/windows-helper/*, 用 dotnet publish 编译)
                    ├── WindowsComputerUseServer  枚举窗口 / 截图 / 输入分发
                    ├── NativeMethods.cs          Win32 P/Invoke
                    ├── WgcCapture.cs             Windows.Graphics.Capture 截屏
                    └── SendInput                 OS 级真实鼠标键盘
```

- **截图**：helper 用 Windows.Graphics.Capture 抓窗口图 → 存为内容寻址 attachment（`ctx.attachments`），返回 `attachmentId`（sha256），**永不回传 base64**。
- **无障碍树**：UIA 抓取（但 ScienceDirect 等复杂 DOM 的正文链接往往抓不到——这时代码里没有元素 id，要么用截图坐标点击、要么用 vision 感知）。
- **输入**：`SendInput`（真实鼠标移动/点击/滚轮/键盘），浏览器进程内无自动化标记 → 干净指纹。

---

## 4. 二次开发指南

### 4.1 加一个 Provider（最常用的扩展）

1. 新建 `src/providers/mycustom.ts`，实现 `ComputerUseProvider` 接口：

```ts
import type { ComputerUseProvider, StartRequest, ObserveRequest, ActRequest, StopRequest } from '../types.ts'
import type { ComputerUseSession, ComputerUseObservation, ComputerUseTarget } from '../types.ts'
import type { ComputerUseSessionId, ComputerUseTargetId } from '../ids.ts'

export class MyProvider implements ComputerUseProvider {
  readonly id = 'mycustom'          // 唯一 id，注册表以此为 key
  private sessions = new Map<...>()

  available(): boolean { return true }
  async start(req: StartRequest, sig?: AbortSignal): Promise<ComputerUseSession> { ... }
  async listTargets(id: ComputerUseSessionId, sig?: AbortSignal): Promise<readonly ComputerUseTarget[]> { ... }
  async observe(req: ObserveRequest, sig?: AbortSignal): Promise<ComputerUseObservation> { ... }
  async act(req: ActRequest, sig?: AbortSignal): Promise<ComputerUseObservation> { ... }
  async stop(req: StopRequest): Promise<void> { ... }
}
```

2. 在 `src/plugin.ts` 的 `apply()` 里注册它 + 读取你的配置项：

```ts
if (c.provider === 'mycustom') {
  providerDisposers.push(ctx.computerUse.registerProvider(new MyProvider(/* config */)))
}
```

3. 在 `src/plugin.ts` 的 `Config` schema 里加你的配置项，并在 profile 的 `cordis.patch.yml` 里 `provider: mycustom`。

> **关于 Playwright 的懒加载**：`lib/plugin.js` 是单文件 bundle，顶部有一句 `import { chromium } from "playwright"`（**顶层静态 import**）。这意味着只要加载整个插件，Node 就必须能解析到 `playwright` 包。如果某天你彻底不用 playwright 想删掉它，**必须先**把这个 import 改成 `await import('playwright')`（运行时动态加载），否则删包会导致整个插件加载失败。这也是目前"先不动 playwright"的原因。

### 4.2 新增一个工具（面向模型的入口）

参照 `src/tools.ts` 的 `applyObserveTool`，用 `ctx.tools.register(defineTool({...}))` 注册：

```ts
ctx.tools.register(defineTool({
  name: 'my_new_tool',
  description: '...',
  parameters: { ... },            // ParameterSchemaSpec DSL
  output: { schema: { type: 'string' }, render: renderJson },
  async execute(args, exec) {
    // 通过 ctx.computerUse 调用底层，或直接调你的逻辑
    return JSON.stringify(...)  // 让模型通过返回值读到状态；不要写 computer-use/* 会话事件
  },
}))
```

在 `src/plugin.ts` 里调用你的 `applyMyTool(ctx)`。

### 4.3 人机协同（take_over/resume）的扩展

- `computer_take_over` / `computer_resume` 是**工具层**提供的能力，底层 provider 不一定需要特殊支持（`windows` provider 支持；`playwright` 通过暂停自身动作实现）。
- 如果你想加"检测到验证墙就自动交接"的逻辑，**不要**把它放进 provider（provider 不该读页面内容做语义判断，见 4.4）。放在**工具层或上层动态插件**（例如 hwb-1 的做法：观察后做正则判断，命中 `captcha/cloudflare/login` 就调用 take_over 并把状态推给一个 Client 交接界面）。

### 4.4 安全边界（二次开发必须遵守）

- **Prompt-injection 边界**：动作分类器和 `allowedDomains` 白名单**绝不读页面文本/无障碍名称/截图内容**——否则不可信的网页内容能"授予自己权限"。分类只按**动作类型**（`scroll`→read、`type/set-value/drag`→local、`click/press-key`→external）。
- **观察结果只取叶子字段**：不要做 `JSON.stringify` 整个 live 对象、不要序列化 provider 内部状态往回传。
- **Provider 状态必须 per-session**，且不能用 provider 内部指针泄漏到结果里。
- **校验动作**：`parseAction` 只接受白名单动作类型；未知动作直接拒。

### 4.5 想改干净指纹引擎本身（native helper）

`windows` provider 的"人类行为"质量取决于 helper 的 `InputDispatcher`。若想更拟人（鼠标 incremental 移动、随机暂停），改 `native/windows-helper/*.cs`，然后：

```sh
pnpm build     # 重新 dotnet publish 出 helper exe
```

改完记得（如果改了 src TS）也重新 `pnpm build` 同步 `lib/`，因为运行时加载的是 `lib/` 不是 `src/`。

---

## 5. 常见坑（新 Agent / 新用户最容易踩）

| 现象 | 原因 & 解法 |
|------|------------|
| `computer_observe` 返回空 targets | 还没启动会话 / `windows` provider 需要你已开好浏览器窗口。重试，或先手动开窗口。 |
| `windows` helper 一启动就退出 | `--stdio` 模式需要协议客户端发握手帧；直接用启动二进制没输入会 EOF 退出。应走 `ctx.computerUse.start()`，而不是裸跑 exe。 |
| `playwright` 被 Cloudflare 拦 | 这是**预期**的（自动化指纹）。换 `windows` provider。 |
| 正文里的链接在无障碍树里看不到 | 复杂 DOM（如 ScienceDirect）的链接 UIA 抓不到。用**截图坐标点击**，或用 vision 感知。 |
| `act` 报 observation 过期 | 每个 observation 有 30s 短寿命；动作前先重新 `observe` 拿新 observationId。 |
| 想删 playwright 结果插件挂了 | `lib/plugin.js` 有顶层静态 `import "playwright"`，删包前先改动态 import（见 4.1 末尾）。 |
| 动态插件里注册的工具模型看不到 | 工具注册的 scope 与模型工具集 scope 可能隔离（DSH harness 层面限制），与插件本身无关。可改用已有的内置工具。 |

---

## 6. 分支 & 文档位置

- 本文件：`ARCHITECTURE.md`（架构 + 用法 + 二次开发）
- `README.md`：功能清单、完整配置项、依赖表、安装
- `docs/protocol.md`：native helper 线协议（framing / handshake / methods / screenshot channel）
- `docs/security.md`：威胁模型与安全不变量
- `docs/provider-authoring.md`：如何加 provider
- `src/native/protocol.ts`：协议版本的 TS 定义（与 `docs/protocol.md` 对应）

## 7. License

MIT
