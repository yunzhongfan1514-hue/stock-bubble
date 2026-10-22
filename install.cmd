@echo off
chcp 65001 >nul
REM ============================================================
REM  股票气泡 · 依赖安装
REM  可自定义缓存目录：先 set CACHE_ROOT=你的目录，再运行本脚本
REM  默认使用 %LOCALAPPDATA%\stock-bubble-cache
REM ============================================================
cd /d "%~dp0"

if "%CACHE_ROOT%"=="" set CACHE_ROOT=%LOCALAPPDATA%\stock-bubble-cache

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set ELECTRON_CACHE=%CACHE_ROOT%\electron
set ELECTRON_BUILDER_CACHE=%CACHE_ROOT%\electron-builder
set npm_config_cache=%CACHE_ROOT%\npm-cache

echo 缓存目录: %CACHE_ROOT%
echo.
echo [1/2] 安装 npm 依赖...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo [2/2] 依赖安装完成。执行 build.cmd 可打包安装程序。
pause
exit /b 0

:fail
echo.
echo 依赖安装失败，请检查网络或 npm 配置。
pause
exit /b 1
