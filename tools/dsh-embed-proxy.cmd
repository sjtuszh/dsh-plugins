@echo off
rem ============================================================================
rem 启动「回环注入代理」：让 iframe 里的浏览器（VS Code 内置浏览器 / LAN 切换器）
rem 也能打开 dsh web（DSH 0.1.5 起的 SameSite=Strict cookie 在 iframe 里发不出去）。
rem
rem 用法：双击即可；然后在 VS Code 内置浏览器里打开 http://127.0.0.1:3081
rem 参数：%* 会原样传给脚本，例如  dsh-embed-proxy.cmd --port 3082
rem
rem 随开机自启：给本文件建快捷方式，丢进  shell:startup
rem 停止：关掉这个黑窗口（或任务管理器结束 node.exe）
rem ============================================================================
setlocal
node "%~dp0dsh-embed-proxy.mjs" %*
if errorlevel 1 (
  echo.
  echo [dsh-embed-proxy] 退出，按任意键关闭窗口…
  pause >nul
)
