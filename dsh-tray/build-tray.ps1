# ============================================================================
# build-tray.ps1 - build the DeepSeek Harness tray launcher
# Outputs (all in this folder):
#   whale.ico       whale tray icon (rendered from dsh-web-frontend favicon.svg, 32x32)
#   DshTray.exe     tray launcher (WinExe, whale icon embedded)
#   dsh-tray.json   launcher config (node path / args / url)
#   Desktop shortcut "DeepSeek Harness.lnk" (whale icon)
# Requires: Windows PowerShell 5.1 + .NET Framework 4.x (csc), node.exe.
# NOTE: keep this file ASCII-only so PS 5.1 parses it without a BOM.
# ============================================================================
$ErrorActionPreference = 'Stop'
$here = Split-Path $MyInvocation.MyCommand.Path -Parent

# ---------- 0) locate dependencies ----------
$dshRoot = 'C:\Users\22320\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh'
$svgPath = Join-Path $dshRoot 'node_modules\@deepseek-ai\dsh-web-frontend\dist\favicon.svg'
if (-not (Test-Path $svgPath)) { throw "favicon.svg not found: $svgPath" }
$nodeExe = (Get-Command node).Source
$binJs = Join-Path $dshRoot 'lib\bin.js'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4.x) not found' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# ---------- 1) render whale ICO (32x32, brand blue #4D6BFE) ----------
$svg = Get-Content $svgPath -Raw
$d = [regex]::Match($svg, 'id="path" d="([^"]+)"').Groups[1].Value
if ($d.Length -lt 100) { throw 'svg path parse failed' }

$size = 32
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$scale = ($size - 8) / 50.0
$off = 4

# SVG path grammar here: only M / C / Z (absolute). Track the current point.
$tokens = [regex]::Split($d, '([A-Za-z])')
$cur = ''
$nums = @()
$cx = 0.0
$cy = 0.0
function Flush-Cmd {
  if ($cur -eq 'M' -and $nums.Count -ge 2) {
    $gp.StartFigure()
    $cx = $nums[0]; $cy = $nums[1]
    $x = [float](($cx * $scale) + $off)
    $y = [float](($cy * $scale) + $off)
    $gp.AddLine($x, $y, $x, $y)
  } elseif ($cur -eq 'C' -and $nums.Count -ge 6) {
    $c1x = $nums[0]; $c1y = $nums[1]; $c2x = $nums[2]; $c2y = $nums[3]
    $ex = $nums[4]; $ey = $nums[5]
    $gp.AddBezier(
      [float](($cx * $scale) + $off), [float](($cy * $scale) + $off),
      [float](($c1x * $scale) + $off), [float](($c1y * $scale) + $off),
      [float](($c2x * $scale) + $off), [float](($c2y * $scale) + $off),
      [float](($ex * $scale) + $off), [float](($ey * $scale) + $off))
    $cx = $ex; $cy = $ey
  } elseif ($cur -eq 'Z') {
    $gp.CloseFigure()
  }
}
foreach ($t in $tokens) {
  if ($t -eq '') { continue }
  if ($t -match '^[A-Za-z]$') {
    Flush-Cmd
    $cur = $t
    $nums = @()
  } else {
    $nums += [regex]::Matches($t, '-?\d+(\.\d+)?') | ForEach-Object { [double]$_.Value }
  }
}
Flush-Cmd

$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 77, 107, 254))
$g.FillPath($brush, $gp)
$brush.Dispose(); $gp.Dispose(); $g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$icoPath = Join-Path $here 'whale.ico'
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs); $fs.Close()
Write-Host "whale.ico -> $icoPath"

# ---------- 2) compile DshTray.exe (whale icon embedded) ----------
$csPath = Join-Path $here 'DshTray.cs'
$exePath = Join-Path $here 'DshTray.exe'
& $csc /nologo /target:winexe "/win32icon:$icoPath" /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$exePath" $csPath
if ($LASTEXITCODE -ne 0) { throw 'csc compile failed' }
Write-Host "DshTray.exe -> $exePath"

# ---------- 3) write launcher config ----------
$cfg = @{
  node = $nodeExe
  args = @($binJs, '--profile', 'web', '--host', '127.0.0.1', '--port', '3080')
  url  = 'http://127.0.0.1:3080'
} | ConvertTo-Json
$cfgPath = Join-Path $here 'dsh-tray.json'
[System.IO.File]::WriteAllText($cfgPath, $cfg, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "dsh-tray.json -> $cfgPath"

# ---------- 4) desktop shortcut with whale icon ----------
$ws = New-Object -ComObject WScript.Shell
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeepSeek Harness.lnk'
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = $exePath
$sc.WorkingDirectory = $here
$sc.IconLocation = "$icoPath,0"
$sc.Description = 'DeepSeek Harness tray launcher: runs dsh web in background; tray icon shows page / exits'
$sc.Save()
Write-Host "shortcut -> $lnk"

Write-Host 'BUILD OK'
