# dsh-plugins — DeepSeek Harness 插件集

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

为 [DeepSeek Harness](https://github.com/deepseek-ai) Web GUI 开发的 Cordis 插件集合。

## 📦 插件列表

| 插件 | 目录 | 状态 | 说明 |
|------|------|------|------|
| DeepSeek 双轨计费面板 | [`cost-panel/`](cost-panel/) | ✅ 可用 | 会话头部实时显示 API 调用费用:Relay/GPT 美元额度折算 + DeepSeek 官方高峰/空闲人民币计价,带账本持久化与历史明细 |

## 🚀 快速开始

本仓库插件以 **动态 Cordis 插件** 形式运行(定义于当前 DSH 进程内,无需重启):

1. 打开插件的 `README.md`(如 [`cost-panel/README.md`](cost-panel/README.md)),了解特性与需求。
2. 在 DSH 会话中,将插件的 `src/host.js` 与 `src/client.js` 内容分别作为 `cordis_define` 的 `code.host` 与 `code.client` 提交。
3. 用 `cordis_run` 激活(Client 半边首次需要批准)。

> 提示:动态插件在 DSH 进程重启后需要重新定义;正式长期使用可参考 [`MEMORY.md`](MEMORY.md) 中的静态化(profile 挂载)方案。

## 📁 仓库结构

```
dsh-plugins/
├── README.md                      # 本文件
├── LICENSE                        # MIT 许可证
├── MEMORY.md                      # 开发记忆(架构、踩坑、静态化方案)
├── COST_PANEL_REQUIREMENTS.md     # 计费插件需求说明
└── cost-panel/                    # 计费面板插件
    ├── README.md                  # 插件文档(特性/计价规则/使用)
    └── src/
        ├── host.js                # Host 半边源码(计费内核 + 账本 + RPC)
        └── client.js              # Client 半边源码(胶囊 UI + 卡片 + 历史弹层)
```

## 🤝 贡献

欢迎提交 PR / Issue。开发前请先阅读 [`MEMORY.md`](MEMORY.md)——里面记录了所有真实踩过的坑。

## 📄 许可证

[MIT](LICENSE)
