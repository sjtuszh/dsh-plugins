# DeepSeek 计费插件需求说明

本文件用于在新对话里从零重做计费插件，保留需求与核心逻辑约束，不依赖旧动态插件或旧 UI 实现。

## 一、产品目标

做一个 DeepSeek Harness Web GUI 用的计费插件，展示当前会话 API 调用费用。

目标风格：
- 可以用胶囊、卡片等 UI 元素
- 界面要干净、稳定、可继续重构
- 不要再沿用之前混乱的旧客户端实现

## 二、必须满足的计费规则

### 1. 会话起算点（硬约束）
- 原始会话：从 `seq = 0` 开始计费
- 分叉会话：从 `session.header.seedLength` 开始计费
- `header.seedLength` 是唯一权威

### 2. 双轨计价
#### Relay / GPT / Codex
- 先按美元额度计价
- 再按 `1 额度$ = ¥0.4` 折算人民币显示

费率（$/1M）：
- gpt-5.6-sol：input 5 / output 40 / cacheRead 0.5 / cacheWrite 5
- gpt-5.6-terra：input 2.5 / output 20 / cacheRead 0.25 / cacheWrite 3.125
- gpt-5.5：input 5 / output 30 / cacheRead 0.5 / cacheWrite 5
- gpt-5.4-mini：input 0.75 / output 4.5 / cacheRead 0 / cacheWrite 0.75
- gpt-5.4：input 2.5 / output 15 / cacheRead 0.25 / cacheWrite 2.5
- 未匹配 relay 模型默认按 gpt-5.4 处理

#### DeepSeek 官方
- 直接按人民币计价，不折算
- 2026-08-17 前旧价
- 之后按北京时间高峰/空闲价切换

高峰时段：
- 09:00–12:00
- 14:00–18:00

flash：
- old: hit 0.02 / miss 1.0 / out 2.0
- off: hit 0.05 / miss 1.5 / out 4.5
- peak: hit 0.10 / miss 3.0 / out 9.0

pro：
- old: hit 0.025 / miss 3.0 / out 6.0
- off: hit 0.15 / miss 4.5 / out 13.5
- peak: hit 0.30 / miss 9.0 / out 27.0

## 三、事件来源与统计逻辑

只折叠：
- `assistant/message`

读取字段：
- `event.data.usage.inputTokens`
- `event.data.usage.outputTokens`
- `event.data.usage.cacheReadTokens`
- `event.data.usage.cacheWriteTokens`
- `event.data.message.source.model`
- `event.data.turn`
- `event.data.step`
- `event.time`
- `event.seq`

需要保留三层聚合：
- session totals
- per-turn totals
- call history（最近 100 条）

## 四、持久化

账本文件：
- `C:\Users\22320\.dsh\dsh-cost-ledger.json`

要求：
- 激活时恢复
- 运行中持续 flush
- 停止时强制保存
- ledger 损坏时允许从空内存重建

## 五、Host / Client 契约

客户端只依赖两个 Host RPC：
- `cost:snapshot`
- `cost:history`

## 六、UI 重做方向

旧 UI 全部可推倒重做。

建议新结构：
1. 顶部小胶囊
2. hover 摘要卡片
3. click 详情弹层

## 七、重做注意事项

- 不要改动计费内核含义
- 不要破坏 ledger 逻辑
- 不要再沿用之前混乱的 client 版本链
- Windows 路径在动态代码里注意反斜杠转义
