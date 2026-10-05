# DshTray — DeepSeek Harness 托盘启动器（特例项目）

> ⚠️ **特例声明**：这不是 DSH 插件（DSH 生态"一切皆插件"，但 Windows 托盘这类进程外桌面工具无法用 Cordis 表达，作为特例独立维护）。它跑在 dsh web **进程外**，只负责：后台启动 dsh web、右下角鲸鱼托盘图标、右键菜单（显示页面 / 复制登录 URL / 重启 / 退出）。

## 文件

| 文件 | 说明 |
|---|---|
| `DshTray.cs` | C# 源码（兼容 C# 5 / .NET Framework 4.x，不用新语法） |
| `build-tray.ps1` | 构建脚本：渲染鲸鱼 ICO（从 dsh favicon.svg 解析 M/C/Z 路径）→ csc 编译（`/win32icon` 嵌入图标）→ 写配置 → 桌面快捷方式。**ASCII-only 注释**（PS 5.1 无 BOM 解析中文会坏） |
| `whale.ico` | 鲸鱼托盘图标（16/24/32/48/64/128/256 多尺寸 32 位 ARGB，品牌蓝 #4D6BFE，构建时生成） |
| `DshTray.exe` | 产物（WinExe，已嵌入鲸鱼图标） |
| `dsh-tray.json` | 启动配置：`node`（node.exe 路径）、`args`（`bin.js --profile web --host 127.0.0.1 --port 3080`）、`url` |
| `dsh-tray.log` | 运行时日志（dsh 子进程 stdout/stderr 追加；**token 一律打码成 `token=***`**） |
| `dsh-tray-login-url.txt` | 最近一次捕获的带 token 登录 URL（每次启动覆盖；给「复制登录 URL」与 `dsh-login-url.ps1` 用） |
| `dsh-login-url.ps1` | 命令行取回登录 URL（优先读上面的 txt，回退扫日志；带 303 有效性探测与剪贴板重试）。**必须带 UTF-8 BOM 保存**，否则 PS 5.1 按 GBK 读会语法报错 |
| `selfcheck.cs` | 离线自检：反射加载编译好的 exe，验证「捕获 → 落盘 → token 打码 → 有效性判定 → 剪贴板 → 回退路径」全链路（不启动托盘、不碰正在跑的 dsh） |
| `DeepSeek Harness.lnk` | 桌面快捷方式（鲸鱼图标），构建时生成 |

## 行为逻辑

- 启动时探测 `url`（默认 `http://127.0.0.1:3080`）：
  - **端口已占用** → 用 `netstat` 找出监听该端口的进程，**自动结束它**（`taskkill /T /F`，气泡"已结束旧进程"），等端口释放；
  - **端口空闲** → 直接启动。
  - 总之**托盘总是启动并拥有一个全新 dsh web**（`node .../lib/bin.js --profile web --host 127.0.0.1 --port 3080`，窗口隐藏，日志进 `dsh-tray.log`）。
- 左键双击托盘图标 → 打开页面。
- 右键菜单：
  - **显示页面** → 浏览器打开 url。
  - **复制登录 URL** → 把「当前这次 dsh web」的带 token 启动 URL 放进剪贴板（见下节）。
  - **重启** → 仅当托盘拥有子进程时有效：`taskkill /T` 结束 dsh 进程树 → 重新拉起（静态插件随新进程自动加载）；否则提示"无法重启"。
  - **退出** → 结束自己拥有的 dsh（`taskkill /T`）并退出托盘。
- 单实例：同名 Mutex，重复启动只打开页面（若已在运行则先结束旧实例再换新实例）。

## 登录 URL（DSH 0.1.2+ 浏览器鉴权）

DSH 0.1.2 起 Web GUI 需要浏览器会话认证：每次启动打印一行
`dsh web: http://127.0.0.1:3080/?token=…`，用该 URL 兑换一次会话 cookie（默认 30 天，
用 `$DSH_HOME/.credentials.yaml` 里的持久化密钥签名，**重启进程后仍有效**）。

托盘窗口是隐藏的，控制台看不到 → 因此：

- 子进程每一行经 `HandleDshLine()`：命中启动行就把 URL 落盘到 `dsh-tray-login-url.txt`，
  其余行写日志时把 `token=` 打码（日志常被贴进 issue/聊天，不该带明文 token）；
- 右键**「复制登录 URL」**：内存里的 URL 先做有效性探测（有效 token 的兑换返回 **303**，
  旧版无鉴权服务返回 **200**，失效为 401/连不上），失效则回退读落盘文件；
  两者都不可用就**明说取不到**，不会把死 token 塞进剪贴板；
- 用途：粘贴到 VS Code 扩展（`fengze233.dsh-vscode-panel`）的登录页。该扩展的粘贴框用
  `/https?:\/\/[^\s]+/` 从文本里抽 URL，所以**整行或纯 URL 都接受**；它自己也有本地代办
  代理，只是这次 dsh 由托盘启动、它读不到日志，才退化成手动粘贴。

命令行等价物（不想点托盘时）：

```powershell
powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1          # 取回 + 复制到剪贴板
powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1 -Open    # 顺便用默认浏览器打开
```

## 会话与插件

- **对话/会话**：落盘（`$DSH_HOME/sessions/...`），任何 dsh web 实例都读同一份数据 → 换进程/重启不丢。
- **静态插件**（`profiles/web` 挂载的计费/文件面板）：随新实例自动加载 ✓。
- **动态插件**：进程内定义，换进程即失（需重新 cordis_define），与手动重启规则相同。

## 重建

```powershell
# 先确保 DshTray.exe 未在运行（运行中会锁文件,编译报 CS0016）
& .\build-tray.ps1

# 运行中的托盘锁着 DshTray.exe 时，先编译成临时名，退出托盘后再替换：
csc /nologo /target:winexe /win32icon:whale.ico /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:DshTray.new.exe DshTray.cs
```

改完 `DshTray.cs` 不必发车也能验证（不启动托盘、不碰正在跑的 dsh）：

```powershell
csc /nologo /target:exe /r:System.Windows.Forms.dll /out:selfcheck.exe selfcheck.cs
.\selfcheck.exe .\DshTray.new.exe "http://127.0.0.1:3080/?token=<当前实例的 token>"
# 12 项断言：捕获落盘 / 日志打码 / 真 token=可用 / 假 token=不可用 / 剪贴板往返 / 失效值回退
```

> 注意：**启动托盘会重启 dsh web**（它为保证端口空闲会结束当前监听进程）。所以自检不要走托盘，用上面的反射自检。

## 交接/换用注意

- 旧命令行启动的 dsh 不会被托盘"接管"（端口占用 → 已在运行模式）。要让托盘完全管理（重启/退出能控制 dsh）：
  1. 先停掉现有 dsh（`taskkill /PID <dsh的node pid> /T /F` 或任务管理器结束 node）；
  2. 再双击桌面鲸鱼快捷方式 → 托盘启动新 dsh 并拥有它。
- 只有当 dsh web 是**本托盘**的子进程时，托盘才拿得到它的登录 URL；被别的程序拉起的实例拿不到（那种情况用 `dsh-login-url.ps1 -Dir <那个托盘目录>` 或它自己的日志）。
