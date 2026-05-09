# 阿星工坊 — 一键打包脚本
# 右键此文件 → "使用 PowerShell 运行"

$root = $PSScriptRoot
Set-Location $root

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  阿星工坊 打包脚本" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. 构建 shared 包
Write-Host "[1/5] 构建 shared 包..." -ForegroundColor Yellow
npm -w packages/shared run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "shared 包构建失败!" -ForegroundColor Red
    exit 1
}

# 2. 构建 API 后端
Write-Host "[2/5] 构建 API 后端..." -ForegroundColor Yellow
npm -w apps/api run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "API 构建失败!" -ForegroundColor Red
    exit 1
}

# 3. 构建 Web 前端
Write-Host "[3/5] 构建 Web 前端..." -ForegroundColor Yellow
npm -w apps/web run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web 前端构建失败!" -ForegroundColor Red
    exit 1
}

# 4. 构建 Worker
Write-Host "[4/5] 构建 mock-agent Worker..." -ForegroundColor Yellow
node workers/mock-agent/build.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "mock-agent 构建失败!" -ForegroundColor Red
    exit 1
}

# 5. 构建并打包 Electron 应用
Write-Host "[5/5] 打包 Electron 应用..." -ForegroundColor Yellow
cd apps/agent-runtime
npm run pack
if ($LASTEXITCODE -ne 0) {
    Write-Host "Electron 打包失败!" -ForegroundColor Red
    exit 1
}
Set-Location $root

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  打包完成!" -ForegroundColor Green
Write-Host "  安装包位置: apps\agent-runtime\release\" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
