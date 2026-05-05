# Axing Studio V1

阿星工坊 V1 是一个本地可运行的多 Agent 任务调度闭环：CommandCenter 负责任务、租约、心跳、事件和产物记录；Dashboard 展示系统状态；Mock Agent 模拟 Oracle、Forge、Hermes 三类节点执行任务。

## V1 范围

- 已做：Fastify CommandCenter、SQLite/sql.js 数据库、共享 TypeScript 契约、React Dashboard、Mock Oracle/Forge/Hermes。
- 已做：创建任务、Agent 注册、任务领取、任务心跳续租、完成/失败、事件日志、mock artifact 回传。
- 暂不做：真实视频生成、Tauri/Electron 桌面壳、Windows 安装器、自动更新、生产级权限和长期运行保障。

## 技术栈

- Monorepo: npm workspaces
- Shared: TypeScript DTO / entity / enum contract
- API: Fastify + sql.js
- Web: React + Vite + TypeScript
- Worker: Node.js + tsx mock loop

## 一键启动（推荐）

右键 `start.ps1` → **使用 PowerShell 运行**，自动打开三个终端窗口 + 浏览器。

## 手动启动

```powershell
cd AxingStudio
npm install

# 终端 1 — API
npm -w apps/api run dev

# 终端 2 — Dashboard
npm -w apps/web run dev

# 终端 3 — Mock Agent
npm -w workers/mock-agent run dev
```

访问：

- API: `http://localhost:3001/api/health`
- Dashboard: `http://localhost:5173`

## Mock Agent 环境变量

默认 `npm -w workers/mock-agent run dev` 会同时启动 Oracle、Forge、Hermes 三个模拟节点。

```powershell
$env:AGENT_TYPE="oracle"; npm -w workers/mock-agent run dev
$env:AGENT_TYPE="forge,hermes"; npm -w workers/mock-agent run dev
$env:API_URL="http://localhost:3001"; npm -w workers/mock-agent run dev
```

可选参数：

- `AGENT_TYPE`: `all`、`oracle`、`forge`、`hermes`，或逗号组合；默认 `all`。
- `API_URL`: CommandCenter 地址；默认 `http://localhost:3001`。
- `POLL_MS`: 轮询 queued 任务间隔；默认 `2500`。
- `WORK_MIN_MS` / `WORK_MAX_MS`: 模拟执行时间范围；默认 `4000` / `9000`。
- `FAILURE_RATE`: 模拟失败概率；默认 `0`。V1 建议保持 0，避免任务停在 retrying 状态影响演示。

## Dashboard 操作

1. 启动 API、Web、Mock Agent。
2. 在 Dashboard 的“新建任务”里选择策略室、工程室或媒体室。
3. 创建任务后，Mock Agent 会自动领取任务。
4. 任务完成后，任务列表、事件流和 Vault 产物区会自动刷新。

Dashboard 目前使用 3 秒轮询，不使用 WebSocket/SSE。这个选择是为了让 V1 先稳定跑通，后续 V2 再升级实时事件流。

## API 契约

核心接口：

- `POST /api/tasks`
- `GET /api/tasks?status=queued`
- `POST /api/tasks/:id/claim`
- `POST /api/tasks/:id/heartbeat`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fail`
- `POST /api/agents/register`
- `POST /api/agents/:id/heartbeat`
- `GET /api/events?limit=50`
- `GET /api/artifacts?taskId=xxx`
- `POST /api/artifacts`

所有接口统一返回：

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrorCode };
```

## V2 扩展方向

- 把 Dashboard 轮询替换成 SSE 或 WebSocket。
- 给 retrying 任务增加明确的重新排队策略。
- Forge 接 Git Worktree，Hermes 接真实图片/视频生成。
- Sentinel 增加自动质检规则和人工审核入口。
- Vault 从 mock path 迁移到真实文件系统或 MinIO。
- 数据库从 sql.js 迁移到 PostgreSQL，并保留现有 DTO 契约。
