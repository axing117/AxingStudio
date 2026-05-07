import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '@axing/shared';
import * as vault from '../services/vaultService.js';
import { getOne, getDb } from '../db/index.js';

export function vaultRoutes(app: FastifyInstance): void {
  // GET /api/vault/:taskId — list files
  app.get('/api/vault/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = getOne(getDb(), 'SELECT id FROM tasks WHERE id = ?', [taskId]);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });
    const files = vault.listFiles(taskId);
    return { ok: true, data: files };
  });

  // GET /api/vault/:taskId/:filename — download file
  app.get('/api/vault/:taskId/:filename', async (req, reply) => {
    const { taskId, filename } = req.params as { taskId: string; filename: string };
    const file = vault.readFile(taskId, filename);
    if (!file) return reply.status(404).send({ ok: false, error: 'File not found', code: ErrorCode.TaskNotFound });
    return reply.header('Content-Type', file.mimeType).send(file.content);
  });

  // POST /api/vault/:taskId — upload file (JSON body: { filename, content: string | base64 })
  app.post('/api/vault/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const body = req.body as { filename?: string; content?: string; encoding?: 'utf8' | 'base64' };
    if (!body.filename || body.content === undefined) {
      return reply.status(400).send({ ok: false, error: 'filename and content required', code: ErrorCode.ValidationError });
    }
    const task = getOne(getDb(), 'SELECT id FROM tasks WHERE id = ?', [taskId]);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found', code: ErrorCode.TaskNotFound });

    const data = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : body.content;
    const file = vault.writeFile(taskId, body.filename, data);
    return reply.status(201).send({ ok: true, data: file });
  });
}
