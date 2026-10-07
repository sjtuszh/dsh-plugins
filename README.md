# dsh-plugins — DeepSeek Harness 插件集

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

为 [DeepSeek Harness](https://github.com/deepseek-ai) Web GUI 开发的 **Cordis 静态插件** 集合。

> 本仓库只保留**静态插件**（profile 挂载、可 npm 发布）。动态版（`cordis_define` + `cordis_run`）已全部移除——它只活在一个进程里、需要批准、重启即失。

## ⚠️ 环境要求（先读这个）

**已验证的运行组合 = DSH `0.1.5-rc.2` + 下表版本。插件目前只适配到 DSH `0.1.5-rc.2`。**

- ⛔ **请勿把 DSH 升到 `0.2.0-rc.2`**（这是 npm 上的 `latest`）。插件尚未适配 0.2.x，**我们目前也没有适配 0.2.0 的计划**；升级后插件很可能不加载，甚至让 `dsh web` 起不来。
- 安装 DSH 时**钉版本**：`npm i -g @deepseek-ai/dsh@0.1.5-rc.2`（不要用 `@latest` / `@next` / `@alpha`）。
- 安装插件时也**钉版本**（下表），不要用 `@latest`，以免解析到未验证的新版本。

| 插件 | 实测稳定版本（本机正在跑） | 作用 |
|---|---|---|
| `dsh-cost-panel` | **1.7.0** | 双轨计费面板 |
| `dsh-organizer-sidebar` | **1.0.7** | 会话侧边栏组织器 |
| `dsh-xchat` | **1.0.7** | 跨会话知识桥 |
| `dsh-lan` | **0.2.1** | LAN 网关 + 机器切换器 |
| `dsh-file-actions` | **0.1.0** | 官方文件树行内 ⋯ 菜单 |

> 同系列另有三个**补丁版**：`dsh-cost-panel@1.7.1`、`dsh-xchat@1.0.8`、`dsh-organizer-sidebar@1.3.8`——
> 唯一改动是移除 DSH 0.1.5 已删除的 `@deepseek-ai/dsh-client-runtime` 声明（同样以 0.1.5-rc.2 为目标）。
> 它们**未在上表这台机器上实跑验证**；如果你在 0.1.5-rc.2 上遇到插件 UI 不加载，可以换成它们。

## 🖥️ 换新机？先看《新机 DSH 配置指南》

把本机这套环境完整复刻到一台新机器（Windows）的全部步骤——装 DSH、**过认证**（`?token=` URL / 30 天 cookie / iframe 注入代理）、
装插件、配 MCP（GitHub / 立创商城 / LTspice）、VS Code 面板桥、托盘启动器、验证清单、踩坑速查：

**➡️ [`docs/new-machine-setup.zh.md`](docs/new-machine-setup.zh.md)**

一页速记（**版本已钉死**）：

```powershell
npm i -g @deepseek-ai/dsh@0.1.5-rc.2      # 不要用 @latest（那是 0.2.0-rc.2，未适配）
dsh web                                    # 首次自动初始化 web profile；记下带 ?token= 的 URL 并打开一次
dsh plugin --profile web add dsh-cost-panel@1.7.0
dsh plugin --profile web add dsh-organizer-sidebar@1.0.7
dsh plugin --profile web add dsh-xchat@1.0.7
dsh plugin --profile web add dsh-lan@0.2.1
dsh plugin --profile web add dsh-file-actions@0.1.0
# 在 cordis.patch.yml 里加 MCP 行，然后重启 dsh web
```

## 📦 插件列表

每个目录名 = npm 包名，可直接 `dsh plugin --profile <name> add <pkg>` 一键安装。

| npm 包 | 目录 | 版本 | 状态 | 说明 |
|--------|------|------|------|------|
| `dsh-cost-panel` | [`dsh-cost-panel/`](dsh-cost-panel/) | 1.7.1 | ✅ 已装（npm `1.7.0`） | 双轨计费面板：会话头部实时计费、历史调用/定价表、跨会话总量统计、DeepSeek API 余额 |
| `dsh-organizer-sidebar` | [`dsh-organizer-sidebar/`](dsh-organizer-sidebar/) | 1.3.8 | ✅ 已装（npm `1.0.7`，落后 5 个小版本） | 会话侧边栏组织器：拖拽分组/排序、已归档/已删除双 tab、批量还原、子代理管理 |
| `dsh-xchat` | [`dsh-xchat/`](dsh-xchat/) | 1.0.8 | ✅ 已装（npm `1.0.7`） | 跨会话知识桥：`@` 会话候选 + 拖拽会话入聊天窗 + `xchat_query` 工具 |
| `dsh-lan` | [`dsh-lan/`](dsh-lan/) | 0.2.0 | ✅ 已装（npm `0.2.1`） | LAN 网关 + 机器切换器：把各机 loopback 的 DSH 上抛局域网并互相内嵌。⚠️ 仓库源码比 npm 旧，发布前需先对齐 |
| `dsh-file-actions` | [`dsh-file-actions/`](dsh-file-actions/) | 0.1.0 | ✅ 已装（link） | 给**官方**右侧栏 Files 文件树加行内 ⋯ 菜单（复制文件地址 / 在文件管理器中显示），以 extension 档接管 `kind: files`，不改官方包 |
| `dsh-file-panel` | [`dsh-file-panel/`](dsh-file-panel/) | 1.0.1 | ⛔ 已退役 | 旧的浮动文件树面板。DSH 0.1.5 官方右栏 Files tab + `dsh-resource://file/**` 文档预览 + 会话头部 Open In... 已覆盖其功能，已从 profile 卸载（`dsh-file-actions` 接替其中的行内动作） |
| `dsh-tray` | [`dsh-tray/`](dsh-tray/) | — | 🧰 独立工具 | Windows 系统托盘启动器（无 `package.json`，不是插件） |

> ℹ️ `dsh-cost-panel@1.7.1`、`dsh-xchat@1.0.8`、`dsh-organizer-sidebar@1.3.8`、`dsh-file-actions@0.1.0`
> 已于 **2026-10-06 公开发布**（npm 现在把 bypass-2FA token 限制成「只能暂存 + 维护者 2FA 批准」，流程见
> [MEMORY.md §13.6](MEMORY.md)）。**但请按上面「环境要求」那套实测稳定版本安装**，不要装 `@latest`。

**已移除**：`dsh-computer-use`（本地 fork，npm 上该包属上游 `jerryweizhihao`）、`dsh-agent-teams`
（fork 仓库，其 npm 包已改名 `dsh-agent-squad` 独立存在）——两者的本地目录、profile 挂载与仓库文件均已删除。

## 🖥️ 参考部署现状（profile: `web`）

```
dependencies                       dsh.profile.bundles
──────────────                     ───────────────────
dsh-cost-panel      ^1.7.0         @deepseek-ai/dsh-base
dsh-file-actions    link:…         @deepseek-ai/dsh-web-app
dsh-lan             ^0.2.1         dsh-cost-panel
dsh-organizer-sidebar ^1.0.7       dsh-xchat
dsh-xchat           ^1.0.7         dsh-organizer-sidebar
                                   dsh-lan
                                   dsh-file-actions
```

## 🚀 安装 / 卸载

```powershell
# 钉版本安装（用上面「环境要求」里那套实测稳定版本）
dsh plugin --profile web add dsh-cost-panel@1.7.0
dsh plugin --profile web add dsh-organizer-sidebar@1.0.7
dsh plugin --profile web add dsh-xchat@1.0.7
dsh plugin --profile web add dsh-lan@0.2.1
dsh plugin --profile web add dsh-file-actions@0.1.0

# 本地源码开发（link）与卸载
dsh plugin --profile web add link:C:/path/to/dsh-plugins/dsh-file-actions
dsh plugin --profile web remove dsh-file-actions
```

安装后**重启 `dsh web`** 生效（客户端模块图与 bundle 在启动时缓存）。回滚：`remove` + 重启。

> ⚠️ 两条与「装不上 / 跑不起来」直接相关的坑：
> 1. **不要用 `@latest`**：DSH 的 `latest` 已是未适配的 `0.2.0-rc.2`；插件同理，装经过验证的那几个版本号。
> 2. pnpm 11 的 `minimumReleaseAge` 会**拒绝发布不足 10 天的版本**，让刚发的插件装不上——把它加进
>    `profiles\web\pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（写法见[指南 §3.3](docs/new-machine-setup.zh.md#33-pnpm-11-的-minimumreleaseage刚发布的版本装不上)）。


## 🧰 维护工具（[`tools/`](tools/)）

DSH 大版本升级会让插件成批损坏（模块改名、服务消失、客户端依赖图变化）。[`tools/`](tools/) 固化了标准动作：

1. `node tools/inventory-installed.mjs <profile>/node_modules` —— 体检已装插件的 `inject`、`bundle.patch`、残留 API
2. `node tools/fix-client-inject.mjs <package.json…>` —— 批量修 `inject`（改完 `JSON.parse` 校验，不合法不落盘）
3. 重启 `dsh web` 验证

改客户端 bundle 前先跑 `node tools/smoke-file-actions.mjs dsh-file-actions/lib/client.js <含 react 的 node_modules>`——它的桩 ctx 复刻了 Cordis 的 inject 门禁，能在重启之前拦住「漏声明服务 → `dsh web` 起不来」这类崩溃。

## 📁 仓库结构

```
dsh-plugins/
├── README.md                      # 本文件
├── LICENSE                        # MIT
├── MEMORY.md                      # 开发记忆（架构、框架坑、踩坑实录）
├── docs/                          # 文档：新机 DSH 配置指南
├── tools/                         # 维护工具（升级体检 / inject 修复 / 冒烟测试 / 认证接入）
├── dsh-cost-panel/                # 单包：Host + Client bundle + Typert 清单
├── dsh-organizer-sidebar/         # 单包：影子替换 sidebar.workspaces
├── dsh-xchat/                     # 单包：@ 候选 + xchat_query 工具
├── dsh-lan/                       # 单包：Host 网关 + 客户端切换器
├── dsh-file-actions/              # 纯客户端：接管官方 files tab 正文
├── dsh-file-panel/                # 已退役（保留源码以供参考/回滚）
└── dsh-tray/                      # 独立工具（Windows 托盘启动器）
```

单包范本（以 `dsh-cost-panel` 为例）：

```
dsh-cost-panel/
├── package.json        # dsh.bundle.patch + dsh.client 声明（files 白名单）
├── cordis.patch.yml    # bundle patch：install 时自动应用的一行 insert
├── README.md
└── lib/
    ├── host.js                    # Host 半边
    ├── client.js                  # Client bundle（window.__ModuleLoader__.load）
    ├── typert.host.js             # Typert 严格清单（如有）
    └── typert.remote-client.js    # Remote 描述符（如有）
```

## ⚠️ 两条硬约定

1. **客户端 `inject` 必须与 `apply()` 实际访问的服务一一对应**（含 `remote.xxx` 这样的点号路径），否则运行时报 `cannot get property "x" without inject`，**`dsh web` 直接起不来**。详见 [MEMORY.md §4](MEMORY.md)。
2. **别人写不出来的效果，先找官方扩展席位**：改官方行为优先用官方公开的档位/席位（如 `sidebarRightTabs` 的 `extension` 档接管 `builtin`），而不是改官方包或抢 DOM——前者升级不丢，卸载即恢复。

## 📄 许可证

[MIT](LICENSE)
