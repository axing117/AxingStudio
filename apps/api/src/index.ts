import 'dotenv/config';
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

// Init DB before starting
await initDb();

const app = Fastify({ logger: true });

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

// Mark stale agents/executors offline every 10s
setInterval(() => {
  try { markOfflineAgents(config.heartbeatTimeoutMs); } catch { /* silent */ }
  try { markOfflineExecutors(config.heartbeatTimeoutMs); } catch { /* silent */ }
}, 10_000);

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`\n  Axing Studio API running at http://localhost:${config.port}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
