# Native Helper Protocol (v1)

dsh-computer-use 的 Windows 原生 helper 协议。**这是本项目的自有协议**——不是任何上游 wire format 的复制；仅借鉴可观察的"客户端进程 ↔ 原生 helper"分层，消息格式、方法、错误码和截图通道全部重新设计。

## 1. 目标与范围

- **模型无关、provider 无关**：协议只描述"观察一个目标、执行一次动作、停止"，不携带任何模型/凭据。
- **版本化、显式协商**：breaking wire change 增加 major；客户端与 helper 启动时握手，版本不匹配 fail-closed。
- **fail-closed**：未知方法、越界坐标、旧 observation、未批准目标、超限 frame 全部拒绝，不静默降级。
- **截图出带**：截图不进 JSON frame；用受控临时文件 + 内容 hash + 生命周期传递（见 §6）。

## 2. 传输

- **通道**：Windows named pipe，per-user ACL（仅当前登录用户可连）。
- **framing**：4 字节 little-endian uint32 长度前缀 + UTF-8 JSON payload（见 `src/native/framing.ts`）。
- **上限**：单 frame ≤ 8 MiB（双向同上限；截图出带，因此无需更大）。
- **生命周期**：helper 由客户端 spawn（默认），父进程退出即终止；或由桌面 App 托管（复用同一 pipe 协议）。

## 3. 消息信封

```ts
// request（client → helper）
interface NativeRequest {
  id: number                    // 单调递增，用于响应关联
  method: NativeMethod
  params: Record<string, unknown>
}

// response（helper → client）
interface NativeResponse {
  id: number
  ok: boolean                   // false 时携带 error
  result?: unknown
  error?: { code: string; message: string }
}

// event（helper → client，无 id，主动推送）
interface NativeEvent {
  event: string                 // 'target-changed' | 'interrupted' | 'crashed'
  data: Record<string, unknown>
}
```

## 4. 握手

首个请求必须是 `handshake`：

```json
{ "id": 0, "method": "handshake", "params": { "protocolVersion": 1, "nonce": "<random>" } }
```

helper 校验版本；不匹配返回 `{ ok: false, error: { code: "PROTOCOL_MISMATCH" } }` 并断开。

## 5. 方法

| method | params | result | 说明 |
| --- | --- | --- | --- |
| `handshake` | `protocolVersion, nonce` | `{ helperVersion, protocolVersion }` | 启动协商 |
| `listTargets` | `{ sessionId }` | `{ targets: Target[] }` | 枚举可见窗口/目标 |
| `observe` | `{ sessionId, targetId, include }` | `{ observation }` | 截图 + UIA 树快照 |
| `act` | `{ sessionId, targetId, observationId, action }` | `{ observation }` | 单次动作 + 重新观察 |
| `stop` | `{ sessionId }` | `{}` | 停止会话 |
| `ping` | `{}` | `{}` | 存活探测 |
| `close` | `{}` | `{}` | 优雅关闭 |

`Target`、`Observation`、`Action` 的形状与进程内 `ctx.computerUse` 的类型一致（`src/types.ts`），helper 内再投影到 UIA/WGC/SendInput。

## 6. 截图通道（出带）

- `observe` 结果里的 `screenshot` 不含像素；只含 `{ screenshotId, width, height, filePath, sha256, bytes }`。
- helper 把 PNG 写入**当前用户临时目录下受控命名**的文件，返回绝对路径 + hash；客户端读完即请求删除（或按 TTL 回收）。
- 客户端拿到字节后经 `ctx.attachments.saveImage()` 落成 content-addressed ref，再进 session log——全程不把 base64 塞进 JSON。

## 7. 错误码

继承 `src/errors.ts` 的稳定码（`STALE_OBSERVATION`、`TARGET_NOT_ALLOWED`、`COORDINATE_OUT_OF_BOUNDS`、`PROTOCOL_MISMATCH`、`USER_INTERRUPTED`、`PROVIDER_CRASHED`…），另加传输级 `MALFORMED_FRAME`、`FRAME_TOO_LARGE`。错误不泄露 native handle、路径或敏感 UI 文本。

## 8. 安全不变量（helper 内强制执行）

1. 动作前重新验证 PID / 窗口 identity / foreground / modal / 坐标 bounds / allowlist。
2. `observationId`、`screenshotId`、element id 只对产生它们的 observation 有效；过期即拒。
3. 物理 Escape 独立 kill switch；`stop` 后拒绝该 session 的一切后续动作。
4. 禁止目标（终端、密码管理器、安全软件、认证 UI）在 helper 内默认 deny，不依赖模型自觉。
5. helper 不持有任何 LLM credential；凭据只走 Harness 的 `ctx.credentials` 按请求解析。
