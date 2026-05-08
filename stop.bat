@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  Stopping Axing Studio services...
echo.

taskkill /FI "WINDOWTITLE eq AxingAPI*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AxingWeb*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AxingAgent*" /F >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo  Done
echo.
pause
