@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

echo [1/6] corepack enable
corepack enable >nul 2>&1
if errorlevel 1 (
  echo     提示：corepack enable 可能因权限失败，继续执行（不影响后续使用 corepack pnpm）。
)

echo [2/6] corepack prepare pnpm@10.5.2 --activate
corepack prepare pnpm@10.5.2 --activate
if errorlevel 1 goto :fail

echo [3/6] 检查 pnpm 版本
corepack pnpm -v
if errorlevel 1 goto :fail

echo [4/6] 安装依赖
corepack pnpm install
if errorlevel 1 goto :fail

echo [5/6] 预构建 agent（避免浏览器读取旧产物）
corepack pnpm --filter @vibesui/agent build
if errorlevel 1 goto :fail

echo [6/7] 打开浏览器页面
start "" "http://localhost:5173/#/merchant"

echo [7/7] 启动前端开发服务器
corepack pnpm dev
goto :eof

:fail
echo.
echo 启动失败，请检查上面的报错信息。
pause
exit /b 1
