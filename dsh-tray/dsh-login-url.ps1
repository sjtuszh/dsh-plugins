<#
dsh-login-url.ps1 —— 取回「当前这次 dsh web」的带 token 登录 URL（DSH 0.1.2+ 浏览器会话认证用）。

来源优先级：
  1) dsh-tray-login-url.txt —— 新版 DshTray 每次捕获启动行时落盘（推荐，托盘重启也不丢）
  2) dsh-tray.log 里的 `dsh web: http://…/?token=…` 行 —— 旧版托盘 / 兜底
两个来源都会先 HTTP 探一次（有效 token 的兑换返回 303；旧版无鉴权服务返回 200），
失效或取不到就明确报错——绝不把死 token 塞进剪贴板。

用法：
  powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1             # 取回并复制到剪贴板
  powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1 -Open       # 顺便用默认浏览器打开
  powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1 -NoVerify   # 跳过有效性探测
  powershell -ExecutionPolicy Bypass -File .\dsh-login-url.ps1 -Dir <托盘目录>

说明：token 只能用在根路径（/?token=…）；cookie 绑定 authority（给 127.0.0.1:3080 铸的对
localhost:3080 无效）；cookie 默认 30 天、重启 dsh web 后仍有效，只有过期才需重新取一次。
#>
param(
  [string]$Dir,
  [switch]$NoClipboard,
  [switch]$NoVerify,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

function Find-TrayDir {
  param([string]$Explicit)
  if ($Explicit) { return (Get-Item $Explicit).FullName }
  $candidates = @(
    $PSScriptRoot,
    (Join-Path $env:USERPROFILE 'Desktop\dsh_WS\dsh-plugins\dsh-tray'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
  ) | Where-Object { Test-Path (Join-Path $_ 'dsh-tray.log') }
  if (-not $candidates) { throw '找不到托盘目录（需含 dsh-tray.log）：请用 -Dir <path> 指定' }
  $newest = $candidates | ForEach-Object { Get-Item (Join-Path $_ 'dsh-tray.log') } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  return $newest.DirectoryName
}

function Test-LoginUrl {
  param([string]$Url)
  if ($NoVerify) { return $true }
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 8 $Url 2>$null
  return ($code -eq '303' -or $code -eq '200')
}

function Copy-WithRetry {
  param([string]$Text)
  for ($i = 0; $i -lt 8; $i++) {
    try { Set-Clipboard -Value $Text; return $true } catch { Start-Sleep -Milliseconds 150 }
  }
  return $false
}

$trayDir = Find-TrayDir -Explicit $Dir
$urlFile = Join-Path $trayDir 'dsh-tray-login-url.txt'
$logFile = Join-Path $trayDir 'dsh-tray.log'

$url = $null
$source = $null

if (Test-Path $urlFile) {
  $candidate = (Get-Content $urlFile -Raw).Trim()
  if ($candidate -match 'https?://\S*?token=[A-Za-z0-9_-]+') {
    $candidate = $Matches[0]
    if (Test-LoginUrl $candidate) { $url = $candidate; $source = 'dsh-tray-login-url.txt' }
    else { Write-Host '× 落盘文件里的 token 已失效（服务重启过？）—— 回退去扫日志' -ForegroundColor Yellow }
  }
}

if (-not $url -and (Test-Path $logFile)) {
  $hit = Select-String -Path $logFile -Pattern 'dsh web:\s*(http://\S*?token=[A-Za-z0-9_-]+)' -AllMatches |
    Select-Object -Last 1
  if ($hit) {
    $candidate = $hit.Matches[0].Groups[1].Value
    if (Test-LoginUrl $candidate) { $url = $candidate; $source = 'dsh-tray.log（兜底）' }
    else { Write-Host '× 日志里最后一行的 token 也已失效' -ForegroundColor Yellow }
  }
}

Write-Host ''
if (-not $url) {
  Write-Host '没拿到可用的登录 URL。' -ForegroundColor Yellow
  Write-Host '可能原因：当前 dsh web 不是本托盘启动的（被别的东西拉起来了），或 token 已随服务重启失效。' -ForegroundColor Yellow
  Write-Host '对策：托盘右键「重启」让托盘重新拉起 dsh，再右键「复制登录 URL」。' -ForegroundColor Yellow
  exit 2
}

Write-Host ("来源：" + $source)
Write-Host ("托盘目录：" + $trayDir)
Write-Host ''
Write-Host '登录 URL（粘到 DSH 面板的登录框，或在浏览器里打开一次）：' -ForegroundColor Green
Write-Host $url -ForegroundColor Cyan
Write-Host ''

if (-not $NoClipboard) {
  if (Copy-WithRetry $url) {
    Write-Host '✓ 已复制到剪贴板。' -ForegroundColor Green
  } else {
    Write-Host '（剪贴板被别的程序占用，重试 8 次仍失败，请手动复制上面的 URL）' -ForegroundColor Yellow
  }
}

if ($Open) { Start-Process $url }

Write-Host ''
Write-Host '说明：会话 cookie 默认 30 天且用持久化密钥签名，重启 dsh web 后仍有效；' -ForegroundColor DarkGray
Write-Host '      token 本身每次启动都变，所以只有 cookie 过期时才需要重新取一次。' -ForegroundColor DarkGray
