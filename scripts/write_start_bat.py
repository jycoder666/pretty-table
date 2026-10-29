# -*- coding: utf-8 -*-
"""Write start-dev.bat as GBK + CRLF for Chinese Windows cmd."""
from pathlib import Path

CONTENT = r"""@echo off
chcp 936 >nul 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo(
echo ================================
echo   pretty-table 开发服务启动
echo ================================
echo(

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 pnpm，请先安装 Node.js 与 pnpm。
  echo 安装示例: npm install -g pnpm
  echo(
  pause
  exit /b 1
)

if not exist "node_modules\." (
  echo [提示] 首次运行，正在安装依赖...
  echo(
  call pnpm install
  if errorlevel 1 (
    echo(
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
  )
  echo(
)

echo [启动] http://127.0.0.1:5173/
echo [提示] 关闭本窗口即停止服务
echo(

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5173/"

call pnpm dev --host 127.0.0.1 --port 5173
set "ERR=!errorlevel!"

echo(
if not "!ERR!"=="0" (
  echo [错误] 服务异常退出，代码 !ERR!
) else (
  echo [结束] 服务已停止
)
echo(
pause
exit /b !ERR!
"""

# bat lives at repo root; this script is in scripts/
root = Path(__file__).resolve().parent.parent
out = root / "启动开发服务.bat"
# CONTENT uses cd /d "%~dp0" which is correct when bat is at root
text = CONTENT.replace("\n", "\r\n")
if not text.endswith("\r\n"):
    text += "\r\n"
out.write_bytes(text.encode("gbk"))
print(f"wrote {out}")
print(f"bytes={out.stat().st_size} crlf={text.count(chr(13)+chr(10))}")
# verify round-trip
decoded = out.read_bytes().decode("gbk")
assert "开发服务" in decoded
assert "\r\n" in decoded
assert "\n" not in decoded.replace("\r\n", "")
print("verify ok")
