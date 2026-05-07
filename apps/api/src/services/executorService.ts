import { v4 as uuid } from 'uuid';
import { getDb, getOne, getAll } from '../db/index.js';
import type { Executor, RegisterExecutorRequest, ExecutorCapability } from '@axing/shared';

export function registerExecutor(input: RegisterExecutorRequest): Executor {
  const db = getDb();
  const id = uuid();
  db.run(
    'INSERT INTO executors (id, name, type, status, capabilities) VALUES (?, ?, ?, ?, ?)',
    [id, input.name, input.type, 'online', JSON.stringify(input.capabilities)]
  );
  return getExecutor(id)!;
}

export function getExecutor(id: string): Executor | null {
  const db = getDb();
  const row = getOne(db, 'SELECT * FROM executors WHERE id = ?', [id]);
  return row ? rowToExecutor(row) : null;
}

export function listExecutors(): Executor[] {
  const db = getDb();
  const rows = getAll(db, 'SELECT * FROM executors ORDER BY created_at DESC');
  return rows.map(rowToExecutor);
}

export function updateHeartbeat(executorId: string): boolean {
  const db = getDb();
  db.run(`
    UPDATE executors SET last_heartbeat_at = datetime('now'), updated_at = datetime('now'),
      status = CASE WHEN status = 'offline' OR status = 'error' THEN 'online' ELSE status END
    WHERE id = ?
  `, [executorId]);
  return db.getRowsModified() > 0;
}

export function markOfflineExecutors(timeoutMs: number): number {
  const db = getDb();
  db.run(`
    UPDATE executors SET status = 'offline', current_task_id = NULL, updated_at = datetime('now')
    WHERE status IN ('online', 'busy') AND datetime(last_heartbeat_at, '+' || ? || ' seconds') < datetime('now')
  `, [Math.ceil(timeoutMs / 1000)]);
  return db.getRowsModified();
}

function rowToExecutor(row: Record<string, unknown>): Executor {
  let caps: ExecutorCapability[] = [];
  try { caps = JSON.parse(row.capabilities as string); } catch { /* */ }
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Executor['type'],
    status: row.status as Executor['status'],
    capabilities: caps,
    currentTaskId: row.current_task_id as string | undefined,
    lastHeartbeatAt: row.last_heartbeat_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
