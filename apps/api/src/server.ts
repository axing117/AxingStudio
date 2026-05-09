/**
 * API Server — 可集成版本
 * 导出 startApi() 函数，供 Electron 主进程直接调用
 * 同时托管 Web 前端静态文件，让 Electron 加载 localhost:PORT 即可
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
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

let app: ReturnType<typeof Fastify> | null = null;

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function getWebDistDir(): string {
  return process.env.WEB_DIST_DIR || join(config.baseDir, '..', 'web', 'dist');
}

export async function startApi(port?: number): Promise<void> {
  if (app) return;

  const apiPort = port || config.port;

  await initDb();

  app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // API Routes
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

  registerErrorHandler(app);

  app.get('/api/health', async () => ({ ok: true, data: { status: 'alive' } }));

  // Serve web frontend static files
  const webDist = getWebDistDir();
  if (existsSync(webDist)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get('/*', async (req: any, reply: any) => {
      let urlPath = (req.params as { '*'?: string })['*'] || 'index.html';
      if (!urlPath || urlPath === '/') urlPath = 'index.html';

      // Don't interfere with API routes
      if (urlPath.startsWith('api/')) {
        return reply.status(404).send({ ok: false, error: 'Not found' });
      }

      const filePath = join(webDist, urlPath);
      if (!existsSync(filePath)) {
        // SPA fallback: return index.html for unknown paths
        const indexHtml = join(webDist, 'index.html');
        if (existsSync(indexHtml)) {
          return reply.type('text/html').send(readFileSync(indexHtml, 'utf-8'));
        }
        return reply.status(404).send({ ok: false, error: 'Not found' });
      }

      const ext = extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      return reply.type(mime).send(readFileSync(filePath));
    });
  }

  // Start task queue
  const queue = getTaskQueue();
  queue.start();

  // Start Mock Agent (will be auto-stopped when real agent registers)
  startMockProcessor();

  // Heartbeat cleanup
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
