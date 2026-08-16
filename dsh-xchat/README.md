# dsh-xchat — 跨会话知识桥

DSH 插件：实现**对话间的相互通信**。在一个对话中需要另一个会话的知识时，在目标会话名下**原生拉起一个继承该会话完整记忆的 fork 子代理**，向它询问关键信息并取回回复；信息不够可反复追问；用完结束子代理。

## 功能

### 1. `@` 会话候选（客户端）
- **任意位置触发**：行首/空格后的 `@` 走原生输入触发菜单；紧跟字母/汉字/数字（如 `你好@`）由自绘菜单接管（检测 input 事件 + 原生 value setter 注入 draft）
- **会话大全**：候选来自 client `sessions.list`（跨工作区、子代理会话、归档会话全量），显示真实标题 + 状态（运行中/子代理/路径）
- 菜单样式跟随 DSH 主题（明暗自适应）
- 选中插入 `@会话名 `，Esc 关闭，点击外部关闭

### 2. `xchat_query` 工具（宿主）
| action | 行为 |
|---|---|
| `start` | 解析 `@会话名`/`\会话名` → 目标会话不 live 时 `agents.resume` 恢复 → `subagents.startContinuable({ provider: 'fork' })` 拉起继承目标会话完整对话历史的子代理 → 等待其整理回复 |
| `ask` | `subagents.followup` 向同一子代理追问（保持记忆） |
| `stop` | `subagents.interrupt` 结束子代理 |

## 安装（挂载到 profile）

1. 安装包到 profile：
   ```powershell
   # 复制（或 link）到 web profile 的 node_modules
   Copy-Item -Recurse C:\Users\22320\Desktop\dsh_WS\dsh-plugins\dsh-xchat C:\Users\22320\.dsh\profiles\web\node_modules\dsh-xchat
   ```
   或 link（推荐，改代码即时生效）：
   ```powershell
   # 在 profile 目录执行
   pnpm link C:\Users\22320\Desktop\dsh_WS\dsh-plugins\dsh-xchat
   ```

2. 在 `C:\Users\22320\.dsh\profiles\web\cordis.patch.yml` 添加：
   ```yaml
   - insert:
       - id: xchat
         name: dsh-xchat
   ```

3. 重启 `dsh web`。

## 使用

- 输入框任意位置输入 `@` → 选择会话 → 发送，例如：
  > 参考 @会话名 问一下它之前讨论的关键结论
- 模型会调用 `xchat_query`：start（拉起记忆子代理并询问）→ ask（追问）→ stop（结束）

## 说明

- 与 `@子代理`/`@插件` 引用并存：行首/空格后的 `@` 菜单里三组并列；紧贴文字的 `@` 只弹会话组（自绘）。
- 子代理创建在**目标会话名下**（父 = 目标会话，继承其完整记忆），结束后目标会话会收到子代理结算通知。
- 源码见 `lib/host.js`（工具 + fork 链路）、`lib/client.js`（@ 菜单）。
