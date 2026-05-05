import { v4 as uuid } from 'uuid';
import { getDb, getOne, getAll, transaction } from '../db/index.js';
import type { Task, CreateTaskRequest } from '@axing/shared';
import { TaskStatus, TaskType } from '@axing/shared';

const LEASE_DURATION_SEC = 30;

export function createTask(input: CreateTaskRequest): Task {
  const db = getDb();
  const id = uuid();
  db.run(
    `INSERT INTO tasks (id, type, title, input, max_retries) VALUES (?, ?, ?, ?, ?)`,
    [id, input.type, input.title, JSON.stringify(input.input), input.maxRetries ?? 3]
  );
  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = getOne(db, 'SELECT * FROM tasks WHERE id = ?', [id]);
  return row ? rowToTask(row) : null;
}

export function listTasks(status?: TaskStatus): Task[] {
  const db = getDb();
  let rows: Record<string, unknown>[];
  if (status) {
    rows = getAll(db, 'SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC', [status]);
  } else {
    rows = getAll(db, 'SELECT * FROM tasks ORDER BY created_at DESC');
  }
  return rows.map(rowToTask);
}

/** Attempt to claim a queued task (or reclaim one with expired lease). */
export function claimTask(taskId: string, agentId: string): { task: Task; leaseExpiresAt: string } | null {
  const db = getDb();
  return transaction(db, () => {
    const task = getOne(db, `
      SELECT * FROM tasks WHERE id = ? AND (
        status = 'queued'
        OR (status = 'running' AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at) < datetime('now'))
      )
    `, [taskId]);
    if (!task) return null;

    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_SEC * 1000).toISOString();
    db.run(
      `UPDATE tasks SET status = 'running', agent_id = ?, lease_expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [agentId, leaseExpiresAt, taskId]
    );
    db.run(
      `UPDATE agents SET status = 'busy', current_task_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [taskId, agentId]
    );
    const updated = getOne(db, 'SELECT * FROM tasks WHERE id = ?', [taskId]);
    return { task: rowToTask(updated!), leaseExpiresAt };
  });
}

export function heartbeatTask(taskId: string): { leaseExpiresAt: string } | null {
  const db = getDb();
  const task = getOne(db, "SELECT * FROM tasks WHERE id = ? AND status = 'running'", [taskId]);
  if (!task) return null;
  const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_SEC * 1000).toISOString();
  db.run("UPDATE tasks SET lease_expires_at = ?, updated_at = datetime('now') WHERE id = ?", [leaseExpiresAt, taskId]);
  return { leaseExpiresAt };
}

export function completeTask(taskId: string, output: Record<string, unknown>): Task | null {
  const db = getDb();
  return transaction(db, () => {
    const task = getOne(db, "SELECT * FROM tasks WHERE id = ? AND status = 'running'", [taskId]);
    if (!task) return null;
    db.run(
      "UPDATE tasks SET status = 'completed', output = ?, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(output), taskId]
    );
    if (task.agent_id) {
      db.run(
        "UPDATE agents SET status = 'online', current_task_id = NULL, updated_at = datetime('now') WHERE id = ?",
        [task.agent_id]
      );
    }
    const updated = getOne(db, 'SELECT * FROM tasks WHERE id = ?', [taskId]);
    return rowToTask(updated!);
  });
}

export function failTask(taskId: string, error: string): Task | null {
  const db = getDb();
  return transaction(db, () => {
    const task = getOne(db, "SELECT * FROM tasks WHERE id = ? AND status = 'running'", [taskId]);
    if (!task) return null;
    const retryCount = (task.retry_count as number) + 1;
    const newStatus: string = retryCount < (task.max_retries as number) ? 'retrying' : 'failed';
    const clearAgentId = newStatus === 'retrying' ? null : task.agent_id;
    db.run(
      `UPDATE tasks SET status = ?, error = ?, retry_count = ?, lease_expires_at = NULL, agent_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, error, retryCount, clearAgentId, taskId]
    );
    if (task.agent_id) {
      db.run(
        "UPDATE agents SET status = 'online', current_task_id = NULL, updated_at = datetime('now') WHERE id = ?",
        [task.agent_id]
      );
    }
    const updated = getOne(db, 'SELECT * FROM tasks WHERE id = ?', [taskId]);
    return rowToTask(updated!);
  });
}

// ===== helpers =====
function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    title: row.title as string,
    input: jsonParse(row.input as string),
    output: row.output ? jsonParse(row.output as string) : undefined,
    error: row.error as string | undefined,
    agentId: row.agent_id as string | undefined,
    retryCount: row.retry_count as number,
    maxRetries: row.max_retries as number,
    leaseExpiresAt: row.lease_expires_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function jsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
