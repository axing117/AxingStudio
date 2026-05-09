# Axing Studio V2 — 一键启动
# 右键此文件 → "使用 PowerShell 运行"

$root = $PSScriptRoot
Set-Location $root

# 读取 .env 文件中的环境变量
$envVars = @{}
if (Test-Path "$root\.env") {
  Get-Content "$root\.env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
      $parts = $line -split '=', 2
      if ($parts.Count -eq 2) {
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
      }
    }
  }
}

$envBlock = ""
foreach ($key in $envVars.Keys) {
  $envBlock += "`$env:$key='$($envVars[$key])'; "
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  阿星工坊 Axing Studio V2" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$envLoaded = if ($envVars.Count -gt 0) { " ($($envVars.Count) env vars loaded)" } else { "" }
Write-Host "API Key: $($envVars.ContainsKey('ANTHROPIC_API_KEY'))$envLoaded"

# API (独立窗口)
Write-Host "[1/3] API → http://localhost:3001" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; $envBlock Write-Host 'API — http://localhost:3001' -ForegroundColor Green; npm -w apps/api run dev"

# Dashboard (独立窗口)
Write-Host "[2/3] Dashboard → http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; $envBlock Write-Host 'Dashboard — http://localhost:5173' -ForegroundColor Yellow; npm -w apps/web run dev"

# Agent Worker (独立窗口，传入 API key)
Write-Host "[3/3] Agent Worker (Oracle/Forge)" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; $envBlock Write-Host 'Agent Worker — Oracle/Forge via DeepSeek API' -ForegroundColor Magenta; npm -w workers/mock-agent run dev"

Start-Sleep -Seconds 5

# 打开浏览器
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "三个窗口已打开，浏览器已跳转 Dashboard。" -ForegroundColor Green
Write-Host "关掉三个终端窗口即可停止所有服务。" -ForegroundColor Gray
