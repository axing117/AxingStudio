/**
 * API Server — 可集成版本
 * 导出 startApi() 函数，供 Electron 主进程直接调用
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { taskRoutes } from './routes/tasks.js';
import { agentRoutes } from './routes/agents.js';
import { executorRoutes } from './routes/executors.js';
import { eventRoutes } from './routes/events.js';
import { artifactRoutes } from './routes/artifacts.js';
import { vaultRoutes } from './routes/vault.js';
import { worktreeRoutes } from './routes/worktree.js';
import { systemRoutes } from './routes/system.js';
import { chatRoutes } from './routes/chat.js';
import { queueRoutes } from './routes/queue.js';
import { workflowRoutes } from './routes/workflows.js';
import { sentinelRoutes } from './routes/sentinel.js';
import { markOfflineAgents } from './services/agentService.js';
import { markOfflineExecutors } from './services/executorService.js';
import { getTaskQueue } from './services/taskQueue.js';
import { registerErrorHandler } from './middleware/errorHandler.js';
import { startMockProcessor } from './services/mockAgent.js';

let app: ReturnType<typeof Fastify> | null = null;

export async function startApi(port?: number): Promise<void> {
  if (app) return; // 已启动

  const apiPort = port || config.port;

  // Init DB
  await initDb();

  app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // Routes
  taskRoutes(app);
  agentRoutes(app);
  executorRoutes(app);
  eventRoutes(app);
  artifactRoutes(app);
  vaultRoutes(app);
  worktreeRoutes(app);
  systemRoutes(app);
  chatRoutes(app);
  queueRoutes(app);
  workflowRoutes(app);
  sentinelRoutes(app);

  // Global error handler
  registerErrorHandler(app);

  app.get('/api/health', async () => ({ ok: true, data: { status: 'alive' } }));

  // Start task queue processor
  const queue = getTaskQueue();
  queue.start();

  // Start Mock Agent processor
  startMockProcessor();

  // Mark stale agents/executors offline every 10s
  setInterval(() => {
    try { markOfflineAgents(config.heartbeatTimeoutMs); } catch { /* silent */ }
    try { markOfflineExecutors(config.heartbeatTimeoutMs); } catch { /* silent */ }
  }, 10_000);

  await app.listen({ port: apiPort, host: config.host });
}

export async function stopApi(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
