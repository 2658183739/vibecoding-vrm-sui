@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

set "SETUP_ONLY=0"
if /I "%~1"=="--setup-only" set "SETUP_ONLY=1"
set "PNPM_CMD="

where corepack >nul 2>&1
if errorlevel 1 (
  echo [1/6] corepack not found, fallback to pnpm
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Neither corepack nor pnpm is available in PATH.
    goto :fail
  )
  set "PNPM_CMD=pnpm"
) else (
  echo [1/6] use corepack pnpm
  call corepack prepare pnpm@10.5.2 --activate >nul 2>&1
  if errorlevel 1 (
    echo NOTE: corepack prepare failed, continue with existing corepack state.
  )
  set "PNPM_CMD=corepack pnpm"
)

echo [2/6] check pnpm version
call %PNPM_CMD% -v
if errorlevel 1 goto :fail

echo [3/6] install dependencies
call %PNPM_CMD% install
if errorlevel 1 goto :fail

echo [4/6] build agent package
call %PNPM_CMD% --filter @vibesui/agent build
if errorlevel 1 goto :fail

if "%SETUP_ONLY%"=="1" (
  echo [5/6] setup-only mode, skip browser and dev server
  echo Setup completed.
  goto :eof
)

echo [5/6] open browser
start "" "http://localhost:5173/#/quickstart"

echo [6/6] start frontend dev server
call %PNPM_CMD% --filter @vibesui/web dev
goto :eof

:fail
echo.
echo Startup failed. Please check errors above.
pause
exit /b 1
