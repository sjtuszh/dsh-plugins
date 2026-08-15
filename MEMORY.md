# dsh-plugins 开发记忆（MEMORY）

> **每次开发任何 DSH 插件前先读这份记忆。** 它是本仓库两个插件（计费面板、文件浏览器）从动态版到静态化、再退回动态版的完整实战记录，里面的坑每一个都是真实踩过的。
>
> 状态：2026-08 下旬 · 计费面板与文件树面板当前均以动态插件方式使用中（`cost-1` / `file-1`）；静态版 `cost-panel-static/`（投影驱动）与 `file-panel-static/`（双包 + Typert，见 §11）已随本仓库维护，需要长期挂载时按其 README 安装。

---

## 0. 一句话架构

**DSH = DeepSeek 的开源 Agent 运行时，"一切皆插件"，底层是 Cordis。** 每个能力都是 `cordis.yml` 里的一行插件；模型适配、工具、会话日志、agent loop 全是插件，可替换可 patch。Web 界面 = `dsh web`（profile = `dsh-base` + `dsh-web-app` 两个 bundle 叠出来的插件树）。

- 数据目录：`$DSH_HOME`（默认 `~/.dsh`），profile 在 `$DSH_HOME/profiles/<name>`
- 会话日志：`$DSH_HOME/sessions/<编码后的工作区目录>/<session-id>/session.jsonl.zstd`（zstd 多帧压缩，`node:zlib` 的 `zstdDecompressSync` 可逐帧解压）
- 本机示例：`$DSH_HOME\profiles\web`（web profile），插件源码习惯放 `profiles\web\plugins\<pkg>\`

---

## 1. 动态插件 vs 静态插件 —— 第一选择

| 维度 | 动态插件（cordis_define/run） | 静态插件（profile patch 挂载） |
|---|---|---|
| 生命周期 | **只在当前进程内存，重启即全部消失**（所有会话的一起没） | 随 profile 启动自动加载，重启不丢 |
| 安装 | `cordis_define` + `cordis_run`（客户端半边要用户批准） | 写包 + `cordis.patch.yml` 的 `insert:` 行 + 重启 dsh |
| 代码格式 | 普通 JS 函数体，`return { apply(ctx) {...} }`；可用 `harness`/`host.call`/`styles.insert`/`React` 内置 | 包结构 + 浏览器 bundle 必须是 `__ModuleLoader__` 工厂格式（见 §3） |
| 适合 | 快速原型、临时工具、**已验证的最终形态** | 需要长期存在的正式插件 |
| 授权记忆 | 批准标记在 Host 内存（单勾=当前版本，双勾=未来版本），进程重启即失 | 无需批准 |

**结论**：计费面板最终选了动态版（用户偏好），代价是重启要重定义+批准。静态化代码已整理为仓库内的 `cost-panel-static/`（投影驱动，见其 README）；§4-§6 的坑都是为静态化铺的路。

---

## 2. 动态插件开发要点

- Host 半边：
  - `harness.handle('name', async (args) => ...)` 注册客户端可调 RPC
  - `harness.defineTool` / `harness.registerTool` 注册模型工具（**Host-only 工具免批准**，是调试 Host 状态的好办法：注册个 probe 工具读任何服务）
  - `ctx.get('fs'|'sessions'|'sessionProjections'|...)` 取服务，**必须判 undefined**
- Client 半边：
  - `host.call('name', args)` 调 Host RPC；`styles.insert(css)` 注入样式；`React` 全局可用（无 JSX）
  - 槽位注册：`ctx.get('slots')` → `slots.inject('槽位名', () => slots.register({name, id, order}, (props) => ...))`
  - **组件里用 `ctx` 必须通过闭包**：组件函数定义在 `apply(ctx)` 内部（或把 ctx 当 prop 传）。模块顶层没有 ctx → `ctx is not defined` 崩溃（真实踩过，见 §7）
  - 常用槽位：`conversation.session.header.actions`（头部操作行，标准 props 带 sessionId/useProjection/useSessions）、`shell.overlay`（页面级浮层，props 只有 useSessions/useWorkspaces）
- 调试手段：
  - Host-only probe 插件（注册工具读服务状态）——进程内任何服务都能读
  - 会话日志解压后全文可搜（工具调用、事件都在里面）

---

## 3. 静态插件（profile 挂载）完整套路

### 3.1 patch 语法（关键坑）

`cordis.patch.yml` 是**顶层 patch 条目列表**，两种语义：

```yaml
# ✅ 新增行：用 insert: 包一层
- insert:
    - id: cost-panel
      name: dsh-cost-panel

# ❌ 这样写是"按 id 改已有行"：行不存在会报 entry not found 被跳过
- id: cost-panel
  name: dsh-cost-panel
```

### 3.2 包结构（静态插件标准）

```
<包名>/
  package.json      # exports: "."=host main, "./client", "./typert", "./remote"
  lib/host.js       # Host 半边（ESM，可 import）
  lib/client.js     # 浏览器 bundle（工厂格式，不能 import）
  lib/typert.host.js        # TYPERT 清单（真 zod schema）
  lib/typert.remote-client.js # TYPERT_REMOTE 客户端描述符
```

package.json 关键字段：

```json
{
  "type": "module",
  "main": "lib/host.js",
  "exports": {
    ".": "./lib/host.js",
    "./typert": "./lib/typert.host.js",
    "./remote": "./lib/typert.remote-client.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "platform": "web" } }
}
```

### 3.3 浏览器 bundle 格式（客户端半边）

```js
window.__ModuleLoader__.load({
  id: "包名",                    // 必须等于包名（图里行 id）
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");     // 只能 require 模块表里的平台模块（react、react-dom、已注册 bundle id）
    var inject = [];                  // 主插件依赖（见 §5 守卫坑）
    // CSS 直接插 DOM（没有 styles.insert）：
    // document.createElement("style") + data-plugin-css 防重
    function apply(ctx) { ... }       // 组件定义在 apply 内部以闭包捕获 ctx
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
```

### 3.4 安装与生效

- profile 用 `nodeLinker: hoisted`：**手动把包目录复制进 `profiles/<name>/node_modules/` 即可**（无需 pnpm；zod 等依赖同样手动复制）
- `client.js` 改动：dsh 进程按文件哈希生成 rev 分发 → **刷新浏览器即可**（rev 变了会重新拉取）
- `host.js` / patch / typert 改动：**必须重启 dsh web**（web profile 的 HMR 是 disabled，不会热生效）

---

## 4. Cordis 框架特性（含三个大坑）

### 4.1 服务与 inject

- 服务按 key 提供：`ctx.provide('name', obj)`；取用 `ctx.get('name')`（可选，判 undefined）或 `inject: ['name']`（硬依赖，Cordis 等就绪才激活）
- 事件：`ctx.on('event', fn)`（返回 disposer）；`ctx.effect(fn)` 注册可逆副作用
- `ctx.timeout` / `ctx.interval` 需要 `inject: ['timer']`

### 4.2 坑①：客户端对象守卫（without inject）

**静态客户端的 ctx 是个代理，访问任何未声明的属性（含嵌套路径）都会抛 `cannot get property "remote.costPanel" without inject`。**

```js
// ❌ inject 只声明了 ["timer","remote"]，访问 ctx.remote.costPanel 会崩
// ✅ 必须在 inject 里声明点号路径：["timer","remote","remote.costPanel"]
```

### 4.3 坑②：自依赖死锁（pending waiting for service）

**不要 inject 自己 apply 里才挂出来的服务。** 例如 `ctx.remote.$mount(TYPERT_REMOTE)` 会创建名为 `remote.costPanel` 的服务——如果插件自己的 inject 声明了它，就是"等一个只有自己激活后才存在的东西"→ 插件永远 pending，UI 全无。

```js
// ❌ 死锁：inject 声明 remote.costPanel，但它是本插件 apply 里 $mount 出来的
// ✅ 解法：拆两个条目（见 §5 双条目方案）
```

### 4.4 坑③：ctx 作用域

组件函数定义在模块顶层时拿不到 `ctx`（apply 的参数不在作用域）。**组件必须定义在 apply 内部**（闭包捕获），或显式把 ctx 当 prop 传。

---

## 5. Typert 远程（静态版 Host↔Client RPC）+ 双条目方案

### 5.1 机制

- Host：`ctx.provide('explorer', { async list(path){...} })` 提供 Cordis 服务
- `lib/typert.host.js` 导出 `TYPERT` 清单（package/face:'host'/schemas/invocations/model），**typert-loader 自动加载**（只要包有 `exports["./typert"]`），gateway 自动认领 `<namespace>/<method>` 端点
- 客户端：`ctx.remote.$mount(TYPERT_REMOTE)` 挂载描述符（`TYPERT_REMOTE` 在 `lib/typert.remote-client.js`），之后 `ctx.remote.<ns>.<method>()` 可调
- **客户端描述符的 schema 可以用恒等桩** `{ parse: (v) => v }`（客户端不校验，服务端用真 zod）

### 5.2 双条目方案（绕开守卫+死锁的正式解法）

**"同一个 client 插件既挂 remote 又消费 remote"在静态框架里是无解的**（守卫要声明、声明就死锁）。必须拆：

- **A. mount 条目**：`inject: ["remote"]`，只 `ctx.remote.$mount(...)`，不渲染 UI
- **B. UI 条目**：`inject: ["timer","remote","remote.costPanel"]`，渲染 UI 并消费——Cordis 等 A 挂出服务后才激活 B，顺序由依赖保证

曾尝试"同一 bundle 内 `ctx.plugin()` 拆双子插件"（A/B 各一个子插件）——理论可行但**实测未通过**（未确认子插件 inject 解析与顶层条目是否一致）。**要静态化就用字面意义的双包/双 patch 行。**

### 5.3 服务提供原则

**Host 服务必须无条件提供，不能因依赖服务暂缺而早退**：

```js
// ❌ fs 在 apply 早期可能未就绪（没声明 inject 时插件激活很早），直接 return 会丢服务
const fs = ctx.get('fs'); if (fs === undefined) return;
// ✅ 无条件 provide，方法内部再惰性 ctx.get('fs')
ctx.provide('explorer', { async list(path) { const fs = ctx.get('fs'); ... } });
```

（真实案例：file-browser 因 `if (fs === undefined) return` 导致 `explorer` 服务缺失，typert 端点在但服务不在 → 客户端调用全挂。）

---

## 6. 会话 / 投影 / 分叉

### 6.1 会话日志与 header

- 日志：zstd 多帧 JSONL，每事件一行；`{type, seq, time, data}`
- **会话 header（持久化，随日志第一帧）**：`{version, id, createdAt, cwd, parentSession?, seedLength?, ...}`
  - `parentSession` + `seedLength` **只在真分叉时写入** → 分叉的唯一可靠判据
- **`session/end-seed` 标记：分叉和重启恢复都会追加！**（真实会话里有 124 个）——**绝不能**用它判断分叉

### 6.2 投影（sessionProjections）

- `ctx.sessionProjections.register({ key, schema, init, apply(state, event), view, stateVersion })`
- 纯折叠，客户端 `useProjection(key)` 读（槽位 props 提供）；带持久化检查点（`$DSH_HOME/storages/session_projcache.json`）
- **投影 apply 是纯函数，看不到 session header** → 依赖 header 的逻辑（分叉归零）不能放投影里
- 客户端投影交付有**基线时序坑**：列表基线/历史尾页可能缺新注册的键（costSnapshot 曾因基线缺失显示 0，等新事件帧才补上）

### 6.3 分叉归零（计费）的正确实现

```js
// 首次接触会话时读 header.seedLength 定基线，只折叠基线之后的事件
if (s.baseline === null) {
  s.baseline = (session.header.seedLength || 0);
  if (s.foldedSeq < s.baseline) s.foldedSeq = s.baseline;
}
```
- 分叉会话：基线=seedLength → 只计分叉后的事件
- 原会话（含多次重启）：基线=0 → 跨重启计全量（重启恢复追加的 end-seed 标记**不**重置）

---

## 7. UI / 层叠实战坑

- **列内 absolute 定位的悬浮卡片会被侧边栏/详情栏压住**（列有 overflow:hidden + 层叠上下文）。解法：
  - `position: fixed` + 超高 z-index（`2147483000`），用 `getBoundingClientRect()` 实测锚点元素位置贴附
  - 或注册进 `shell.overlay`（页面级浮层，天然最顶）
- 动态版浮动面板用 `shell.overlay` 没问题；静态版头部卡片用"fixed + 实测位置 + 200ms 悬停宽限期"（胶囊→卡片鼠标路径不抖）
- 弹窗用 `position: fixed; inset: 0` 全屏遮罩，`onClick` 关闭 + `stopPropagation` 防误关

---

## 8. DeepSeek API 计费/缓存知识（计费插件依赖）

- **三桶计费**（每百万 tokens）：缓存命中输入（最便宜）/ 缓存未命中输入（全价）/ 输出
- **峰谷定价**（2026-08-17 00:00 北京时间生效）：高峰 9:00–12:00、14:00–18:00（北京），空闲减半。
  - flash：高峰 0.10/3.0/9.0 元，空闲 0.05/1.5/4.5；pro：高峰 0.30/9.0/27.0，空闲 0.15/4.5/13.5
  - 此前旧价：flash 0.02/1.0/2.0，pro 0.025/3.0/6.0
- **缓存命中率** = cacheRead ÷ (uncached + cacheRead + cacheWrite) × 100%
- usage 数据在 `assistant/message` 会话事件的 `data.usage`；模型名在 `data.message.source.model`；每条调用按**它发生时刻**的价格计费
- DeepSeek 上下文硬盘缓存：服务端 KV 前缀缓存，**按请求前缀完整匹配**，跨会话基本不命中；几小时~几天自动清空；"尽力而为"

---

## 9. 环境/工具备忘

- 会话日志解压（node）：
  ```js
  const { zstdDecompressSync } = require('node:zlib');
  // 日志是多帧 zstd：循环找 magic 0x28b52ffd 逐帧解压拼文本
  ```
- 读 Host 运行时状态：定义 Host-only probe 插件（harness.registerTool，免批准）直接读 `ctx.get(...)` 任意服务
- PowerShell 5.1 读 UTF-8 文件会乱码（GBK 显示）——验证文件内容用 node，别用 Get-Content 直接比对中文
- profile `nodeLinker: hoisted` → 手动复制即可装包；`dsh plugin --profile <name>` 需要 pnpm（本机未装）
- git 仓库：`C:\Users\22320\Desktop\dsh_WS\dsh-plugins`（本仓库），远端 origin = `https://github.com/sjtuszh/dsh-plugins.git`（master 已推送）

---

## 10. 决策备忘

- 计费面板：**当前以动态版使用**（动态插件 ID 每会话不同，本会话为 `cost-1`，源码在本仓库 `cost-panel/`）；静态版 `cost-panel-static/` 可直接 profile 挂载长期使用
- 文件树面板（2026-08 新做）：动态版 `file-panel/`（本会话 `file-1`）+ 静态版 `file-panel-static/`（双包，见 §11）

---

## 11. 文件树面板静态化实录（2026-08 下旬，双包 + Typert 方案）

需求：页面右侧浮动 📁 按钮拉出文件树栏，行内 ⋯ 菜单（复制路径 / 打开文件浏览器）。
与计费面板不同，文件树是**请求/响应**（列目录、打开资源管理器），投影（cost-panel-static 的做法）不适用 → 必须走 **Typert remote**。

### 11.1 双包方案（绕开 §4.3 死锁的落地形式）

- 客户端模块系统 **一行 patch = 一个包 = 一个 `exports["./client"]` bundle**（`dsh-client-modules` 源码确认）→ "同一包两个条目"做不到，必须拆两个包：
  - `dsh-file-panel`：UI bundle（`inject: ["slots","remote","remote.filetree"]`）+ Host 服务 + typert 清单
  - `dsh-file-panel-mount`：`inject: ["remote"]`，apply 只 `return ctx.remote.$mount(TYPERT_REMOTE)`（描述符内联，避免跨包 require）
- 顺序由依赖保证：mount 包先挂出 `remote.filetree`，UI 包才激活。

### 11.2 Typert 清单（手写要点，参照生成产物 `@deepseek-ai/dsh-message-feedback/lib/typert.host.js`）

- **host 清单**：`package` 必须等于包名；`face: 'host'`；`schemas: []` 可空；invocation 的 `parameters`/`result` codec 必须 `mode: 'strict'` + `typeSymbol` + **真 zod v4 schema**（校验要求 `_zod` 标记 + `parse` 函数，`dsh-typert-loader` 的 `validateTypertManifest` 源码逐字段核对）。
- **remote 描述符**（客户端 `$mount` 用）：**schema 可用恒等桩** `{ parse: (v) => v }`（客户端不校验，服务端用真 zod）。
- **校验**：`validateTypertManifest('dsh-file-panel', TYPERT)` 可直接从 `@deepseek-ai/dsh-typert-loader` import 复用 —— 本轮静态版清单已用它跑通。
- **zod 依赖**：`typert.host.js` 要 `import { z } from 'zod'`，而 web profile 的 `node_modules` 里**没有 zod**（只有手动复制的包）→ 安装时需从 dsh 安装目录手动复制 zod（MEMORY §3.4，已确认 dsh 自带 zod v4.4.3）。node_modules 已被 .gitignore，仓库里不放。

### 11.3 调用形态

- 客户端调用：`const r = await ctx.remote.filetree.list({ path }); r.ok ? r.value : r.error`（RemoteResult 包装，参照 `dsh-client-runtime` 消费 `remote.commands.execute` 的模式）。
- 静态 bundle 里 `document`/`window`/`navigator`/`setTimeout` 都是页面全局，可直接用（动态版才有 closure traps）。
- 服务端：`ctx.provide('filetree', {...})` **无条件提供**（§5.3），方法内部惰性 `ctx.get('fs'/'subprocess')`。

### 11.4 真实踩坑：explorer /select 的 argv 引号（v3/v4 修复）

- 症状：`filetree:reveal` 点击后资源管理器打开了，但**统一跳到 `C:\Users\22320\Documents`**，没有定位到文件。
- 根因链（两层都一样）：
  1. `dsh-subprocess-local` 的 `spawn()` **没有 `windowsVerbatimArguments: true`**（源码确认），Node 默认把参数内嵌 `"` 转义成 `\"`，`explorer /select,"C:\path"` 解析失败 → 回退默认位置；
  2. **走 `shell` 服务也没用**：`dsh-pwsh-local` 把命令作为**单个 `-Command` argv 元素**传给 pwsh（源码确认），命令串里的引号同样被转义 → 一层套一层，还是错。
- 最终方案：**命令写入临时 `.cmd` 文件（`fs.writeText` 不经 argv 序列化），再 `cmd /c <file>` 执行**。实测（node 打 argv 探针）：cmd 会剥离外层引号，但**完整保留含空格的路径** → 批量行用**整参引号**形式 `explorer.exe "/select,C:\path"`（目录用 `"C:\path"`），`chcp 65001 >nul` 保证中文路径按 UTF-8 解析。脚本固定为 `C:\Users\22320\.dsh\dsh-reveal.cmd`（每次覆盖写，无累积）。
- 结论：Windows 下任何**带内嵌引号**的参数都不要直接走 subprocess/shell argv；要么整参引号经批处理文件，要么确认实现开了 verbatim。

### 11.4b 真实踩坑：网关要求 `typertRemote` 绑定（静态版 v5 修复）

- 症状（静态版挂载后）：目录列表报 **`typert gateway: filetree/list: Service "filetree" has no visible typertRemote binding`**（清单已注册、端点被识别，但调用时服务对象不合格）。
- 根因（`dsh-api-gateway` 的 `validateBinding` 源码确认）：网关 `ctx.get(serviceKey)` 拿到服务对象后，要求对象上有 `typertRemote` 字段 = `{ service: <实例>, serviceKey, namespace }`。**普通 `ctx.provide('filetree', { 普通对象 })` 过不了**。
- 修复：服务类继承 **`@deepseek-ai/dsh-typert-protocol` 的 `TypertRemoteService`**（Cordis `Service` 子类）——构造器 `super(ctx, key)` 走 `ctx.reflect.provide(key, this)` 自动注册（随 fiber 卸载自动注销），并打上 `this.typertRemote = { service: this, serviceKey, namespace }` 绑定。`@Remote` 装饰器仅 SRC 模式需要，strict 清单不需要。
- 验证方法：假 ctx 实例化后检查 `inst.typertRemote.service === inst`（循环引用是正常的，JSON.stringify 会报 circular，这反而是绑定存在的证据）。
- 网关调用链备忘：`resolveDescriptor`（strict 优先）→ `assertExactArguments`（参数必须精确等于 wire 字段集）→ `ctx.get(service)` → `validateBinding`（typertRemote）→ 按 descriptor.parameters 解码 → `Reflect.apply(service[method], ...)` → 结果按 result codec 解码。

### 11.5 状态

- 动态版 `file-1` 已迭代到 `pkg-4`（v2 样式/刷新 → v3 临时 .cmd 方案 → v4 整参引号形式），用户已验证定位正确。
- 静态版：已装入 `profiles/web`（双包 + patch 三行：cost-panel/file-panel/file-panel-mount），组合树经 `dsh --profile web --dump-config` 验证；typert 清单过真实校验器；v5 host 改用 `TypertRemoteService`（绑定坑 §11.4b）。**重启验证中**——当前等待用户重启后确认。
- **下次静态化前必读**：§3（包/格式）、§4（守卫/死锁/ctx）、§5（双条目）、§6（分叉/投影）
- 静态化建议路径：先只固化文件浏览器（双包分离）验证跑通，再动计费
