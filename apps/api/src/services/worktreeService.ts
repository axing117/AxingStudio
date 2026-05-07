import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { config } from '../config.js';

const PROJECT_ROOT = resolve(config.vaultRoot, '..');

function worktreePath(taskId: string): string {
  return resolve(PROJECT_ROOT, 'worktrees', taskId);
}

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: PROJECT_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface WorktreeInfo {
  taskId: string;
  path: string;
  branch: string;
  files: { name: string; size: number }[];
}

export function createWorktree(taskId: string): WorktreeInfo {
  const wPath = worktreePath(taskId);
  if (existsSync(wPath)) return getWorktree(taskId);

  if (isGitRepo()) {
    const branch = `task/${taskId.slice(0, 8)}`;
    // Remove branch if it exists from a previous incomplete cleanup
    try { execSync(`git branch -D ${branch}`, { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch { /* ok */ }
    execSync(`git worktree add -b ${branch} "${wPath}" HEAD`, { cwd: PROJECT_ROOT, stdio: 'ignore' });
    return {
      taskId,
      path: wPath,
      branch,
      files: [],
    };
  }

  // Fallback: plain directory
  mkdirSync(wPath, { recursive: true });
  return { taskId, path: wPath, branch: 'none', files: [] };
}

export function getWorktree(taskId: string): WorktreeInfo {
  const wPath = worktreePath(taskId);
  if (!existsSync(wPath)) throw new Error(`Worktree not found: ${taskId}`);

  let branch = 'unknown';
  try {
    branch = execSync(`git -C "${wPath}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8' }).trim();
  } catch { /* not a git worktree */ }

  const files = readdirSync(wPath)
    .filter(f => f !== '.git')
    .map(f => {
      const fp = join(wPath, f);
      try { return { name: f, size: statSync(fp).size }; } catch { return { name: f, size: 0 }; }
    });

  return { taskId, path: wPath, branch, files };
}

export function listWorktrees(): WorktreeInfo[] {
  const root = resolve(PROJECT_ROOT, 'worktrees');
  if (!existsSync(root)) return [];

  // Enumerate both git and directory worktrees
  const seen = new Set<string>();
  if (isGitRepo()) {
    try {
      const out = execSync('git worktree list --porcelain', { cwd: PROJECT_ROOT, encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (line.startsWith('worktree ')) {
          const p = line.slice(9);
          if (p.startsWith(root)) seen.add(basename(p));
        }
      }
    } catch { /* ok */ }
  }

  // Also scan directory for non-git worktrees
  for (const entry of readdirSync(root)) {
    seen.add(entry);
  }

  return [...seen].map(id => {
    try { return getWorktree(id); } catch { return null; }
  }).filter(Boolean) as WorktreeInfo[];
}

export function writeFile(taskId: string, filename: string, content: string): { name: string; size: number } {
  const wPath = worktreePath(taskId);
  if (!existsSync(wPath)) throw new Error(`Worktree not found: ${taskId}`);
  const safeName = basename(filename);
  const filePath = join(wPath, safeName);
  writeFileSync(filePath, content, 'utf8');
  return { name: safeName, size: Buffer.byteLength(content, 'utf8') };
}

export function removeWorktree(taskId: string): boolean {
  const wPath = worktreePath(taskId);
  if (!existsSync(wPath)) return false;

  if (isGitRepo()) {
    try {
      execSync(`git worktree remove --force "${wPath}"`, { cwd: PROJECT_ROOT, stdio: 'ignore' });
      // Clean up leftover branch
      try { execSync(`git branch -D task/${taskId.slice(0, 8)}`, { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch { /* ok */ }
    } catch {
      // Fallback: force remove directory
      rmSync(wPath, { recursive: true, force: true });
    }
  } else {
    rmSync(wPath, { recursive: true, force: true });
  }
  return true;
}
