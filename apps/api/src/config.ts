import { resolve } from 'node:path';

// 使用环境变量或 process.cwd() 作为基础目录
export const baseDir = process.env.AXING_API_DIR || process.cwd();

export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  baseDir,
  dbPath: process.env.DB_PATH || resolve(baseDir, 'axing.db'),
  vaultRoot: process.env.VAULT_ROOT || resolve(baseDir, '..', 'vault'),
  heartbeatTimeoutMs: 30_000,
};
