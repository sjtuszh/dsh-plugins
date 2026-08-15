# DeepSeek 双轨计费面板(cost-panel)

在 DeepSeek Harness Web GUI 的**会话头部**显示当前会话 API 调用费用的动态 Cordis 插件。

- 顶部小胶囊显示总费用(人民币)
- 悬停 → 摘要卡片:token 三桶环形图、本轮费用、会话类型(原会话/分叉会话)、计价方案徽章
- 点击「查看历史调用」→ 弹层显示最近 100 条调用明细(时间、模型、单价分解、缓存命中率)
- 每次新调用时胶囊旁弹出 `+¥xx` 浮动气泡

## ✨ 特性

- **双轨计价**(详见 [`COST_PANEL_REQUIREMENTS.md`](../COST_PANEL_REQUIREMENTS.md)):
  - **Relay / GPT 模型**(`gpt-5.4`、`gpt-5.5`、`gpt-5.6-sol/terra`、`gpt-5.4-mini` 等):按美元额度计价,再按 `1 额度$ = ¥0.4` 折算人民币显示。
  - **DeepSeek 官方模型**(`deepseek-*`):直接人民币计价;2026-08-17 之后按北京时间**高峰价**(09:00–12:00、14:00–18:00)与**空闲价**切换,此前为旧价。
- **会话起算点**:分叉会话从 `session.header.seedLength` 起算,原会话从 `seq=0` 起算。
- **三层聚合**:会话总计、每轮(turn)总计、调用历史(最近 100 条)。
- **账本持久化**:费用写入 `C:\Users\22320\.dsh\dsh-cost-ledger.json`,激活时恢复、运行中每 5 秒增量 flush、停止时强制保存、账本损坏时从空内存重建。

## 🛠 使用(动态插件)

1. 在 DSH 会话中调用 `cordis_define`,将 [`src/host.js`](src/host.js) 的内容作为 `code.host`、[`src/client.js`](src/client.js) 的内容作为 `code.client`。
2. 调用 `cordis_run` 激活(Client 半边首次需要用户在界面批准)。
3. 会话头部出现费用胶囊即成功;悬停/点击可查看明细。

> 动态插件定义于当前进程,DSH 重启后需重新定义。如需长期挂载,仓库已提供现成静态版 [`../cost-panel-static/`](../cost-panel-static/README.md)(profile 挂载、随启动自动加载、免批准)。

## ⚙️ 配置

- **账本路径**:Host 半边顶部 `LEDGER_PATH` 常量(Windows 反斜杠需转义)。发布到其他环境时请按需修改。
- **费率表**:`RELAY_RATES`(美元/1M tokens)与 `LEGACY_RATES`(人民币/1M tokens)定义在 Host 半边,可按新价格调整。
- **高峰时段**:北京时间 09:00–12:00、14:00–18:00(常量 `isPeak`)。

## 📐 架构

| 半边 | 文件 | 职责 |
|------|------|------|
| Host | `src/host.js` | 监听 `session/event` 折叠 `assistant/message`;计价;三层聚合;账本读写;暴露 `cost:snapshot` / `cost:history` 两个 RPC |
| Client | `src/client.js` | 在 `conversation.session.header.actions` 槽位注册费用胶囊;每 1.5s 轮询快照;渲染卡片/历史弹层/气泡 |

客户端只依赖两个 Host RPC:`cost:snapshot` 与 `cost:history`。
