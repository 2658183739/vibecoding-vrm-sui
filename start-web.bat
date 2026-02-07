@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

set "SETUP_ONLY=0"
if /I "%~1"=="--setup-only" set "SETUP_ONLY=1"
set "PNPM_CMD="

where corepack >nul 2>&1
if errorlevel 1 (
  echo [1/7] corepack not found, fallback to pnpm command
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Neither corepack nor pnpm is available in PATH.
    goto :fail
  )
  set "PNPM_CMD=pnpm"
) else (
  echo [1/7] corepack enable
  call corepack enable >nul 2>&1
  if errorlevel 1 (
    echo NOTE: corepack enable failed. Continue with existing corepack state.
  )
  echo [2/7] prepare pnpm 10.5.2
  call corepack prepare pnpm@10.5.2 --activate
  if errorlevel 1 goto :fail
  set "PNPM_CMD=corepack pnpm"
)

echo [3/7] check pnpm version
call %PNPM_CMD% -v
if errorlevel 1 goto :fail

echo [4/7] install dependencies
call %PNPM_CMD% install
if errorlevel 1 goto :fail

echo [5/7] build agent package (avoid stale dist in browser)
call %PNPM_CMD% --filter @vibesui/agent build
if errorlevel 1 goto :fail

if "%SETUP_ONLY%"=="1" (
  echo [6/7] setup-only mode detected, skip browser and dev server
  echo Setup completed in setup-only mode.
  goto :eof
)

echo [6/7] open browser
start "" "http://localhost:5173/#/merchant"

echo [7/7] start frontend dev server
call %PNPM_CMD% dev
goto :eof

:fail
echo.
echo Startup failed. Please check errors above.
pause
exit /b 1
