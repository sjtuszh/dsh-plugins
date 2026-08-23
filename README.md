# dsh-plugins — DeepSeek Harness 插件集

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

为 [DeepSeek Harness](https://github.com/deepseek-ai) Web GUI 开发的 **Cordis 静态插件** 集合。

> 本仓库只保留**静态插件**（profile 挂载、npm 可发布）。动态版（`cordis_define` + `cordis_run`）已移除。

## 📦 插件列表

每个目录名 = npm 包名，可直接 `dsh plugin --profile <name> add <pkg>` 一键安装。

| npm 包 | 目录 | 说明 |
|--------|------|------|
| `dsh-organizer-sidebar` | [`dsh-organizer-sidebar/`](dsh-organizer-sidebar/) | 会话侧边栏组织器:拖拽排序/分组、已归档/已删除双 tab、批量还原删除、回收站删除 |
| `dsh-cost-panel` | [`dsh-cost-panel/`](dsh-cost-panel/) | DeepSeek 双轨计费面板:会话头部实时计费、历史/定价表/总量统计、余额展示 |
| `dsh-file-panel` | [`dsh-file-panel/`](dsh-file-panel/) | 文件树浏览面板:浮动按钮 + 文件树、复制路径、打开文件浏览器 |
| `dsh-xchat` | [`dsh-xchat/`](dsh-xchat/) | 跨会话知识桥:@会话名 拉起继承记忆的子代理咨询 |
| `dsh-lan` | [`dsh-lan/`](dsh-lan/) | 局域网（LAN）相关插件 |

## 🚀 安装

```powershell
dsh plugin --profile web add dsh-organizer-sidebar    # 任意插件名
```

安装后重启 `dsh web` 生效。回滚：`dsh plugin --profile web rm <pkg>` + 重启。

> ⚠️ pnpm v11 默认 `minimumReleaseAge: 10 天`：刚发布的包会被拦截，钉版本号安装：
> `dsh plugin --profile web add dsh-organizer-sidebar@<version>`

## 📁 仓库结构

```
dsh-plugins/
├── README.md                      # 本文件
├── LICENSE                        # MIT 许可证
├── MEMORY.md                      # 开发记忆(架构、踩坑、静态化方案)
├── COST_PANEL_REQUIREMENTS.md     # 计费插件需求说明
├── dsh-organizer-sidebar/         # npm: dsh-organizer-sidebar(单包,UI + Typert 自挂)
├── dsh-cost-panel/                # npm: dsh-cost-panel(单包)
├── dsh-file-panel/                # npm: dsh-file-panel(单包)
├── dsh-xchat/                     # npm: dsh-xchat
├── dsh-lan/                       # npm: dsh-lan
├── dsh-tray/                      # Windows 系统托盘启动器(独立工具,非插件)
├── dsh-computer-use/              # 独立工具(非插件)
└── dsh-agent-teams/               # 独立仓库(fork,自带 remote)
```

每个插件包的结构（单包范本）：
```
dsh-organizer-sidebar/
├── package.json        # dsh.bundle.patch + dsh.client 声明(files 白名单)
├── cordis.patch.yml    # bundle patch(install 时自动应用,一行 insert)
├── README.md
└── lib/
    ├── host.js         # Host 半边
    ├── client.js       # Client bundle
    ├── typert.host.js  # Typert 严格清单(如有)
    └── typert.remote-client.js  # Remote 描述符(如有)
```

## 📄 许可证

[MIT](LICENSE)
