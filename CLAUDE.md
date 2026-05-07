# 阿星工坊 (Axing Studio)

## 启动方式
- API 后端: `npm -w apps/api run dev` → `localhost:3001`
- Web 前端: `npm -w apps/web run dev` → `localhost:5173`
- Worker: `npm -w workers/mock-agent run dev`
- 一键启动: `start.ps1`

## 核心架构 — Executor 注册制
Oracle/Forge/Hermes/Sentinel 是**任务角色（UI 房间）**，不是 Agent 身份。
真实的本地 Agent 软件注册为 Executor，声明自己能做什么能力。

## Agent 角色与后端引擎映射
| Agent | 类型 | 后端引擎 | 能力 | 位置 |
|-------|------|---------|------|------|
| Claude Code | claude-code | Claude CLI | oracle.plan/review, forge.implement/review, doc.generate | 本地 exe |
| Hermes | hermes | **MiMo 模型** | hermes.media | WSL 虚拟机 |
| Sentinel | - | 未接入 | - | - |

- Hermes 是 Agent，MiMo 是它的后端模型（跟 Claude 是 Oracle/Forge 的后端一样）
- 不要说"接 MiMo API"或"MiMo Executor"，要说"接 Hermes Agent"

## Agent 接入方式
- **本机文件系统 Agent**（Claude Code、Codex）：通过 `workers/mock-agent/src/scanner/` 扫描检测
- **网络/虚拟机 Agent**（Hermes in WSL）：自行调 `POST /api/executors/register` 注册，自声明能力
- 扫描器在 `workers/mock-agent/src/scanner/`，加新 Agent 探测器加一个文件即可

## 目录
```
apps/api/     → Fastify 后端 (port 3001)
apps/web/     → Vite + React 前端 (port 5173)
packages/
  shared/     → 共享类型 (@axing/shared)
workers/
  mock-agent/ → 本地 Agent Worker（Scanner + Claude Code Executor）
```

## 前端角色动画
- PNG sprites: `/assets/remotion-sprites/`
- CSS keyframes 动画，无外部插件
- SSE 任务事件驱动角色状态

## Git
- 已初始化，3 次提交，均未 push

## 网络
- Windows IP: 192.168.1.77
- WSL 访问 Windows: 直接用该 IP
