import type { FastifyInstance } from 'fastify';
import * as eventSvc from '../services/eventService.js';
import { addClient } from '../services/sseManager.js';

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

  // GET /api/events/stream — SSE real-time event push
  app.get('/api/events/stream', async (req, reply) => {
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const id = addClient(raw);

    // Send recent events on connect for catch-up
    const recent = eventSvc.listEvents(10, 0);
    for (const ev of recent.reverse()) {
      raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    // Keepalive every 15s
    const keepalive = setInterval(() => {
      try { raw.write(':ping\n\n'); } catch { clearInterval(keepalive); }
    }, 15_000);

    req.raw.on('close', () => clearInterval(keepalive));
    req.raw.on('error', () => clearInterval(keepalive));

    // Never resolve — SSE is long-lived
    return reply;
  });
}
