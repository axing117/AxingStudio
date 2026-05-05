import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config.js';
import { runMigrations } from './schema.js';

let db: Database;
let SQL: SqlJsStatic;

const DB_PATH = resolve(config.dbPath);

export async function initDb(): Promise<Database> {
  if (db) return db;
  SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new SQL.Database();
  }

  runMigrations(db);
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

/** Persist in-memory DB to disk */
export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

// Auto-save every 30s
setInterval(() => {
  try { saveDb(); } catch { /* silent */ }
}, 30_000);

// Save on process exit
process.on('exit', () => saveDb());
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });

// ---- query helpers (sql.js wrapper) ----

export function getOne(db: Database, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function getAll(db: Database, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function execRun(db: Database, sql: string, params: unknown[] = []): number {
  db.run(sql, params);
  // Get last insert rowid
  const r = getOne(db, 'SELECT last_insert_rowid() as id');
  return (r?.id as number) || 0;
}

/** Run multiple statements in a transaction */
export function transaction<T>(db: Database, fn: () => T): T {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    return result;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}
