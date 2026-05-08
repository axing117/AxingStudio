@echo off
:: 阿星工坊 Agent Runtime — Windows 一键打包脚本
:: 用法: 双击运行，或在项目根目录执行 build-agent.bat

echo.
echo  ========================================
echo   阿星工坊 Agent Runtime 打包工具
echo  ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

:: 进入项目目录
cd /d "%~dp0"

:: 安装依赖
echo [1/4] 安装依赖...
call npm install --production=false
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

:: 构建 shared 包
echo [2/4] 构建共享模块...
call npm -w packages/shared run build 2>nul

:: 打包 Agent Runtime
echo [3/4] 打包 Agent Runtime...
call npm -w apps/agent-runtime run pack
if %errorlevel% neq 0 (
    echo [错误] 打包失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo  [4/4] 打包完成！
echo.
echo  安装包位置: apps\agent-runtime\release\
echo  文件名: AxingAgent-Setup-x.x.x.exe
echo.
echo  发送给用户: 双击 exe 安装即可使用
echo.
pause
