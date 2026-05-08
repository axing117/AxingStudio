# 阿星工坊 — 一键启动（隐藏窗口版）
$root = $PSScriptRoot

# API 后台启动
Start-Process powershell -ArgumentList "-WindowStyle Hidden", "-Command", "cd '$root'; npm -w apps/api run dev" -WindowStyle Hidden

# Web 后台启动
Start-Process powershell -ArgumentList "-WindowStyle Hidden", "-Command", "cd '$root'; npm -w apps/web run dev" -WindowStyle Hidden

# Mock Agent 后台启动
Start-Process powershell -ArgumentList "-WindowStyle Hidden", "-Command", "cd '$root'; npm -w workers/mock-agent run dev" -WindowStyle Hidden

Start-Sleep -Seconds 5

# 打开浏览器
Start-Process "http://localhost:5173"
