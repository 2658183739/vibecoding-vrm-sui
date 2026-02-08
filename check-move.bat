@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

if not exist "tools\sui\sui.exe" (
  echo ERROR: tools\sui\sui.exe not found.
  echo Please download Sui CLI first ^(Windows x86_64^) and extract to tools\sui.
  exit /b 1
)

set "PATH=%CD%\tools\sui;%PATH%"

echo [1/3] sui version
call sui --version || goto :fail

echo [2/3] move build
call corepack pnpm move:build || goto :fail

echo [3/3] move test
call corepack pnpm move:test || goto :fail

echo Move checks passed.
exit /b 0

:fail
echo Move checks failed.
exit /b 1
