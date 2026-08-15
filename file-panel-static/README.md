# 文件树浏览面板 · 静态版（profile 挂载）

与动态版（`dsh-plugins/` 工作区里的 cordis_define 定义）功能等价，但以**静态插件**挂载：
随 `dsh web` 启动自动加载，进程重启、浏览器刷新都不需要任何操作，无需批准。

## 功能

- 页面**右侧中间**浮动 📁 小按钮 → 点击滑出右侧文件栏（`shell.overlay` 根级浮动层）；打开时按钮**贴面板左缘**移动
- 面板**实底**（`--dsw-alias-bg-layer-1`），行悬停用 `layer-2`（深色主题下更亮，不显黑）
- 文件栏以**当前会话 cwd** 为根，目录懒加载、可展开/折叠，带刷新按钮
- 刷新策略：**每次点击 📁 按钮刷新** + 面板打开时**每 30s 自动刷新**（root + 已展开目录）
- 每个文件/文件夹行右侧 **⋯** → 菜单：
  - **复制文件地址**（浏览器剪贴板，失败回退 `execCommand`）
  - **打开文件浏览器查看**（直接打开目标目录：文件→父目录、文件夹→自身；`explorer.exe "目录"` 经临时 .cmd 执行，不用 `/select,`）

> 实时同步说明：动态/静态插件都只有 client→host 请求通道、无服务端推送，所以"实时同步不占资源"目前没有现成方案，采用 30s 轮询 + 点击刷新的回退方案（与动态版一致）。

## 架构差异（相对动态版）

| 维度 | 动态版 | 静态版 |
|---|---|---|
| 数据通道 | Host `harness.handle` RPC + 客户端轮询 | **Typert remote**：Host 服务继承 `TypertRemoteService`（构造即注册 + 打 `typertRemote` 绑定，**普通 `ctx.provide` 会被网关拒收**，见 MEMORY §11.4b），typert 清单注册 `filetree/list`、`filetree/reveal` 端点，客户端 `ctx.remote.filetree.*` 调用 |
| 挂载 | 单包，一行 | **双包**（MEMORY §5.2 双条目方案）：`dsh-file-panel`（UI，消费 `remote.filetree`）+ `dsh-file-panel-mount`（仅 `$mount` 描述符，防 §4.3 自依赖死锁） |
| 安装 | cordis_define + 批准 | 复制包 + patch 行 + 重启 |

## 目录结构

```
file-panel-static/
├── README.md
├── dsh-file-panel/              # 主包（UI + Host 服务 + typert 清单）
│   ├── package.json
│   └── lib/
│       ├── host.js              # FileTreeService extends TypertRemoteService（注册 + 绑定）
│       ├── typert.host.js       # TYPERT 清单（zod v4 真 schema）
│       ├── typert.remote-client.js  # TYPERT_REMOTE 描述符（恒等桩，仅供文档参考）
│       └── client.js            # UI bundle（ModuleLoader 工厂，inject slots/remote/remote.filetree）
└── dsh-file-panel-mount/        # 挂载包（双条目方案 A）
    ├── package.json
    └── lib/
        ├── host.js              # 空 Host
        └── client.js            # 仅 ctx.remote.$mount(TYPERT_REMOTE)（内联描述符）
```

## 安装 / 更新

1. 复制包（`nodeLinker: hoisted`，手动复制即可）：

   ```powershell
   $dst = "$HOME\.dsh\profiles\web\node_modules"
   Copy-Item -Recurse dsh-file-panel        $dst\dsh-file-panel
   Copy-Item -Recurse dsh-file-panel-mount  $dst\dsh-file-panel-mount
   # typert.host.js 需要 zod v4（import { z } from 'zod'）——从 dsh 安装目录复制：
   Copy-Item -Recurse "<dsh>\node_modules\zod" $dst\zod
   ```

2. `profiles/web/cordis.patch.yml` 加两行（注意：必须与现有 `- insert:` 同级、同一列表）：

   ```yaml
   - insert:
       - id: file-panel
         name: dsh-file-panel
       - id: file-panel-mount
         name: dsh-file-panel-mount
   ```

3. 重启 `dsh web`。`client.js` 改动刷新浏览器即可（rev 按文件哈希）；`host.js` / typert / patch 改动必须重启。

> ⚠️ **同时使用动态版会重复**：静态版挂载后请先 `cordis_stop` / 不再定义动态版，否则页面会出现两个 📁。

## 回滚（回到动态版）

1. 删除 `cordis.patch.yml` 中的 `file-panel`、`file-panel-mount` 两个 insert 行。
2. 删除 `profiles/web/node_modules/dsh-file-panel`、`dsh-file-panel-mount`、`zod`（若仅为本插件复制）。
3. 重启 `dsh web`，再走动态版流程。

## 预检（不必重启即可跑）

```powershell
node --check dsh-file-panel/lib/host.js
node --check dsh-file-panel/lib/typert.host.js
node --check dsh-file-panel/lib/client.js
node --check dsh-file-panel-mount/lib/client.js
dsh --profile web --dump-config   # 确认组合树含 file-panel 两行
```

## 已知风险（首次静态化，按 MEMORY §4/§5 实录）

- 静态客户端 ctx 是代理，**未声明即访问会抛错**：UI 包必须 `inject: ["slots","remote","remote.filetree"]`。
- 双条目顺序由依赖保证：mount 包先 `$mount` 出 `remote.filetree`，UI 包才激活。
- 若挂载后 UI 不出现：检查（a）patch 两行是否都在；（b）`dsh --profile web --dump-config` 组合树；（c）typert 清单校验错误（会在启动日志报 `typert-loader: dsh-file-panel …`）。
- zod 依赖：本机已验证 dsh 自带 zod v4.4.3，按上文复制即可；换环境时确认版本兼容（清单校验要求 zod v4，`_zod` 标记）。
