# Axing Studio V1 — 一键启动
# 右键此文件 → "使用 PowerShell 运行"

$root = $PSScriptRoot
Set-Location $root

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  阿星工坊 Axing Studio V1" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# API (独立窗口)
Write-Host "[1/3] API → http://localhost:3001" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host 'API — http://localhost:3001' -ForegroundColor Green; npm -w apps/api run dev"

# Dashboard (独立窗口)
Write-Host "[2/3] Dashboard → http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host 'Dashboard — http://localhost:5173' -ForegroundColor Yellow; npm -w apps/web run dev"

# Mock Agent (独立窗口)
Write-Host "[3/3] Mock Agents" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host 'Mock Agents — Oracle/Forge/Hermes' -ForegroundColor Magenta; npm -w workers/mock-agent run dev"

Start-Sleep -Seconds 5

# 打开浏览器
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "三个窗口已打开，浏览器已跳转 Dashboard。" -ForegroundColor Green
Write-Host "关掉三个终端窗口即可停止所有服务。" -ForegroundColor Gray
