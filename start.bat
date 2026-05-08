@echo off
cd /d "%~dp0"

:: 启动API（隐藏窗口）
start /min powershell -WindowStyle Hidden -Command "npm -w apps/api run dev"

:: 启动Web（隐藏窗口）
start /min powershell -WindowStyle Hidden -Command "npm -w apps/web run dev"

:: 等待服务启动
timeout /t 6 /nobreak >nul

:: 打开浏览器
start http://localhost:5173
