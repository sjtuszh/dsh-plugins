# Provider Authoring Guide

一个 provider 是 `ctx.computerUse` seam 的一个实现：它为一种机制（fake / Playwright 浏览器 / Windows 原生 helper）实现"观察一个目标、执行一次动作、停止"。

## 1. 契约：`ComputerUseProvider`

```ts
interface ComputerUseProvider {
  readonly id: string
  available(): boolean
  start(request: StartRequest, signal?: AbortSignal): Promise<ComputerUseSession>
  listTargets(sessionId: ComputerUseSessionId, signal?: AbortSignal): Promise<readonly ComputerUseTarget[]>
  observe(request: ObserveRequest, signal?: AbortSignal): Promise<ComputerUseObservation>
  act(request: ActRequest, signal?: AbortSignal): Promise<ComputerUseObservation>
  stop(request: StopRequest): Promise<void>
}
```

类型见 `src/types.ts`。要点：

- `id` 是 registry 键，全局唯一。
- `available()` 在 provider 不可用（例如已 `dispose`）时返回 `false`，`ctx.computerUse` 会据此 fail-closed。
- 所有异步方法必须尊重 `signal`；取消后不得继续产生副作用。
- **`act` 必须遵守"一次观察一次动作"**：动作引用 `request.observationId`，动作后返回一个**全新** observation，旧 id 失效。过期/不匹配 → 抛 `STALE_OBSERVATION`。

## 2. 注册

在 provider 插件的 `apply` 里：

```ts
export const inject = ['computerUse']

export function apply(ctx: Context) {
  const provider = new MyProvider(...)
  ctx.computerUse.registerProvider(provider)
  ctx.effect(function* () {
    yield () => { void provider.dispose() }  // 清理进程/资源
  })
}
```

`registerProvider` 是 effect-based，返回 disposer，卸载时自动撤销。`ctx.computerUse` 的运行时选择规则：配置的 `provider` id 优先；否则恰好一个 `available()` 的 provider 自动选中；零个/多个 → 明确报错（`PROVIDER_UNAVAILABLE` / `PROVIDER_AMBIGUOUS`）。

## 3. 内置 provider 参考

| Provider | 状态 | 说明 |
| --- | --- | --- |
| `fake` | ✅ 完整 | 纯内存、确定性，contract tests 用；强制 stale/过期 fail-closed |
| `playwright` | ✅ 完整 | 隔离 Chromium；截图→`ctx.attachments`；短生命周期 elementId→locator；domain allowlist |
| `windows` | ✅ TS 侧完整 | 转发到原生 helper 协议（`src/native/*`）；状态在 helper 内，本 provider 只透传 |

## 4. 测试要求

- **必须**通过 `test/fake.contract.test.ts` 里的同款生命周期 + 不变量断言（start→observe→act→observe→stop、stale fail-closed、id 再生成）。
- 浏览器类 provider 参照 `test/playwright.contract.test.ts`（mock attachment + `data:` URL，无浏览器时 skip）。
- 原生类 provider 参照 `test/windows.contract.test.ts`（mock helper connection，keyless）。
- 任何真实鼠标/键盘/网络动作都必须有对应的 keyless 契约测试兜底。

## 5. 不该做的

- 不要把 provider 内部指针（locator / HWND / native handle）暴露进 model-visible 结果——用 opaque、短生命周期的 branded id。
- 不要在 provider 里读取 API key；凭据走 `ctx.credentials`。
- 不要在 provider 里实现 policy；policy 属于 `tools/pre-execute` + `ctx.approval`（见 `src/policy.ts` / `src/risk.ts`）。
