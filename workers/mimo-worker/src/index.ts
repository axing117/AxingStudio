/**
 * MiMo Worker — 阿星工坊 Hermes Agent Worker
 * 对接小米 MiMo API，专责处理 hermes 媒体类任务（图片/视频生成）
 *
 * 环境变量：
 *   MIMO_API_KEY      — MiMo API Key (必须)
 *   MIMO_BASE_URL     — API 地址 (默认: https://token-plan-sgp.xiaomimimo.com/v1)
 *   MIMO_MODEL        — 模型名 (默认: mimo-v2.5-pro)
 *   API_URL           — CommandCenter 地址 (默认: http://localhost:3001)
 *   POLL_MS           — 轮询间隔 (默认: 3000)
 *   EXECUTOR_HEARTBEAT_MS — Executor 心跳间隔 (默认: 8000)
 *   TASK_HEARTBEAT_MS — 任务心跳间隔 (默认: 10000)
 */
import {
  ArtifactType,
  ExecutorCapability,
  ExecutorType,
  TaskStatus,
  type ApiResponse,
  type ClaimResponse,
  type Executor,
  type Task,
} from '@axing/shared';
import { executeTask } from './task-executors.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const API_URL = trimTrailingSlash(process.env.API_URL || 'http://localhost:3001');
const POLL_MS = numberEnv('POLL_MS', 3_000);
const EXECUTOR_HEARTBEAT_MS = numberEnv('EXECUTOR_HEARTBEAT_MS', 8_000);
const TASK_HEARTBEAT_MS = numberEnv('TASK_HEARTBEAT_MS', 10_000);

// MiMo Worker 只处理媒体类任务（hermes），oracle/forge 由 Claude Code Executor 专责
const CAPABILITIES: ExecutorCapability[] = [
  ExecutorCapability.HermesMedia,
];

const TASK_ROLE_BY_CAP: Partial<Record<ExecutorCapability, string>> = {
  [ExecutorCapability.HermesMedia]: 'hermes',
};

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */
async function main() {
  log('system', '=== 阿星工坊 MiMo Worker ===');
  log('system', `API: ${API_URL}`);
  log('system', `Model: ${process.env.MIMO_MODEL || 'mimo-v2.5-pro'}`);

  // 检查 API Key
  if (!process.env.MIMO_API_KEY) {
    log('system', '错误: MIMO_API_KEY 环境变量未设置');
    log('system', '请设置: export MIMO_API_KEY=your-api-key');
    process.exitCode = 1;
    return;
  }

  log('system', `能力: ${CAPABILITIES.join(', ')}`);
  await runExecutor(CAPABILITIES);
}

/* ------------------------------------------------------------------ */
/*  Executor 生命周期                                                    */
/* ------------------------------------------------------------------ */
async function runExecutor(capabilities: ExecutorCapability[]) {
  const executor = await registerWithRetry(capabilities);

  const heartbeatTimer = setInterval(() => {
    heartbeatExecutor(executor.id).catch((error) =>
      log('executor', `heartbeat failed: ${formatError(error)}`)
    );
  }, EXECUTOR_HEARTBEAT_MS);

  log('executor', `注册成功: ${executor.name} (${executor.id})`);

  // Build set of task types we can handle
  const handledTypes = new Set(
    capabilities
      .filter((c): c is keyof typeof TASK_ROLE_BY_CAP => c in TASK_ROLE_BY_CAP)
      .map((c) => TASK_ROLE_BY_CAP[c])
  );

  log('executor', `处理任务类型: ${[...handledTypes].join(', ')}`);

  while (true) {
    try {
      await heartbeatExecutor(executor.id);
      // 同时轮询 queued 和 retrying 状态的任务
      const queuedTasks = await getTasks(TaskStatus.Queued);
      const retryingTasks = await getTasks(TaskStatus.Retrying);
      const allTasks = [...queuedTasks, ...retryingTasks];
      const task = allTasks.find((t) => handledTypes.has(t.type));

      if (!task) {
        await sleep(POLL_MS);
        continue;
      }

      const claim = await claimTask(task.id, executor.id);
      log('executor', `领取任务: ${task.title} (${task.id}), 类型=${task.type}`);
      await executeTaskWithHeartbeat(executor, claim.task);
    } catch (error) {
      log('executor', `循环警告: ${formatError(error)}`);
      await sleep(POLL_MS);
    }
  }

  clearInterval(heartbeatTimer);
}

async function registerWithRetry(capabilities: ExecutorCapability[]): Promise<Executor> {
  while (true) {
    try {
      return await post<Executor>('/api/executors/register', {
        name: 'MiMo Worker',
        type: ExecutorType.MiMo,
        capabilities,
      });
    } catch (error) {
      log('executor', `等待 API: ${formatError(error)}`);
      await sleep(3_000);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  任务执行（带心跳）                                                   */
/* ------------------------------------------------------------------ */
async function executeTaskWithHeartbeat(executor: Executor, task: Task) {
  let taskHeartbeatFailed = false;
  const taskHeartbeatTimer = setInterval(() => {
    heartbeatTask(task.id, executor.id).catch((error) => {
      taskHeartbeatFailed = true;
      log('executor', `任务心跳停止: ${formatError(error)}`);
    });
  }, TASK_HEARTBEAT_MS);

  try {
    log('executor', `开始执行: ${task.title} (${task.type})`);
    const result = await executeTask(task);

    if (taskHeartbeatFailed) {
      throw new Error('lease was lost before completion');
    }

    // 上传产物到 Vault
    await uploadToVault(task.id, result.filename, result.fileContent);
    await createArtifact(task.id, result.artifact);

    // Forge 任务写入 worktree
    if (task.type === 'forge') {
      try {
        await createWorktree(task.id);
        await writeWorktreeFile(task.id, result.filename, result.fileContent);
        log('executor', `worktree 写入: ${task.id}/${result.filename}`);
      } catch (wtErr) {
        log('executor', `worktree 警告: ${formatError(wtErr)}`);
      }
    }

    await completeTask(task.id, result.output);
    log('executor', `完成: ${task.title}, vault/${task.id}/${result.filename}`);
  } catch (error) {
    log('executor', `任务失败: ${formatError(error)}`);
    try {
      await failTask(task.id, formatError(error));
    } catch (e) {
      log('executor', `failTask API 错误: ${formatError(e)}`);
    }
  } finally {
    clearInterval(taskHeartbeatTimer);
  }
}

/* ------------------------------------------------------------------ */
/*  API 调用 helpers                                                   */
/* ------------------------------------------------------------------ */
async function getTasks(status: Task['status']): Promise<Task[]> {
  return get<Task[]>(`/api/tasks?status=${status}`);
}

async function heartbeatExecutor(executorId: string): Promise<void> {
  await post<{ ok: boolean }>(`/api/executors/${executorId}/heartbeat`, {});
}

async function claimTask(taskId: string, executorId: string): Promise<ClaimResponse> {
  return post<ClaimResponse>(`/api/tasks/${taskId}/claim`, { agentId: executorId });
}

async function heartbeatTask(taskId: string, executorId: string): Promise<void> {
  await post<{ ok: boolean; leaseExpiresAt: string }>(`/api/tasks/${taskId}/heartbeat`, { agentId: executorId });
}

async function completeTask(taskId: string, output: Record<string, unknown>): Promise<Task> {
  return post<Task>(`/api/tasks/${taskId}/complete`, { output });
}

async function failTask(taskId: string, error: string): Promise<Task> {
  return post<Task>(`/api/tasks/${taskId}/fail`, { error });
}

async function createArtifact(
  taskId: string,
  artifact: { type: string; name: string; path: string; metadata: Record<string, unknown> },
): Promise<void> {
  await post('/api/artifacts', { taskId, ...artifact });
}

async function uploadToVault(taskId: string, filename: string, content: string): Promise<void> {
  await post(`/api/vault/${taskId}`, { filename, content, encoding: 'utf8' });
}

async function createWorktree(taskId: string): Promise<void> {
  await post(`/api/worktrees/${encodeURIComponent(taskId)}`, {});
}

async function writeWorktreeFile(taskId: string, filename: string, content: string): Promise<void> {
  await post(`/api/worktrees/${encodeURIComponent(taskId)}/files`, { filename, content });
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) throw new Error(`${response.status} ${payload.code}: ${payload.error}`);
  return payload.data;
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function log(scope: string, message: string) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${stamp}] [${scope}] ${message}`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
