import type { FastifyInstance } from 'fastify';
import * as execSvc from '../services/executorService.js';
import * as eventSvc from '../services/eventService.js';
import { EventType, ErrorCode } from '@axing/shared';
import type { RegisterExecutorRequest } from '@axing/shared';
import { stopMockProcessor } from '../services/mockAgent.js';

let mockStopped = false;

export function executorRoutes(app: FastifyInstance): void {
  // POST /api/executors/register
  app.post('/api/executors/register', async (req, reply) => {
    const body = req.body as RegisterExecutorRequest;
    if (!body.name || !body.type || !body.capabilities?.length) {
      return reply.status(400).send({
        ok: false, error: 'Missing required fields: name, type, capabilities',
        code: ErrorCode.ValidationError,
      });
    }
    const executor = execSvc.registerExecutor(body);
    eventSvc.recordEvent(EventType.ExecutorRegistered, undefined, executor.id, {
      name: executor.name, type: executor.type, capabilities: executor.capabilities,
    });

    // 当有真实 Agent（非 mock）注册时，停止内置 Mock 处理器
    if (!mockStopped && (body.type as string) !== 'mock') {
      stopMockProcessor();
      mockStopped = true;
      console.log('[Executors] 真实 Agent 注册，Mock 处理器已停止');
    }

    return reply.status(201).send({ ok: true, data: executor });
  });

  // GET /api/executors
  app.get('/api/executors', async () => {
    const executors = execSvc.listExecutors();
    return { ok: true, data: executors };
  });

  // GET /api/executors/:id
  app.get('/api/executors/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const executor = execSvc.getExecutor(id);
    if (!executor) return reply.status(404).send({
      ok: false, error: 'Executor not found', code: ErrorCode.ExecutorNotFound,
    });
    return { ok: true, data: executor };
  });

  // POST /api/executors/:id/heartbeat
  app.post('/api/executors/:id/heartbeat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = execSvc.getExecutor(id);
    if (!prev) return reply.status(404).send({
      ok: false, error: 'Executor not found', code: ErrorCode.ExecutorNotFound,
    });
    execSvc.updateHeartbeat(id);
    if (prev.status === 'offline' || prev.status === 'error') {
      eventSvc.recordEvent(EventType.ExecutorOnline, undefined, id, { name: prev.name });
    }
    return { ok: true, data: { ok: true } };
  });
}
