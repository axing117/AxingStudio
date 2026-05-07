import type { FastifyInstance } from 'fastify';
import * as taskSvc from '../services/taskService.js';
import * as eventSvc from '../services/eventService.js';
import { getOne } from '../db/index.js';
import { getDb } from '../db/index.js';
import { EventType, ErrorCode } from '@axing/shared';
import type { CreateTaskRequest, ClaimRequest, HeartbeatRequest, CompleteRequest, FailRequest, CreateWorkflowRequest } from '@axing/shared';

export function taskRoutes(app: FastifyInstance): void {
  // POST /api/workflows — batch create tasks with index-based dependencies
  app.post('/api/workflows', async (req, reply) => {
    const body = req.body as CreateWorkflowRequest;
    if (!body.tasks?.length) {
      return reply.status(400).send({ ok: false, error: 'tasks array required', code: ErrorCode.ValidationError });
    }

    // Phase 1: create all tasks and collect their IDs
    const createdIds: string[] = [];
    for (const spec of body.tasks) {
      const task = taskSvc.createTask({
        type: spec.type,
        title: spec.title,
        input: spec.input,
        maxRetries: spec.maxRetries,
        // no dependsOn yet — we resolve indexes → IDs in phase 2
      });
      createdIds.push(task.id);
      eventSvc.recordEvent(EventType.TaskCreated, task.id, undefined, { title: task.title, type: task.type });
    }

    // Phase 2: if tasks have dependsOnIndexes, update their depends_on and re-evaluate status
    const blockedIds: string[] = [];
    for (let i = 0; i < body.tasks.length; i++) {
      const spec = body.tasks[i];
      if (spec.dependsOnIndexes?.length) {
        const dependsOnIds = spec.dependsOnIndexes.map(idx => createdIds[idx]);
        const db = getDb();
        db.run('UPDATE tasks SET depends_on = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [
          JSON.stringify(dependsOnIds), 'blocked', createdIds[i],
        ]);
        blockedIds.push(createdIds[i]);
      }
    }

    // Record blocked events after all updates
    for (const id of blockedIds) {
      eventSvc.recordEvent(EventType.TaskBlocked, id, undefined, {});
    }

    const tasks = createdIds.map(id => taskSvc.getTask(id)!);
    return reply.status(201).send({ ok: true, data: { tasks, workflowId: createdIds[0] } });
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = req.body as CreateTaskRequest;
    if (!body.type || !body.title || !body.input) {
      return reply.status(400).send({ ok: false, error: 'Missing fields: type, title, input', code: ErrorCode.ValidationError });
    }
    const task = taskSvc.createTask(body);
    if (task.status === 'blocked') {
      eventSvc.recordEvent(EventType.TaskBlocked, task.id, undefined, { title: task.title, type: task.type, dependsOn: body.dependsOn });
    } else {
      eventSvc.recordEvent(EventType.TaskCreated, task.id, undefined, { title: task.title, type: task.type });
    }
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

    const result = taskSvc.completeTask(id, output);
    if (!result) return reply.status(409).send({ ok: false, error: 'Could not complete', code: ErrorCode.InvalidTransition });

    eventSvc.recordEvent(EventType.TaskCompleted, id, task.agentId, { output });
    for (const unblockedId of result.unblockedIds) {
      eventSvc.recordEvent(EventType.TaskUnblocked, unblockedId, undefined, { byTaskId: id });
    }
    return { ok: true, data: result.task };
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
