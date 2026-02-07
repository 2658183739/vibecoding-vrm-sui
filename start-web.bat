@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

echo [1/7] corepack enable
corepack enable >nul 2>&1
if errorlevel 1 (
  echo     NOTE: corepack enable failed (permission issue is common). Continue anyway.
)

echo [2/7] prepare pnpm 10.5.2
corepack prepare pnpm@10.5.2 --activate
if errorlevel 1 goto :fail

echo [3/7] check pnpm version
corepack pnpm -v
if errorlevel 1 goto :fail

echo [4/7] install dependencies
corepack pnpm install
if errorlevel 1 goto :fail

echo [5/7] build agent package (avoid stale dist in browser)
corepack pnpm --filter @vibesui/agent build
if errorlevel 1 goto :fail

echo [6/7] open browser
start "" "http://localhost:5173/#/merchant"

echo [7/7] start frontend dev server
corepack pnpm dev
goto :eof

:fail
echo.
echo Startup failed. Please check errors above.
pause
exit /b 1