[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace PT -Name Clip -MemberDefinition @"
[DllImport("user32.dll", SetLastError=true)] public static extern bool OpenClipboard(IntPtr hWndNewOwner);
[DllImport("user32.dll", SetLastError=true)] public static extern bool CloseClipboard();
[DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetClipboardData(uint uFormat);
[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern uint RegisterClipboardFormat(string lpszFormat);
[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GlobalLock(IntPtr hMem);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GlobalUnlock(IntPtr hMem);
[DllImport("kernel32.dll", SetLastError=true)] public static extern UIntPtr GlobalSize(IntPtr hMem);
"@
$d = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $d) { Write-Output "FORMATS:"; Write-Output "TEXTLEN:0"; Write-Output "HTMLLEN:0"; Write-Output "HTMLBYTES:0"; exit }
Write-Output ("FORMATS:" + ($d.GetFormats() -join "|"))
$t = $d.GetData("UnicodeText")
if ($null -eq $t) { Write-Output "TEXTLEN:0" } else { Write-Output ("TEXTLEN:" + $t.Length); [System.IO.File]::WriteAllText("F:\\pretty-table\\reports\\manual-verify-2026-10-22\\clipboard-after-copy-html-text.txt", [string]$t, [System.Text.Encoding]::UTF8) }
$fmt = [PT.Clip]::RegisterClipboardFormat("HTML Format")
$s = ""
$opened = $false
for ($i = 0; $i -lt 10; $i++) {
  if ([PT.Clip]::OpenClipboard([IntPtr]::Zero)) { $opened = $true; break }
  Start-Sleep -Milliseconds 120
}
if ($opened) {
  $h = [PT.Clip]::GetClipboardData($fmt)
  if ($h -ne [IntPtr]::Zero) {
    $n = [int]([PT.Clip]::GlobalSize($h).ToUInt64())
    $ptr = [PT.Clip]::GlobalLock($h)
    $bytes = New-Object byte[] ($n)
    [System.Runtime.InteropServices.Marshal]::Copy($ptr, $bytes, 0, $n)
    [PT.Clip]::GlobalUnlock($h) | Out-Null
    $s = [System.Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)
    Write-Output ("HTMLBYTES:" + $n)
  } else { Write-Output "HTMLBYTES:0" }
  [PT.Clip]::CloseClipboard() | Out-Null
} else { Write-Output "HTMLBYTES:-1" }
if ($s.Length -eq 0) { Write-Output "HTMLLEN:0" } else {
  Write-Output ("HTMLLEN:" + $s.Length)
  Write-Output ("HTMLHAS_TABLE:" + ($s.Contains("<table")).ToString().ToLower())
  Write-Output ("HTMLHAS_DATAIMG:" + ($s.Contains("data:image")).ToString().ToLower())
  Write-Output ("HTMLHAS_MARKS:" + ($s.Contains([char]0x2713) -or $s.Contains([char]0x2717) -or $s.Contains([char]0x25D0)).ToString().ToLower())
  [System.IO.File]::WriteAllText("F:\\pretty-table\\reports\\manual-verify-2026-10-22\\clipboard-after-copy-html-htmlformat.txt", $s, [System.Text.Encoding]::UTF8)
}