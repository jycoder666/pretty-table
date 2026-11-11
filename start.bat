@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "PYTHONIOENCODING=gbk"
set "NO_COLOR=1"
title pretty-table Launcher
set "PORT=5173"
set "AUTOMODE=0"
set "RC=0"

rem ============================================================
rem pretty-table launcher - LOGICAL SOURCE, the single editable file
rem DO NOT edit start.bat by hand, never save it from an IDE.
rem Chinese text lives in bat_msg.py - keep this file pure ASCII.
rem
rem Regenerate after editing this file:
rem   python F:/docs/skills/windows-chinese-bat/scripts/write_bat_gbk.py F:/pretty-table/start.bat F:/pretty-table/start.content.txt
rem Then verify:
rem   python F:/docs/skills/windows-chinese-bat/scripts/verify_bat.py F:/pretty-table/start.bat --source F:/pretty-table/start.content.txt --strict --smoke-args check --expect-exit 0
rem
rem Usage:
rem   start.bat            interactive menu
rem   start.bat 1          start dev server, pnpm dev on port 5173
rem   start.bat check      read-only self check, no server started
rem Env:
rem   NO_BROWSER=1         skip auto-opening the browser
rem   PT_KILL=1            kill port occupier without asking (default: ask, Enter=Y)
rem Port busy flow: ask to kill the occupier (taskkill /F /T) then restart;
rem check mode stays read-only and never kills.
rem ============================================================

call :resolve_python
if errorlevel 1 (
    echo(
    echo [ERROR] Python not found, Chinese messages need python.exe on PATH.
    echo Install Python or add it to PATH, then run again.
    pause
    exit /b 1
)

if /i "%~1"=="check" (
    set "AUTOMODE=1"
    set "SEL=2"
    goto dispatch
)
if not "%~1"=="" (
    set "AUTOMODE=1"
    set "SEL=%~1"
    goto dispatch
)

:menu
call "%PY%" bat_msg.py menu
set "SEL="
set /p "SEL="
if errorlevel 1 exit /b 0

:dispatch
set "RC=0"
if /i "!SEL!"=="0" exit /b 0
if /i "!SEL!"=="q" exit /b 0
if /i "!SEL!"=="1" goto dev
if /i "!SEL!"=="2" goto check
call "%PY%" bat_msg.py err-bad-choice
goto menu

:check
call "%PY%" bat_msg.py selfcheck
if errorlevel 1 goto fail
goto back

:dev
call :check_base
if errorlevel 1 goto fail
call :check_port %PORT%
if errorlevel 1 goto fail
if exist "node_modules\" goto dev_ready
call "%PY%" bat_msg.py info-pnpm-install
call pnpm install
if errorlevel 1 (
    call "%PY%" bat_msg.py err-pnpm-install
    goto fail
)
:dev_ready
call "%PY%" bat_msg.py dev-banner %PORT%
if not "%NO_BROWSER%"=="1" start /min cmd /c "ping 127.0.0.1 -n 4 >nul & start http://127.0.0.1:%PORT%/"
call pnpm dev --host 127.0.0.1 --port %PORT% --strictPort
if errorlevel 1 (
    call "%PY%" bat_msg.py err-dev-failed
    goto fail
)
goto back

:fail
set "RC=1"

:back
if "%AUTOMODE%"=="1" exit /b !RC!
call "%PY%" bat_msg.py press-any-key
pause >nul
goto menu

:check_base
if not exist "package.json" (
    call "%PY%" bat_msg.py err-no-package
    exit /b 1
)
where pnpm >nul 2>&1
if errorlevel 1 (
    call "%PY%" bat_msg.py err-no-pnpm
    exit /b 1
)
exit /b 0

:check_port
call "%PY%" bat_msg.py port-free %~1
if not errorlevel 1 exit /b 0
rem Port busy: check mode never kills; dev mode asks (Enter=Y), PT_KILL=1 skips the ask.
if "%PT_KILL%"=="1" goto free_port_kill
call "%PY%" bat_msg.py port-kill-ask %~1
set "ANS="
set /p "ANS="
if errorlevel 1 goto free_port_declined
if /i "!ANS!"=="N" goto free_port_declined
:free_port_kill
call "%PY%" bat_msg.py port-kill %~1
if errorlevel 1 exit /b 1
exit /b 0
:free_port_declined
call "%PY%" bat_msg.py port-kill-declined
exit /b 1

:resolve_python
set "PY=python"
for /f "delims=" %%P in ('where python.exe 2^>nul') do (
    set "PY=%%P"
    exit /b 0
)
where python >nul 2>&1
if not errorlevel 1 exit /b 0
echo [ERROR] Python not found, Chinese messages need python.exe on PATH.
exit /b 1
