# 阿星工坊 Agent Runtime

Windows 桌面客户端 — 连接你的电脑到阿星工坊指挥中心。

## 用户安装

1. 下载 `AxingAgent-Setup.exe`
2. 双击安装
3. 启动后自动出现在系统托盘（右下角）

## 功能

- **自动扫描**: 检测本机安装的 Claude Code、Codex 等 Agent
- **自动注册**: 启动时向指挥中心注册节点
- **托盘常驻**: 关闭窗口不退出，最小化到系统托盘
- **任务接收**: 自动接收并执行指挥中心分配的任务
- **自动更新**: 检测新版本并提示下载

## 开发

```bash
# 在项目根目录
npm install
npm run dev:agent-runtime
```

## 打包

```bash
# 一键打包（推荐）
build-agent.bat

# 或手动
npm -w apps/agent-runtime run pack
```

打包产物在 `apps/agent-runtime/release/` 目录。

## 系统要求

- Windows 10/11
- 本机已安装 Claude Code 或 Codex（用于执行任务）
