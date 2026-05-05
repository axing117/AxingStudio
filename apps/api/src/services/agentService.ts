import { v4 as uuid } from 'uuid';
import { getDb, getOne, getAll } from '../db/index.js';
import type { Agent, RegisterAgentRequest } from '@axing/shared';

export function registerAgent(input: RegisterAgentRequest): Agent {
  const db = getDb();
  const id = uuid();
  db.run('INSERT INTO agents (id, name, type, status) VALUES (?, ?, ?, ?)', [id, input.name, input.type, 'online']);
  return getAgent(id)!;
}

export function getAgent(id: string): Agent | null {
  const db = getDb();
  const row = getOne(db, 'SELECT * FROM agents WHERE id = ?', [id]);
  return row ? rowToAgent(row) : null;
}

export function listAgents(): Agent[] {
  const db = getDb();
  const rows = getAll(db, 'SELECT * FROM agents ORDER BY created_at DESC');
  return rows.map(rowToAgent);
}

export function updateHeartbeat(agentId: string): boolean {
  const db = getDb();
  db.run(`
    UPDATE agents SET last_heartbeat_at = datetime('now'), updated_at = datetime('now'),
      status = CASE WHEN status = 'offline' THEN 'online' ELSE status END
    WHERE id = ?
  `, [agentId]);
  return db.getRowsModified() > 0;
}

export function markOfflineAgents(timeoutMs: number): number {
  const db = getDb();
  db.run(`
    UPDATE agents SET status = 'offline', current_task_id = NULL, updated_at = datetime('now')
    WHERE status != 'offline' AND datetime(last_heartbeat_at, '+' || ? || ' seconds') < datetime('now')
  `, [Math.ceil(timeoutMs / 1000)]);
  return db.getRowsModified();
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Agent['type'],
    status: row.status as Agent['status'],
    currentTaskId: row.current_task_id as string | undefined,
    lastHeartbeatAt: row.last_heartbeat_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
