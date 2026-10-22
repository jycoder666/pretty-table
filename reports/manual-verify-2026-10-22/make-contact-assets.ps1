# 接触表（contact sheet）素材预处理：裁切 / 缩放，供内嵌 data URL 使用
# 用法: powershell.exe -NoProfile -ExecutionPolicy Bypass -File make-contact-assets.ps1
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$src = 'F:\pretty-table\reports\manual-verify-2026-10-22'
$out = Join-Path $src 'contact'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function Save-Bitmap($bmp, $outFile) {
  $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $len = (Get-Item $outFile).Length
  Write-Output ("SAVED {0} {1}x{2} {3}KB" -f (Split-Path $outFile -Leaf), $bmp.Width, $bmp.Height, [int]($len / 1024))
}

function Resize-Png($inFile, $name, $maxW) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $src $inFile))
  $ratio = $maxW / $img.Width
  $w = [int][Math]::Round($img.Width * $ratio)
  $h = [int][Math]::Round($img.Height * $ratio)
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose(); $img.Dispose()
  Save-Bitmap $bmp (Join-Path $out $name)
}

function Crop-Png($inFile, $name, $x, $y, $w, $h) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $src $inFile))
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()
  Save-Bitmap $bmp (Join-Path $out $name)
}

# A. 图片链路
Resize-Png 'app-editor-with-image.png'            'a1-app-editor.png'     640
Resize-Png 'app-preview-with-image.png'           'a2-app-preview.png'    560
Crop-Png   'app-preview-with-image.png'           'a3-app-preview-cell.png' 60 240 500 140
Resize-Png 'exported-2x-with-image.png'           'a4-export-2x-full.png' 620
Crop-Png   'exported-2x-with-image.png'           'a5-export-2x-cell.png' 20 550 620 160

# B. 透明底与尺寸
Resize-Png 'exported-2x-with-image-transparent.png' 'b1-export-2x-transparent.png' 600
Resize-Png 'webkit-exported-2x-transparent.png'     'b2-webkit-2x-transparent.png' 460
Resize-Png 'exported-1x-opaque.png'                 'b3-export-1x.png'             300
Resize-Png 'exported-3x-opaque.png'                 'b4-export-3x.png'             460

# C. 公众号粘贴链路
Crop-Png 'paste-1-from-copy-html.png'     'c1-paste-plaintext.png' 0 0 780 320
Crop-Png 'paste-2-from-rendered-html.png' 'c2-paste-rendered.png'  0 0 1120 480
Resize-Png 'exported-html-in-browser.png' 'c3-exported-html-file.png' 620

Write-Output '--- total ---'
$sum = (Get-ChildItem $out -Filter *.png | Measure-Object -Property Length -Sum).Sum
Write-Output ("TOTAL {0}KB" -f [int]($sum / 1024))
