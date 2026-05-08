import type { FastifyInstance } from 'fastify';
import { getTaskQueue } from '../services/taskQueue.js';

export function queueRoutes(app: FastifyInstance): void {
  // GET /api/queue/stats — queue statistics
  app.get('/api/queue/stats', async () => {
    const queue = getTaskQueue();
    return { ok: true, data: queue.stats() };
  });

  // GET /api/queue/dead-letter — permanently failed tasks
  app.get('/api/queue/dead-letter', async () => {
    const queue = getTaskQueue();
    return { ok: true, data: queue.getDeadLetter() };
  });
}
