param(
  [string]$ImagePath,
  [int]$Scale = 2,
  [int]$CropX = -1, [int]$CropY = -1, [int]$CropW = -1, [int]$CropH = -1
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging.BitmapDecoder, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$src = [System.Drawing.Image]::FromFile((Resolve-Path $ImagePath).Path)
$sw = [int]$src.Width; $sh = [int]$src.Height
if ($CropX -ge 0) { $rx = [int]$CropX; $ry = [int]$CropY; $rw = [int]$CropW; $rh = [int]$CropH } else { $rx = 0; $ry = 0; $rw = $sw; $rh = $sh }
$rect = New-Object System.Drawing.Rectangle($rx, $ry, $rw, $rh)
$bw = [int]($rw * $Scale); $bh = [int]($rh * $Scale)
$bmp = New-Object System.Drawing.Bitmap($bw, $bh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $bw, $bh)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $src.Dispose()

$tmpPng = Join-Path $env:TEMP ("ocr_crop_" + [guid]::NewGuid().ToString('N') + ".png")
$bmp.Save($tmpPng, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()

$asTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskOp.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

try {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmpPng)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("zh-Hans-CN"))
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  foreach ($line in $result.Lines) {
    $words = @($line.Words)
    $joined = ($words | ForEach-Object { $_.Text }) -join ''
    $first = $words[0].BoundingRect
    $y = [math]::Round(($first.Y / $Scale) + $ry); $x = [math]::Round(($first.X / $Scale) + $rx)
    Write-Output ("Y$y X$x| $joined")
  }
} finally {
  if (Test-Path $tmpPng) { Remove-Item $tmpPng -Force }
}
