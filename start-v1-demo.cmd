@echo off
chcp 65001 >nul
title 阿星工坊 Axing Studio V1.5 Demo
cd /d "%~dp0"

echo ============================================
echo   阿星工坊 Axing Studio V1.5 Demo
echo ============================================
echo.
echo [1/3] API → http://localhost:3001
echo [2/3] Dashboard → http://localhost:5173
echo [3/3] Mock Agents (Oracle / Forge / Hermes)
echo.
echo 三个服务将在独立窗口中启动。
echo 关闭对应窗口即可停止该服务。
echo.

start "Axing-API" cmd /c "cd /d %cd% && echo API — http://localhost:3001 && npm -w apps/api run dev"
timeout /t 3 /nobreak >nul

start "Axing-Web" cmd /c "cd /d %cd% && echo Dashboard — http://localhost:5173 && npm -w apps/web run dev"
timeout /t 2 /nobreak >nul

start "Axing-Agent" cmd /c "cd /d %cd% && echo Mock Agents && npm -w workers/mock-agent run dev"
timeout /t 4 /nobreak >nul

echo.
echo 服务已启动，正在打开浏览器...
start http://localhost:5173

echo.
echo 提示：在 Dashboard 点击"新建任务"创建演示任务。
echo 或运行: npx tsx scripts/seed-demo.ts 自动播种。
echo.
pause
