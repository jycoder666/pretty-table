@echo off
chcp 936 >nul 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo  Git Pull - %CD%
echo ========================================
echo(
echo 注意: 不要把 Token 写进本 bat（易泄露/易误提交）
echo       请写到旁路文件 git-pull.token 或 %%USERPROFILE%%\.github_pat
echo(

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] PATH 里找不到 git
  pause
  exit /b 1
)

if not exist ".git" (
  echo [ERROR] 不是 git 仓库: %CD%
  pause
  exit /b 1
)

rem ---- Token 优先顺序: 仓库旁 git-pull.token ^> 用户目录 .github_pat ----
set "TOKEN="
set "TOKEN_SRC="
set "USE_TOKEN=0"
if exist "%~dp0git-pull.token" (
  set /p TOKEN=<"%~dp0git-pull.token"
  set "TOKEN_SRC=%~dp0git-pull.token"
)
if not defined TOKEN (
  if exist "%USERPROFILE%\.github_pat" (
    set /p TOKEN=<"%USERPROFILE%\.github_pat"
    set "TOKEN_SRC=%USERPROFILE%\.github_pat"
  )
)
if defined TOKEN (
  if not "!TOKEN!"=="" (
    set "USE_TOKEN=1"
    echo [auth] 使用 Token 文件: !TOKEN_SRC!
  )
)
if "!USE_TOKEN!"=="0" (
  echo [auth] 无 Token 文件，改走 Windows 凭据管理器
  echo        若曾保存过 jycoder666+PAT，会静默拉取（看起来像没登录）
  echo        想写死 Token: 在本目录新建 git-pull.token，只写一行 PAT
)
echo(

rem ---- Proxy: 7890 ----
set "USE_PROXY=0"
set "PROXY_URL=http://127.0.0.1:7890"
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',7890,$null,$null); if (-not $iar.AsyncWaitHandle.WaitOne(800,$false)) { try{$c.Close()}catch{}; exit 1 }; $c.EndConnect($iar); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if "!ERRORLEVEL!"=="0" (
  set "USE_PROXY=1"
  set "HTTP_PROXY=!PROXY_URL!"
  set "HTTPS_PROXY=!PROXY_URL!"
  set "ALL_PROXY=!PROXY_URL!"
  echo [proxy] 检测到 7890，使用 !PROXY_URL!
) else (
  echo [proxy] 未检测到 127.0.0.1:7890，直连
)
echo(

echo [1] 当前分支
git status -sb
echo(

echo [2] 远程
git remote -v
echo(

set "ERR=1"
for /L %%i in (1,1,3) do (
  if not "!ERR!"=="0" (
    echo [3] git pull 第 %%i/3 次 ...
    echo(
    if "!USE_PROXY!"=="1" (
      if "!USE_TOKEN!"=="1" (
        git -c http.version=HTTP/1.1 -c credential.helper= -c http.proxy=!PROXY_URL! -c "http.extraHeader=Authorization: Bearer !TOKEN!" pull
      ) else (
        git -c http.version=HTTP/1.1 -c credential.helper=manager -c http.proxy=!PROXY_URL! pull
      )
    ) else (
      if "!USE_TOKEN!"=="1" (
        git -c http.version=HTTP/1.1 -c credential.helper= -c "http.extraHeader=Authorization: Bearer !TOKEN!" pull
      ) else (
        git -c http.version=HTTP/1.1 -c credential.helper=manager pull
      )
    )
    set "ERR=!ERRORLEVEL!"
    if not "!ERR!"=="0" (
      echo(
      echo [WARN] 第 %%i 次失败，退出码 !ERR!
      if %%i LSS 3 (
        echo 等待 3 秒后重试...
        timeout /t 3 /nobreak >nul
        echo(
      )
    )
  )
)

echo(
if not "!ERR!"=="0" (
  echo [FAIL] 3 次都失败
  echo   - 代理端口 7890 / Token 文件 / 凭据管理器 三选一要可用
) else (
  echo [OK] 拉取完成
  echo(
  git status -sb
)

echo(
pause
exit /b !ERR!
