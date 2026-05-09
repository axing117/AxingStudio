# Axing Studio V2 — 本地多智能体协作系统

一个部署在本地的 AI Agent 矩阵：指挥中心解析意图 → DAG 编排工作流 → Agent 领取执行 → SSE 实时推送结果。

**不是 SaaS。本地运行，本地 Agent，本地文件系统。**

## 核心能力

| 模块 | 说明 |
|------|------|
| **DAG 编排引擎** | 任务依赖链（`dependsOn`）、`TaskStatus.Blocked`、事务内级联解锁下游 |
| **SSE 事件推送** | 客户端连接管理、broadcast 全量推送、15s 心跳保活、连接时 catch-up |
| **File Vault** | 按 taskId 隔离存储、上传/下载/列表、支持 .md/.ts/.json 预览 |
| **Git Worktree** | 按任务创建隔离分支 `task/<id>`、创建/列表/删除 API |
| **Agent 矩阵** | 注册 → 心跳 → 轮询领取 → 执行完成，三种 Agent 各司其职 |

## Agent 分工

| Agent | 引擎 | 能力 |
|-------|------|------|
| **Oracle** | Claude CLI | 策略拆解、需求分析 → 输出 .md |
| **Forge** | Claude CLI | 代码生成、工程实施 → 输出 .ts + worktree |
| **Hermes** | MiMo + Seedance | 图片生成、视频制作 → 输出 .json |

一个 Agent 只对应一种能力类型，不重叠。任务 type 决定路由。

## 工作流演示

```
POST /api/workflows (Oracle → Forge → Hermes, dependsOnIndexes)
         │
Oracle "策略拆解" ─ completed ──→ unblock Forge ─ completed ──→ unblock Hermes ─ completed
         │                          │                              │
     .md → vault               .ts → vault + worktree       .json → vault
```

## 技术栈

- **API 后端**: Fastify + TypeScript + sql.js（`apps/api/`）
- **前端**: React + Vite + TypeScript，SSE 实时事件驱动（`apps/web/`）
- **Worker**: Node.js Mock Agent + 扫描器架构（`workers/mock-agent/`）
- **共享契约**: TypeScript DTO/entity/enum（`packages/shared/`）
- **冒烟测试**: `scripts/smoke-test.ts`，19 项全链路测试

## 一键启动

```powershell
.\start.ps1   # 启动 API + Web + Mock Agent，自动打开浏览器
```

或手动：

```powershell
npm install
npm -w apps/api run dev           # 终端 1 → localhost:3001
npm -w apps/web run dev           # 终端 2 → localhost:5173
npm -w workers/mock-agent run dev # 终端 3 → Agent Worker
```

## API 概览

```
POST   /api/workflows          # 创建工作流（支持 dependsOnIndexes）
GET    /api/events/stream      # SSE 实时事件流
POST   /api/vault/:taskId      # 上传产物到 Vault
GET    /api/vault/:taskId      # 列出任务产物
POST   /api/worktrees/:taskId  # 创建 Git Worktree
GET    /api/worktrees          # 列出所有 Worktree
POST   /api/tasks              # 创建任务
POST   /api/tasks/:id/claim    # Agent 领取任务
POST   /api/tasks/:id/complete # 完成任务（自动解锁下游）
POST   /api/agents/register    # Agent 注册
POST   /api/agents/:id/heartbeat # Agent 心跳
```

## 架构理念

- **本地优先** — 不依赖外部云服务，Agent 进程运行在本机
- **能力绑定** — Agent 只声明自己能做什么，不声明自己是谁
- **级联自动化** — 上游完成 → 事务内解锁下游，无需人工触发
- **可扫描接入** — 新 Agent 通过 scanner 模块自动发现和注册

## V1 → V2 演进

V1 完成了基础的任务调度闭环（创建/领取/心跳/完成）。V2 新增：

- DAG 编排引擎（依赖声明 + 自动级联解锁）
- SSE 实时事件推送（替代 V1 的 3 秒轮询）
- File Vault（按任务隔离的文件系统存储）
- Git Worktree（任务级代码隔离环境）
- 冒烟测试套件（19 项全链路测试）
- Agent 能力重叠修复 + retrying 状态机修复

## 待做

- Mock Agent 替换为真实 AI 调用（Claude API / DeepSeek API）
- Sentinel 质量室接入
- sql.js → PostgreSQL 迁移
