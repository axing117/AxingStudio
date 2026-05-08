import type { FastifyInstance } from 'fastify';
import { getDb, getAll } from '../db/index.js';

export function sentinelRoutes(app: FastifyInstance): void {
  // GET /api/sentinel/results — get latest sentinel check results
  app.get('/api/sentinel/results', async (req) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '20', 10), 100);
    const rows = getAll(
      getDb(),
      "SELECT * FROM events WHERE type LIKE 'sentinel.%' ORDER BY id DESC LIMIT ?",
      [limit]
    );
    return {
      ok: true,
      data: rows.map(r => ({
        id: r.id,
        type: r.type,
        taskId: r.task_id,
        data: JSON.parse(r.data as string),
        timestamp: r.timestamp,
      })),
    };
  });
}
