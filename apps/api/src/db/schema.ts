import type { Database } from 'sql.js';

export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK(type IN ('oracle','forge','hermes')),
      status           TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','retrying')),
      title            TEXT NOT NULL,
      input            TEXT NOT NULL DEFAULT '{}',
      output           TEXT,
      error            TEXT,
      agent_id         TEXT,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      max_retries      INTEGER NOT NULL DEFAULT 3,
      lease_expires_at TEXT,
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
