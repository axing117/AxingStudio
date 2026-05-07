import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { taskRoutes } from './routes/tasks.js';
import { agentRoutes } from './routes/agents.js';
import { eventRoutes } from './routes/events.js';
import { artifactRoutes } from './routes/artifacts.js';
import { vaultRoutes } from './routes/vault.js';
import { worktreeRoutes } from './routes/worktree.js';
import { markOfflineAgents } from './services/agentService.js';

// Init DB before starting
await initDb();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Routes
taskRoutes(app);
agentRoutes(app);
eventRoutes(app);
artifactRoutes(app);
vaultRoutes(app);
worktreeRoutes(app);

app.get('/api/health', async () => ({ ok: true, data: { status: 'alive' } }));

// Mark stale agents offline every 10s
setInterval(() => {
  try { markOfflineAgents(config.heartbeatTimeoutMs); } catch { /* silent */ }
}, 10_000);

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`\n  Axing Studio API running at http://localhost:${config.port}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
