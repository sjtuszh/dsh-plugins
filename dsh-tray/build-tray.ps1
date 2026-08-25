# ============================================================================
# build-tray.ps1 - build the DeepSeek Harness tray launcher
# Outputs (all in this folder):
#   whale.ico       whale tray icon (rendered from dsh-web-frontend favicon.svg, multi-size 32bpp ARGB)
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

# ---------- 1) render whale ICO (multi-size 32bpp ARGB, brand blue #4D6BFE) ----------
# The favicon path grammar here is only M / C / Z (absolute). Parse it once into a
# command list, then replay it at several sizes into a hand-built 32-bit DIB icon.
$svg = Get-Content $svgPath -Raw
$d = [regex]::Match($svg, 'id="path" d="([^"]+)"').Groups[1].Value
if ($d.Length -lt 100) { throw 'svg path parse failed' }

$cmds = New-Object System.Collections.ArrayList
$cur = ''
$nums = @()
function PushCmd {
  if ($cur -ne '') { [void]$cmds.Add(@($cur, $nums)) }
}
foreach ($t in [regex]::Split($d, '([A-Za-z])')) {
  if ($t -eq '') { continue }
  if ($t -match '^[A-Za-z]$') { PushCmd; $cur = $t; $nums = @() }
  else { $nums += [regex]::Matches($t, '-?\d+(\.\d+)?') | ForEach-Object { [double]$_.Value } }
}
PushCmd

function Build-WhalePath($scale, $off) {
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cx = 0.0; $cy = 0.0
  foreach ($c in $cmds) {
    $cmd = $c[0]; $n = $c[1]
    if ($cmd -eq 'M' -and $n.Count -ge 2) {
      $gp.StartFigure()
      $cx = $n[0]; $cy = $n[1]
      $x = [float](($cx * $scale) + $off); $y = [float](($cy * $scale) + $off)
      $gp.AddLine($x, $y, $x, $y)
    } elseif ($cmd -eq 'C' -and $n.Count -ge 6) {
      $gp.AddBezier(
        [float](($cx * $scale) + $off), [float](($cy * $scale) + $off),
        [float](($n[0] * $scale) + $off), [float](($n[1] * $scale) + $off),
        [float](($n[2] * $scale) + $off), [float](($n[3] * $scale) + $off),
        [float](($n[4] * $scale) + $off), [float](($n[5] * $scale) + $off))
      $cx = $n[4]; $cy = $n[5]
    } elseif ($cmd -eq 'Z') {
      $gp.CloseFigure()
    }
  }
  return $gp
}

# Render one square size (W x W) to a 32bpp DIB byte[] (BITMAPINFOHEADER + XOR + AND mask).
function Render-Dib($W) {
  $bmp = New-Object System.Drawing.Bitmap($W, $W, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $gp = Build-WhalePath (($W - 8) / 50.0) 4
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 77, 107, 254))
  $g.FillPath($brush, $gp)
  $brush.Dispose(); $gp.Dispose(); $g.Dispose()

  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $W)
  $locked = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = [Math]::Abs($locked.Stride)
  $raw = New-Object byte[] ($stride * $W)
  [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $raw, 0, $raw.Length)
  $bmp.UnlockBits($locked)
  $bmp.Dispose()

  $bytes = New-Object System.Collections.Generic.List[byte]
  $bytes.AddRange([BitConverter]::GetBytes([int]40))                # biSize
  $bytes.AddRange([BitConverter]::GetBytes([int]$W))               # biWidth
  $bytes.AddRange([BitConverter]::GetBytes([int]($W * 2)))         # biHeight (XOR + AND)
  $bytes.AddRange([BitConverter]::GetBytes([uint16]1))             # biPlanes
  $bytes.AddRange([BitConverter]::GetBytes([uint16]32))            # biBitCount
  $bytes.AddRange([BitConverter]::GetBytes([int]0))                # biCompression (BI_RGB)
  $bytes.AddRange([BitConverter]::GetBytes([int]($W * $W * 4)))    # biSizeImage (XOR size)
  $bytes.AddRange([BitConverter]::GetBytes([int]0))                # biXPels
  $bytes.AddRange([BitConverter]::GetBytes([int]0))                # biYPels
  $bytes.AddRange([BitConverter]::GetBytes([int]0))                # biClrUsed
  $bytes.AddRange([BitConverter]::GetBytes([int]0))                # biClrImportant
  # XOR pixels: BGRA, rows stored bottom-up (last bitmap row first).
  for ($row = $W - 1; $row -ge 0; $row--) {
    $start = $row * $stride
    for ($x = 0; $x -lt ($W * 4); $x++) { $bytes.Add($raw[$start + $x]) }
  }
  # AND mask: W bits per row, padded to 4 bytes; 32bpp alpha already handles transparency.
  $rowLen = [int][Math]::Ceiling($W / 8.0)
  $rowLen = [int][Math]::Ceiling($rowLen / 4.0) * 4
  $zeroRow = New-Object byte[] $rowLen
  for ($row = 0; $row -lt $W; $row++) { $bytes.AddRange($zeroRow) }
  return ,$bytes.ToArray()
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$icoPath = Join-Path $here 'whale.ico'
$images = New-Object System.Collections.ArrayList
foreach ($s in $sizes) { [void]$images.Add((Render-Dib $s)) }

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)                   # reserved
$bw.Write([uint16]1)                   # type = icon
$bw.Write([uint16]$images.Count)       # image count
$offset = 6 + (16 * $images.Count)     # size of ICONDIR + all ICONDIRENTRY
for ($i = 0; $i -lt $images.Count; $i++) {
  $s = $sizes[$i]
  $img = $images[$i]
  $dim = if ($s -ge 256) { [byte]0 } else { [byte]$s }   # 0 means 256
  $bw.Write($dim)                      # width
  $bw.Write($dim)                      # height
  $bw.Write([byte]0)                   # colorCount
  $bw.Write([byte]0)                   # reserved
  $bw.Write([uint16]1)                 # planes
  $bw.Write([uint16]32)                # bitCount
  $bw.Write([uint32]$img.Length)       # bytesInRes
  $bw.Write([uint32]$offset)           # imageOffset
  $offset += $img.Length
}
foreach ($img in $images) { $bw.Write($img) }
$bw.Close(); $fs.Close()
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
