[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$d = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $d) { Write-Output "FORMATS:"; Write-Output "HTMLHAS_TABLE:false"; exit }
Write-Output ("FORMATS:" + ($d.GetFormats() -join "|"))
$h = $d.GetData("HTML Format")
if ($null -eq $h) { Write-Output "HTMLHAS_TABLE:false" } else { Write-Output ("HTMLHAS_TABLE:" + ([string]$h).Contains("<table").ToString().ToLower()) }
$t = $d.GetData("UnicodeText")
if ($null -ne $t) { [System.IO.File]::WriteAllText("F:\\pretty-table\\reports\\manual-verify-2026-10-22\\clipboard-exec-probe-text.txt", [string]$t, [System.Text.Encoding]::UTF8) }