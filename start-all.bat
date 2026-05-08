@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  ========================================
echo   Axing Studio - Start All
echo  ========================================
echo.

echo [1/3] Starting API (port 3001)...
start "AxingAPI" cmd /k "npm -w apps/api run dev"
timeout /t 2 /nobreak >nul

echo [2/3] Starting Web (port 5173)...
start "AxingWeb" cmd /k "npm -w apps/web run dev"
timeout /t 2 /nobreak >nul

echo [3/3] Starting Agent Runtime (tray)...
start "AxingAgent" cmd /k "npm -w apps/agent-runtime run dev"

echo.
echo  All started.
echo.
pause
