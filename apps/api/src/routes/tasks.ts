import type { FastifyInstance } from 'fastify';
import * as taskSvc from '../services/taskService.js';
import * as eventSvc from '../services/eventService.js';
import { getOne } from '../db/index.js';
import { getDb } from '../db/index.js';
import { EventType, ErrorCode } from '@axing/shared';
import type { CreateTaskRequest, ClaimRequest, HeartbeatRequest, CompleteRequest, FailRequest } from '@axing/shared';

export function taskRoutes(app: FastifyInstance): void {
  app.post('/api/tasks', async (req, reply) => {
    const body = req.body as CreateTaskRequest;
    if (!body.type || !body.title || !body.input) {
      return reply.status(400).send({ ok: false, error: 'Missing fields: type, title, input', code: ErrorCode.ValidationError });
    }
    const task = taskSvc.createTask(body);
    eventSvc.recordEvent(EventType.TaskCreated, task.id, undefined, { title: task.title, type: task.type });
    return reply.status(201).send({ ok: true, data: task });
  });

  app.get('/api/tasks', async (req) => {
    const status = (req.query as Record<string, string>).status;
    const tasks = taskSvc.listTasks(status as Parameters<typeof taskSvc.listTasks>[0]);
    return { ok: true, data: tasks };
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = taskSvc.getTask(id);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    return { ok: true, data: task };
  });

  app.post('/api/tasks/:id/claim', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { agentId } = req.body as ClaimRequest;
    if (!agentId) return reply.status(400).send({ ok: false, error: 'agentId required', code: ErrorCode.ValidationError });

    const agent = getOne(getDb(), 'SELECT id FROM agents WHERE id = ?', [agentId]);
    if (!agent) return reply.status(404).send({ ok: false, error: 'Agent not found', code: ErrorCode.AgentNotFound });

    const result = taskSvc.claimTask(id, agentId);
    if (!result) return reply.status(409).send({ ok: false, error: 'Task not claimable', code: ErrorCode.TaskNotClaimable });

    eventSvc.recordEvent(EventType.TaskClaimed, id, agentId, {});
    return { ok: true, data: { task: result.task, leaseExpiresAt: result.leaseExpiresAt } };
  });

  app.post('/api/tasks/:id/heartbeat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { agentId } = req.body as HeartbeatRequest;
    const task = taskSvc.getTask(id);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    if (task.agentId !== agentId) return reply.status(403).send({ ok: false, error: 'Not your task', code: ErrorCode.NotYourTask });
    if (task.status !== 'running') return reply.status(409).send({ ok: false, error: 'Task not running', code: ErrorCode.InvalidTransition });

    const result = taskSvc.heartbeatTask(id);
    if (!result) return reply.status(410).send({ ok: false, error: 'Lease expired', code: ErrorCode.LeaseExpired });

    eventSvc.recordEvent(EventType.TaskHeartbeat, id, agentId, {});
    return { ok: true, data: { ok: true, leaseExpiresAt: result.leaseExpiresAt } };
  });

  app.post('/api/tasks/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { output } = req.body as CompleteRequest;
    if (!output) return reply.status(400).send({ ok: false, error: 'output required', code: ErrorCode.ValidationError });

    const task = taskSvc.getTask(id);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    if (task.status !== 'running') return reply.status(409).send({ ok: false, error: 'Task not running', code: ErrorCode.InvalidTransition });

    const updated = taskSvc.completeTask(id, output);
    if (!updated) return reply.status(409).send({ ok: false, error: 'Could not complete', code: ErrorCode.InvalidTransition });

    eventSvc.recordEvent(EventType.TaskCompleted, id, task.agentId, { output });
    return { ok: true, data: updated };
  });

  app.post('/api/tasks/:id/fail', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { error } = req.body as FailRequest;
    if (!error) return reply.status(400).send({ ok: false, error: 'error required', code: ErrorCode.ValidationError });

    const task = taskSvc.getTask(id);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    if (task.status !== 'running') return reply.status(409).send({ ok: false, error: 'Task not running', code: ErrorCode.InvalidTransition });

    const updated = taskSvc.failTask(id, error);
    if (!updated) return reply.status(409).send({ ok: false, error: 'Could not fail', code: ErrorCode.InvalidTransition });

    const eventType = updated.status === 'retrying' ? EventType.TaskRetrying : EventType.TaskFailed;
    eventSvc.recordEvent(eventType, id, task.agentId, { error });
    return { ok: true, data: updated };
  });
}
