[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$d = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $d) { Write-Output "FORMATS:"; Write-Output "TEXTLEN:0"; Write-Output "HTMLLEN:0"; exit }
Write-Output ("FORMATS:" + ($d.GetFormats() -join "|"))
$t = $d.GetData("UnicodeText")
if ($null -eq $t) { Write-Output "TEXTLEN:0" } else { Write-Output ("TEXTLEN:" + $t.Length); [System.IO.File]::WriteAllText("F:\\pretty-table\\reports\\manual-verify-2026-10-22\\clipboard-iframe-directed-text.txt", [string]$t, [System.Text.Encoding]::UTF8) }
$h = $d.GetData("HTML Format")
if ($null -eq $h) { Write-Output "HTMLLEN:0" } else {
  $s = [string]$h
  Write-Output ("HTMLLEN:" + $s.Length)
  Write-Output ("HTMLHAS_TABLE:" + ($s.Contains("<table")).ToString().ToLower())
  [System.IO.File]::WriteAllText("F:\\pretty-table\\reports\\manual-verify-2026-10-22\\clipboard-iframe-directed-htmlformat.txt", $s, [System.Text.Encoding]::UTF8)
}