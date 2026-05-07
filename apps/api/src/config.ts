import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || resolve(__dirname, '..', 'axing.db'),
  vaultRoot: process.env.VAULT_ROOT || resolve(__dirname, '..', '..', '..', 'vault'),
  heartbeatTimeoutMs: 30_000,
};
