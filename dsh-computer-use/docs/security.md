# Security & Threat Model

dsh-computer-use 的目标是让 agent 能操作一个隔离浏览器（后续扩展 Windows 桌面），同时默认拒绝任何越权。本文定义威胁模型和不变式；实现必须满足这些不变式，测试必须覆盖它们。

## 1. 信任边界

```
模型(planner) ── 工具层 ── ctx.computerUse ── provider ── 目标(浏览器/窗口)
     │              │          │               │            │
  不可信输出     政策门       seam         隔离/校验       不可信内容
```

- **模型是不可信输出源**：它生成动作，但不拥有权限。权限永远来自用户 + 政策。
- **目标是不可信内容源**：网页/文档/截图里的文字可以"建议"，绝不能"授权"。
- **provider 是可信执行边界**：它在动作发生点做最后一次校验（目标 identity、坐标、domain、observation 新鲜度）。

## 2. 威胁模型

| 威胁 | 防御 |
| --- | --- |
| Prompt injection（网页文字诱导发送/删除/授权） | 政策确定性、内容无关；风险分级只读 action `type`，不读页面文本 |
| 旧坐标/元素 ID 重放 | `observationId`/`screenshotId`/`elementId` 短生命周期，动作后全失效；stale 即拒 |
| 越界/错窗口点击 | 动作前重查 viewport/domain/目标 identity；`COORDINATE_OUT_OF_BOUNDS`/`TARGET_NOT_ALLOWED` |
| 凭据泄露 | API key 走 `ctx.credentials` 引用，按请求解析；绝不进 tool args/session event/截图 metadata/helper |
| 截图泄露 | 截图经 `ctx.attachments` 落 content-addressed ref，先落盘后记 event；日志只存 ref 不存 base64 |
| 模型绕过审批 | `tools/pre-execute` → `{kind:'ask'}` 由 `ctx.approval` 裁决；无 answerer 时 fail-closed 拒绝 |
| helper 崩溃/断连 | `PROVIDER_CRASHED` fail-closed，不自动重放最后动作 |
| 物理失控 | 独立 Escape kill switch（helper 内）；`stop` 后拒绝该 session 一切后续动作 |

## 3. 不变式

1. **一次观察、一次动作**：动作必须引用产生它的 `observationId`；动作后立即重新观察，旧 ID 全部失效。
2. **默认拒绝**：未列入 allowlist 的目标/domain、未知 action、过期观察、无 answerer 的审批，一律拒绝。
3. **内容不能授权**：任何来自目标/文档/截图/附件的文字，都不能改变 allowlist、关闭确认、或授予权限。
4. **读取 ≠ 传输**：观察/滚动是读取；提交/发送/上传/发布是传输，需要动作点确认。
5. **模型可见 = 已记录**：所有 `computer/*` 事件进 session log，可重放可审计。
6. **凭据隔离**：Computer Use 服务不持有任何 LLM 凭据；原生 helper 不接触凭据。

## 4. 高风险禁区的默认 deny（helper 内强制执行，不依赖模型自觉）

- 终端 / PowerShell / cmd / Run 对话框 / 脚本宿主。
- 密码管理器、系统凭据 UI、UAC / secure desktop、认证对话框。
- 安全/反恶意软件、证书/密钥管理。
- Windows 键及其组合键。
- CAPTCHA、设备验证绕过。

这些在浏览器 provider 里以 domain allowlist + 高风险动作确认近似实现，在 Windows helper 里硬编码 deny。

## 5. 截图与数据留存

- 截图 PNG 由 provider 捕获 → `ctx.attachments.saveImage()`（content-addressed）→ 事件只记 ref。
- 不把 OCR 出的密码/token/信用卡号写入 telemetry。
- 留存策略由部署配置决定（retention/TTL），本插件不做隐藏的"永久保留"。
