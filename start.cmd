@echo off
rem Double-click to launch the mini player. Builds on first run.
cd /d "%~dp0"

rem Some setups (IDE / node debuggers) set this, which turns electron.exe
rem into a plain Node runtime - then no window ever appears. Clear it.
set "ELECTRON_RUN_AS_NODE="

if not exist "dist\main.js" (
  echo [1/2] building...
  call pnpm build
  if errorlevel 1 goto fail
)

echo [2/2] launching...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0dist\main.js" %*
exit /b 0

:fail
echo.
echo Build failed. Run "pnpm install" in this folder first.
pause
exit /b 1
