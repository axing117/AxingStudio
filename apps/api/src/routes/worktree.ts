import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '@axing/shared';
import * as wt from '../services/worktreeService.js';
import { getOne, getDb } from '../db/index.js';

export function worktreeRoutes(app: FastifyInstance): void {
  // GET /api/worktrees — list all worktrees
  app.get('/api/worktrees', async () => {
    const trees = wt.listWorktrees();
    return { ok: true, data: trees };
  });

  // POST /api/worktrees/:taskId — create worktree for a task
  app.post('/api/worktrees/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = getOne(getDb(), 'SELECT id FROM tasks WHERE id = ?', [taskId]);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    const info = wt.createWorktree(taskId);
    return reply.status(201).send({ ok: true, data: info });
  });

  // GET /api/worktrees/:taskId — get worktree info for a task
  app.get('/api/worktrees/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    try {
      const info = wt.getWorktree(taskId);
      return { ok: true, data: info };
    } catch {
      return reply.status(404).send({ ok: false, error: 'Worktree not found', code: ErrorCode.TaskNotFound });
    }
  });

  // POST /api/worktrees/:taskId/files — write a file into the worktree
  app.post('/api/worktrees/:taskId/files', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const { filename, content } = req.body as { filename: string; content: string };
    if (!filename || content === undefined) {
      return reply.status(400).send({ ok: false, error: 'filename and content required', code: ErrorCode.ValidationError });
    }
    try {
      const file = wt.writeFile(taskId, filename, content);
      return reply.status(201).send({ ok: true, data: file });
    } catch (err) {
      return reply.status(404).send({ ok: false, error: String(err), code: ErrorCode.TaskNotFound });
    }
  });

  // DELETE /api/worktrees/:taskId — remove worktree
  app.delete('/api/worktrees/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const removed = wt.removeWorktree(taskId);
    if (!removed) return reply.status(404).send({ ok: false, error: 'Worktree not found', code: ErrorCode.TaskNotFound });
    return { ok: true, data: { removed: true } };
  });
}
