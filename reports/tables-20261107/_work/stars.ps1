param([string]$ImagePath, [int]$Y1, [int]$Y2, [int]$X1, [int]$X2)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $ImagePath).Path)

function NearGold([int]$r, [int]$g, [int]$b) {
  return (($r - $b) -gt 60 -and [math]::Abs($r - 150) -lt 50 -and [math]::Abs($g - 112) -lt 50 -and [math]::Abs($b - 42) -lt 50)
}

$yCount = New-Object 'System.Collections.Generic.SortedList[int,int]'
for ($yy = $Y1; $yy -lt $Y2; $yy++) {
  $c = 0
  for ($xx = $X1; $xx -lt $X2; $xx++) {
    $p = $bmp.GetPixel($xx, $yy)
    if (NearGold $p.R $p.G $p.B) { $c = $c + 1 }
  }
  if ($c -gt 2) { $yCount[$yy] = $c }
}
if ($yCount.Count -eq 0) { Write-Output 'NO_GOLD'; $bmp.Dispose(); exit 0 }
$ys = @($yCount.Keys)
Write-Output ("StarRow Y" + $ys[0] + "-" + $ys[$ys.Count - 1])
$starY1 = $ys[0]; $starY2 = $ys[$ys.Count - 1]

$colCount = New-Object 'System.Collections.Generic.SortedList[int,int]'
for ($xx = $X1; $xx -lt $X2; $xx++) {
  $c = 0
  for ($yy = $starY1; $yy -le $starY2; $yy++) {
    $p = $bmp.GetPixel($xx, $yy)
    if (NearGold $p.R $p.G $p.B) { $c = $c + 1 }
  }
  $colCount[$xx] = $c
}
$runs = New-Object 'System.Collections.Generic.List[string]'
$start = -1
for ($xx = $X1; $xx -lt $X2; $xx++) {
  $v = $colCount[$xx]
  if ($v -gt 0 -and $start -lt 0) { $start = $xx }
  if (($v -eq 0 -or $xx -eq ($X2 - 1)) -and $start -ge 0) {
    $end = $xx; if ($v -eq 0) { $end = $xx - 1 }
    if (($end - $start + 1) -ge 3) { $runs.Add(("star x" + $start + "-" + $end + " w" + ($end - $start + 1))) }
    $start = -1
  }
}
Write-Output ("GoldStarClusters: " + $runs.Count)
$runs | ForEach-Object { Write-Output ("  " + $_) }
$bmp.Dispose()
