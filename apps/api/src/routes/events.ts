import type { FastifyInstance } from 'fastify';
import * as eventSvc from '../services/eventService.js';

export function eventRoutes(app: FastifyInstance): void {
  // GET /api/events
  app.get('/api/events', async (req) => {
    const q = req.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 200);
    const offset = parseInt(q.offset || '0', 10);
    const taskId = q.taskId;
    const events = eventSvc.listEvents(limit, offset, taskId);
    return { ok: true, data: events };
  });
}
