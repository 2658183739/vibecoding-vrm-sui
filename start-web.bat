@echo off
cd /d "%~dp0"
echo [VibeSui Hackathon] Resetting Development Environment...

:: 1. Force Kill previous node processes (optional, but requested)
:: Warn: This kills ALL node.exe, might affect other projects.
echo [-] Cleaning up existing Node processes...
taskkill /F /IM node.exe >nul 2>&1

:: Small delay to ensure ports are freed
timeout /t 2 >nul

:: 2. Start Local Agent Service
echo [1/2] Launching Local Agent (Port 3777)...
echo.
start "VibeSui Local Agent" cmd /k "cd /d %~dp0 && npx pnpm dev:local-agent"

:: Wait 5 seconds for agent to fully initialize
timeout /t 5 >nul

:: 3. Start Web Frontend
echo [2/2] Launching Web Frontend (Port 5173)...
echo.
start "VibeSui Web App" cmd /k "cd /d %~dp0 && npx pnpm dev"

echo.
echo ========================================================
echo  All services RESTARTED!
echo  - Local Agent: http://localhost:3777
echo  - Web App:     http://localhost:5173
echo ========================================================
echo.
pause
