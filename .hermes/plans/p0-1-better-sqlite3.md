# P0-1: sql.js → better-sqlite3 持久化升级

## 目标
将 API 后端的数据库从 sql.js (WASM 内存数据库，每30秒手动持久化) 升级到 better-sqlite3 (原生 SQLite，实时持久化，零数据丢失风险)。

## 项目路径
`C:\Users\rochelimit\Desktop\workforxlx\AxingStudio`

## 步骤

### 1. 安装依赖
在项目根目录执行:
```bash
npm install better-sqlite3 -w apps/api
npm install -D @types/better-sqlite3 -w apps/api
npm uninstall sql.js -w apps/api
```

### 2. 重写 `apps/api/src/db/index.ts`
替换整个文件。关键变化:
- 移除 sql.js 的 WASM 初始化逻辑
- 使用 `better-sqlite3` 的同步 API
- 移除 `saveDb()` 和 30秒定时器 (better-sqlite3 自动持久化)
- 重写 helper 函数:
  - `getOne(db, sql, params)` → `db.prepare(sql).get(...params)` 
  - `getAll(db, sql, params)` → `db.prepare(sql).all(...params)`
  - `execRun(db, sql, params)` → `db.prepare(sql).run(...params)` 返回 `changes` 和 `lastInsertRowid`
  - `transaction(db, fn)` → `db.transaction(fn)()`
- `getDb()` 返回 `better-sqlite3.Database` 类型
- `initDb()` 改为同步函数 (better-sqlite3 是同步的)

新文件内容:
```typescript
import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../config.js';
import { runMigrations } from './schema.js';

let db: Database.Database;

const DB_PATH = resolve(config.dbPath);

export function initDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// No saveDb needed — better-sqlite3 writes directly to disk
```

### 3. 更新 `apps/api/src/db/schema.ts`
- 将所有 `db.run(sql)` 改为 `db.exec(sql)` (better-sqlite3 的多语句执行)
- 单条语句用 `db.prepare(sql).run()`
- 类型从 `Database` (sql.js) 改为 `Database.Database` (better-sqlite3)
- `migrateTasksCheckConstraint` 中的事务用 `db.transaction()()`

### 4. 更新所有使用 db helper 的文件
以下文件需要更新 import 和调用方式:
- `apps/api/src/services/taskService.ts`
- `apps/api/src/services/eventService.ts`
- `apps/api/src/services/agentService.ts`
- `apps/api/src/services/executorService.ts`
- `apps/api/src/services/vaultService.ts`
- `apps/api/src/services/worktreeService.ts`
- `apps/api/src/routes/tasks.ts` (直接用 getDb 的地方)

变化:
- `import type { Database } from 'sql.js'` → 移除 (不再需要)
- `getOne(db, sql, [params])` → `db.prepare(sql).get(params)` (注意: better-sqlite3 的 .get() 接受展开参数或对象)
- `getAll(db, sql, [params])` → `db.prepare(sql).all(params)`
- `db.run(sql, [params])` → `db.prepare(sql).run(params)`
- `transaction(db, fn)` → `db.transaction(fn)()`

### 5. 更新 `apps/api/src/index.ts`
- `initDb()` 现在是同步的，移除 `await`:
  ```typescript
  // 之前: await initDb();
  // 之后: initDb();
  ```

### 6. 更新 `apps/api/src/types/sql.js.d.ts`
- 删除此文件 (不再需要)

### 7. 验证
```bash
cd C:\Users\rochelimit\Desktop\workforxlx\AxingStudio
npm run build  # 确保编译通过
npm -w apps/api run dev  # 启动 API 确认数据库创建成功
```

## 注意事项
- better-sqlite3 是原生模块，需要 node-gyp 编译。Windows 上需要 Visual Studio Build Tools。
  如果编译失败，尝试: `npm config set msvs_version 2022`
- 如果 better-sqlite3 安装困难，备选方案: 继续用 sql.js 但改成每次写操作后立即 saveDb()
- WAL 模式提供更好的并发性能和崩溃恢复
