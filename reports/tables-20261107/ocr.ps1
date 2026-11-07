param([string]$ImgPath, [double]$Scale = 1.0, [string]$Crop = "")

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

# System.Drawing 预处理：可选裁剪，再放大 Scale 倍另存临时 PNG
$srcPath = [System.IO.Path]::GetFullPath($ImgPath)
$tmpPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "ocr_scale_tmp_$PID.png")
$srcImg = [System.Drawing.Image]::FromFile($srcPath)
if ($Crop -ne '') {
  $parts = $Crop.Split(',')
  $cx = [int]$parts[0]; $cy = [int]$parts[1]; $cw = [int]$parts[2]; $ch = [int]$parts[3]
  $cropBmp = New-Object System.Drawing.Bitmap($cw, $ch)
  $cg = [System.Drawing.Graphics]::FromImage($cropBmp)
  $cg.DrawImage($srcImg, (New-Object System.Drawing.Rectangle(0, 0, $cw, $ch)), (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)), [System.Drawing.GraphicsUnit]::Pixel)
  $cg.Dispose()
  $srcImg.Dispose()
  $srcImg = $cropBmp
}
$srcW = $srcImg.Width
$srcH = $srcImg.Height
$newW = [int]($srcW * $Scale)
$newH = [int]($srcH * $Scale)
$bmpNew = New-Object System.Drawing.Bitmap($newW, $newH)
$g = [System.Drawing.Graphics]::FromImage($bmpNew)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($srcImg, 0, 0, $newW, $newH)
$g.Dispose(); $srcImg.Dispose()
$bmpNew.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpNew.Dispose()

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmpPath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])

$lang = New-Object Windows.Globalization.Language('zh-Hans-CN')
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $ocrEngine) { Write-Error 'OCR engine(zh-Hans-CN) unavailable'; exit 2 }
$result = Await ($ocrEngine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])

Write-Output ("IMG={0} CROP={1} SCALE={2}" -f $ImgPath, $Crop, $Scale)
foreach ($line in $result.Lines) {
  $words = @($line.Words)
  $first = $words[0].BoundingRect
  $x = [math]::Round($first.X / $Scale)
  $y = [math]::Round($first.Y / $Scale)
  $text = ($words | ForEach-Object { $_.Text }) -join ' '
  Write-Output ("Y=" + $y + " X=" + $x + " | " + $text)
}
Remove-Item $tmpPath -ErrorAction SilentlyContinue
