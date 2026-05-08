@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  Building Agent Runtime...
echo.

:: Build renderer from agent-runtime directory
cd apps\agent-runtime
call npx vite build
cd ..\..

:: Build Electron main process
call npx tsc -p apps\agent-runtime\tsconfig.electron.json

echo.
echo  Launching Electron...
echo.
start "AxingAgent" cmd /k "npx electron apps/agent-runtime"
