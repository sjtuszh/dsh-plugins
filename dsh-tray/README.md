# DshTray — DeepSeek Harness 托盘启动器（特例项目）

> ⚠️ **特例声明**：这不是 DSH 插件（DSH 生态"一切皆插件"，但 Windows 托盘这类进程外桌面工具无法用 Cordis 表达，作为特例独立维护）。它跑在 dsh web **进程外**，只负责：后台启动 dsh web、右下角鲸鱼托盘图标、右键菜单（显示页面 / 重启 / 退出）。

## 文件

| 文件 | 说明 |
|---|---|
| `DshTray.cs` | C# 源码（兼容 C# 5 / .NET Framework 4.x，不用新语法） |
| `build-tray.ps1` | 构建脚本：渲染鲸鱼 ICO（从 dsh favicon.svg 解析 M/C/Z 路径）→ csc 编译（`/win32icon` 嵌入图标）→ 写配置 → 桌面快捷方式。**ASCII-only 注释**（PS 5.1 无 BOM 解析中文会坏） |
| `whale.ico` | 鲸鱼托盘图标（32×32，品牌蓝 #4D6BFE，构建时生成） |
| `DshTray.exe` | 产物（WinExe，已嵌入鲸鱼图标） |
| `dsh-tray.json` | 启动配置：`node`（node.exe 路径）、`args`（`bin.js --profile web --host 127.0.0.1 --port 3080`）、`url` |
| `dsh-tray.log` | 运行时日志（dsh 子进程 stdout/stderr 追加） |
| `DeepSeek Harness.lnk` | 桌面快捷方式（鲸鱼图标），构建时生成 |

## 行为逻辑

- 启动时探测 `url`（默认 `http://127.0.0.1:3080`）：
  - **端口已占用** → 用 `netstat` 找出监听该端口的进程，**自动结束它**（`taskkill /T /F`，气泡"已结束旧进程"），等端口释放；
  - **端口空闲** → 直接启动。
  - 总之**托盘总是启动并拥有一个全新 dsh web**（`node .../lib/bin.js --profile web --host 127.0.0.1 --port 3080`，窗口隐藏，日志进 `dsh-tray.log`）。
- 左键双击托盘图标 → 打开页面。
- 右键菜单：
  - **显示页面** → 浏览器打开 url。
  - **重启** → 仅当托盘拥有子进程时有效：`taskkill /T` 结束 dsh 进程树 → 重新拉起（静态插件随新进程自动加载）；否则提示"无法重启"。
  - **退出** → 结束自己拥有的 dsh（`taskkill /T`）并退出托盘。
- 单实例：同名 Mutex，重复启动只打开页面（若已在运行则先结束旧实例再换新实例）。

## 会话与插件

- **对话/会话**：落盘（`$DSH_HOME/sessions/...`），任何 dsh web 实例都读同一份数据 → 换进程/重启不丢。
- **静态插件**（`profiles/web` 挂载的计费/文件面板）：随新实例自动加载 ✓。
- **动态插件**：进程内定义，换进程即失（需重新 cordis_define），与手动重启规则相同。

## 重建

```powershell
# 先确保 DshTray.exe 未在运行（运行中会锁文件,编译报 CS0016）
& .\build-tray.ps1
```

## 交接/换用注意

- 旧命令行启动的 dsh 不会被托盘"接管"（端口占用 → 已在运行模式）。要让托盘完全管理（重启/退出能控制 dsh）：
  1. 先停掉现有 dsh（`taskkill /PID <dsh的node pid> /T /F` 或任务管理器结束 node）；
  2. 再双击桌面鲸鱼快捷方式 → 托盘启动新 dsh 并拥有它。
