@echo off
chcp 936 >nul 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem ==========================================================
rem  pretty-table 一键启动开发服务
rem  用法:
rem    启动开发服务.bat            默认端口 5310
rem    启动开发服务.bat 5320       临时指定端口
rem    set PT_PORT=5320 后运行     环境变量指定端口
rem    启动开发服务.bat check      只检测端口，不启动服务
rem  端口策略:
rem    默认端口被占 -> 中文提示并自动顺延到下一个可用端口;
rem    Vite 侧 strictPort=true，不会静默换端口导致打印地址与实际监听不一致。
rem  不会结束任何占用端口的进程，也不会自动弹出外部浏览器。
rem ==========================================================

echo(
echo ========================================
echo   pretty-table 开发服务启动
echo ========================================
echo(

rem ---- 端口优先级: 命令行参数 > 环境变量 PT_PORT > 默认 5310 ----
set "PORT=%~1"
set "MODE=dev"
if /i "!PORT!"=="check" (
  set "PORT="
  set "MODE=check"
)
if not defined PORT set "PORT=%PT_PORT%"
if not defined PORT set "PORT=5310"
set "STARTPORT=!PORT!"

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

rem ---- 端口占用检测: 只看 LISTENING，绝不结束占用进程 ----
set /a TRIES=0
:probe_port
set "BUSY="
for /f "tokens=*" %%L in ('netstat -ano ^| findstr /R /C:":!PORT! " ^| findstr /C:"LISTENING"') do set "BUSY=1"
if not defined BUSY goto port_ready
if !TRIES! GEQ 20 goto port_exhausted
set /a TRIES+=1
if !TRIES! EQU 1 echo [提示] 端口 !PORT! 已被占用，不会结束占用进程，自动改用下一个可用端口...
set /a PORT+=1
goto probe_port

:port_exhausted
echo [错误] 从 !STARTPORT! 起连续 20 个端口均被占用，无法自动选择。
echo        请手动指定其它端口后重试，例如: 启动开发服务.bat 5420
echo(
pause
exit /b 1

:port_ready
if not "!PORT!"=="!STARTPORT!" (
  echo [提示] 已改用端口 !PORT!
)
echo [端口] !PORT!
echo [地址] http://127.0.0.1:!PORT!/
if /i "!MODE!"=="check" (
  echo [检查] 端口可用，未启动服务。
  echo(
  exit /b 0
)
echo [提示] 关闭本窗口即停止服务
echo(

call pnpm dev --host 127.0.0.1 --port !PORT!
set "ERR=!errorlevel!"

echo(
if not "!ERR!"=="0" (
  echo [错误] 服务异常退出，代码 !ERR!
  echo [提示] 若提示端口被占用，可换端口重试: 启动开发服务.bat 5420
) else (
  echo [结束] 服务已停止
)
echo(
pause
exit /b !ERR!
