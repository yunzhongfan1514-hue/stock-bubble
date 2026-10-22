@echo off
chcp 65001 >nul
REM ============================================================
REM  股票气泡 · 打包 Windows 安装程序
REM  输出: release\StockBubble-Setup-<版本>.exe
REM  可自定义缓存目录：先 set CACHE_ROOT=你的目录，再运行本脚本
REM ============================================================
cd /d "%~dp0"

if "%CACHE_ROOT%"=="" set CACHE_ROOT=%LOCALAPPDATA%\stock-bubble-cache

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set ELECTRON_CACHE=%CACHE_ROOT%\electron
set ELECTRON_BUILDER_CACHE=%CACHE_ROOT%\electron-builder

if not exist "node_modules\electron" (
  echo 未检测到依赖，正在执行 install.cmd ...
  call install.cmd
)

echo 开始打包...
REM electronDist 指向 node_modules 里已解压的 electron，避开部分杀软锁定
REM "win-unpacked.tmp -> win-unpacked" 重命名导致的 EPERM；也可避免重复下载。
call npx electron-builder --win nsis -c.electronDist=%~dp0node_modules\electron\dist
if errorlevel 1 goto fail

echo.
echo 打包完成，安装包位于 release 目录：
dir /b release\*.exe
pause
exit /b 0

:fail
echo.
echo 打包失败，请查看上方日志。
pause
exit /b 1
