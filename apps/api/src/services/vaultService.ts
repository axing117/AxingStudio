import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { config } from '../config.js';

export interface VaultFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

function taskDir(taskId: string): string {
  const dir = resolve(config.vaultRoot, taskId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeFile(taskId: string, filename: string, content: string | Buffer): VaultFile {
  const dir = taskDir(taskId);
  const safeName = basename(filename);
  const filePath = resolve(dir, safeName);
  writeFileSync(filePath, content);
  const stat = statSync(filePath);
  return {
    name: safeName,
    path: filePath,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export function readFile(taskId: string, filename: string): { content: Buffer; mimeType: string } | null {
  const safeName = basename(filename);
  const filePath = resolve(config.vaultRoot, taskId, safeName);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  const mime = guessMime(safeName);
  return { content, mimeType: mime };
}

export function listFiles(taskId: string): VaultFile[] {
  const dir = resolve(config.vaultRoot, taskId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(name => {
    const fp = join(dir, name);
    const stat = statSync(fp);
    return { name, path: fp, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  });
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    js: 'text/javascript',
    json: 'application/json',
    mp4: 'video/mp4',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    log: 'text/plain',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}
