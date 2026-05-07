import type { Database } from 'sql.js';

function migrateTasksCheckConstraint(db: Database): void {
  // Check if the old schema (without 'blocked') is still in place
  const result = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!result.length) return;
  const sql = (result[0].values[0]?.[0] as string) ?? '';
  if (sql.includes("'blocked'")) return; // already migrated

  // Rebuild tasks table with the updated CHECK constraint
  db.run('BEGIN');
  try {
    db.run(`CREATE TABLE tasks_v2 (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK(type IN ('oracle','forge','hermes')),
      status           TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('blocked','queued','running','completed','failed','retrying')),
      title            TEXT NOT NULL,
      input            TEXT NOT NULL DEFAULT '{}',
      output           TEXT,
      error            TEXT,
      agent_id         TEXT,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      max_retries      INTEGER NOT NULL DEFAULT 3,
      lease_expires_at TEXT,
      depends_on       TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run('INSERT INTO tasks_v2 SELECT id, type, status, title, input, output, error, agent_id, retry_count, max_retries, lease_expires_at, depends_on, created_at, updated_at FROM tasks');
    db.run('DROP TABLE tasks');
    db.run('ALTER TABLE tasks_v2 RENAME TO tasks');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)');
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK(type IN ('oracle','forge','hermes')),
      status           TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('blocked','queued','running','completed','failed','retrying')),
      title            TEXT NOT NULL,
      input            TEXT NOT NULL DEFAULT '{}',
      output           TEXT,
      error            TEXT,
      agent_id         TEXT,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      max_retries      INTEGER NOT NULL DEFAULT 3,
      lease_expires_at TEXT,
      depends_on       TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('oracle','forge','hermes','sentinel')),
      status            TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','busy')),
      current_task_id   TEXT,
      last_heartbeat_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS executors (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('claude-code','codex','mimo')),
      status            TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','busy','error')),
      capabilities      TEXT NOT NULL DEFAULT '[]',
      current_task_id   TEXT,
      last_heartbeat_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT NOT NULL,
      task_id   TEXT,
      agent_id  TEXT,
      data      TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)`);

  // V2 DAG migration: add depends_on column to existing tables
  try { db.run(`ALTER TABLE tasks ADD COLUMN depends_on TEXT`); } catch { /* already exists */ }

  // Executor migration: add preferred_executor column
  try { db.run(`ALTER TABLE tasks ADD COLUMN preferred_executor TEXT`); } catch { /* already exists */ }

  // V2 DAG migration: add 'blocked' to status CHECK constraint (SQLite requires table rebuild)
  migrateTasksCheckConstraint(db);

  db.run(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('text','image','video','code','log')),
      name       TEXT NOT NULL,
      path       TEXT NOT NULL,
      metadata   TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);
}
