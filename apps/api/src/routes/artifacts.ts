import { v4 as uuid } from 'uuid';
import type { FastifyInstance } from 'fastify';
import { getDb, getOne, getAll } from '../db/index.js';
import * as eventSvc from '../services/eventService.js';
import { EventType, type Artifact } from '@axing/shared';

export function artifactRoutes(app: FastifyInstance): void {
  app.get('/api/artifacts', async (req) => {
    const q = req.query as Record<string, string>;
    const db = getDb();
    let rows: Record<string, unknown>[];
    if (q.taskId) {
      rows = getAll(db, 'SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC', [q.taskId]);
    } else {
      rows = getAll(db, 'SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 50');
    }
    return { ok: true, data: rows.map(rowToArtifact) };
  });

  app.post('/api/artifacts', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const db = getDb();
    const id = uuid();
    db.run('INSERT INTO artifacts (id, task_id, type, name, path, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [id, body.taskId, body.type, body.name, body.path, JSON.stringify(body.metadata || {})]);
    const artifact = getOne(db, 'SELECT * FROM artifacts WHERE id = ?', [id]);
    eventSvc.recordEvent(EventType.ArtifactCreated, body.taskId as string, undefined, { artifactId: id, name: body.name });
    return reply.status(201).send({ ok: true, data: rowToArtifact(artifact!) });
  });
}

function rowToArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    type: row.type as Artifact['type'],
    name: row.name as string,
    path: row.path as string,
    metadata: JSON.parse(row.metadata as string),
    createdAt: row.created_at as string,
  };
}
