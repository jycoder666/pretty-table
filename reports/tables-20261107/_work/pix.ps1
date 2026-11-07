param([string]$ImagePath, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Thresh = 60)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $ImagePath).Path)
# 每个像素列统计与主背景差异大的像素数，输出列直方图分段
$cols = @()
for ($cx = $X; $cx -lt ($X + $W); $cx++) {
  $cnt = 0
  for ($cy = $Y; $cy -lt ($Y + $H); $cy++) {
    $p = $bmp.GetPixel($cx, $cy)
    $bg = if ($p.R -gt 200 -and $p.G -gt 200 -and $p.B -gt 180) { $true } else { $false }
    if (-not $bg) { $cnt++ }
  }
  $cols += ,$cnt
}
$bmp.Dispose()
# 聚成连续非零段
$runs = @(); $start = -1
for ($i = 0; $i -lt $cols.Count; $i++) {
  $v = $cols[$i]
  if ($v -gt 0 -and $start -lt 0) { $start = $i }
  if (($v -eq 0 -or $i -eq $cols.Count - 1) -and $start -ge 0) {
    $end = if ($v -eq 0) { $i - 1 } else { $i }
    $wpx = $end - $start + 1
    $sum = 0; for ($j = $start; $j -le $end; $j++) { $sum += $cols[$j] }
    if ($wpx -ge 2) {
      $runs += ("x{0}-{1} w{2} px{3}" -f ($X + $start), ($X + $end), $wpx, $sum)
    }
    $start = -1
  }
}
Write-Output ("段数: " + $runs.Count)
$runs | ForEach-Object { Write-Output $_ }
