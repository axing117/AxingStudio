import { getDb, getOne, getAll } from '../db/index.js';
import type { EventType, TaskEvent } from '@axing/shared';

export function recordEvent(type: EventType, taskId?: string, agentId?: string, data: Record<string, unknown> = {}): TaskEvent {
  const db = getDb();
  db.run('INSERT INTO events (type, task_id, agent_id, data) VALUES (?, ?, ?, ?)',
    [type, taskId ?? null, agentId ?? null, JSON.stringify(data)]);
  const row = getOne(db, 'SELECT last_insert_rowid() as id');
  const id = row?.id as number;
  const result = getOne(db, 'SELECT * FROM events WHERE id = ?', [id])!;
  return rowToEvent(result);
}

export function listEvents(limit = 50, offset = 0, taskId?: string): TaskEvent[] {
  const db = getDb();
  let rows: Record<string, unknown>[];
  if (taskId) {
    rows = getAll(db, 'SELECT * FROM events WHERE task_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [taskId, limit, offset]);
  } else {
    rows = getAll(db, 'SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  }
  return rows.map(rowToEvent);
}

function rowToEvent(row: Record<string, unknown>): TaskEvent {
  return {
    id: row.id as number,
    type: row.type as EventType,
    taskId: (row.task_id as string) ?? undefined,
    agentId: (row.agent_id as string) ?? undefined,
    data: JSON.parse(row.data as string),
    timestamp: row.timestamp as string,
  };
}
