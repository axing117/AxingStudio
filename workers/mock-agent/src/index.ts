import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  ArtifactType,
  ExecutorCapability,
  ExecutorType,
  TaskStatus,
  type ApiResponse,
  type ArtifactType as ArtifactTypeValue,
  type ClaimResponse,
  type Executor,
  type ExecutorCapability as ExecutorCapabilityValue,
  type Task,
} from '@axing/shared';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const API_URL = trimTrailingSlash(process.env.API_URL || 'http://localhost:3001');
const POLL_MS = numberEnv('POLL_MS', 2_500);
const EXECUTOR_HEARTBEAT_MS = numberEnv('EXECUTOR_HEARTBEAT_MS', 8_000);
const TASK_HEARTBEAT_MS = numberEnv('TASK_HEARTBEAT_MS', 10_000);
const CLAUDE_PATH = process.env.CLAUDE_PATH || 'C:\\Users\\rochelimit\\.local\\bin\\claude.exe';
const CLAUDE_TIMEOUT_MS = numberEnv('CLAUDE_TIMEOUT_MS', 120_000);

// Capability -> task type mapping: which task roles this executor handles
const TASK_ROLE_BY_CAP: Partial<Record<ExecutorCapabilityValue, string>> = {
  [ExecutorCapability.OraclePlan]: 'oracle',
  [ExecutorCapability.OracleReview]: 'oracle',
  [ExecutorCapability.ForgeImplement]: 'forge',
  [ExecutorCapability.ForgeReview]: 'forge',
  [ExecutorCapability.ForgeVerify]: 'forge',
  [ExecutorCapability.DocGenerate]: 'oracle',
};

/* ------------------------------------------------------------------ */
/*  CLI 检测                                                           */
/* ------------------------------------------------------------------ */
function detectCapabilities(): ExecutorCapabilityValue[] {
  if (!existsSync(CLAUDE_PATH)) {
    log('system', `claude.exe not found at ${CLAUDE_PATH}`);
    return [];
  }

  // Claude Code can plan, review, and generate docs
  return [
    ExecutorCapability.OraclePlan,
    ExecutorCapability.OracleReview,
    ExecutorCapability.ForgeReview,
    ExecutorCapability.DocGenerate,
  ];
}

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */
async function main() {
  log('system', `API: ${API_URL}`);
  log('system', `Claude CLI: ${existsSync(CLAUDE_PATH) ? CLAUDE_PATH : 'NOT FOUND'}`);

  const capabilities = detectCapabilities();

  if (capabilities.length === 0) {
    log('system', 'No local executors available. Install Claude Code CLI to enable local agents.');
    log('system', 'Download: https://claude.ai/code');
    return;
  }

  log('system', `Capabilities: ${capabilities.join(', ')}`);
  await runExecutor(capabilities);
}

/* ------------------------------------------------------------------ */
/*  Executor 生命周期                                                    */
/* ------------------------------------------------------------------ */
async function runExecutor(capabilities: ExecutorCapabilityValue[]) {
  const executor = await registerWithRetry(capabilities);

  const heartbeatTimer = setInterval(() => {
    heartbeatExecutor(executor.id).catch((error) =>
      log('executor', `heartbeat failed: ${formatError(error)}`)
    );
  }, EXECUTOR_HEARTBEAT_MS);

  log('executor', `registered ${executor.name} (${executor.id})`);

  // Build set of task types we can handle
  const handledTypes = new Set(
    capabilities
      .filter((c): c is keyof typeof TASK_ROLE_BY_CAP => c in TASK_ROLE_BY_CAP)
      .map((c) => TASK_ROLE_BY_CAP[c])
  );

  while (true) {
    try {
      await heartbeatExecutor(executor.id);
      const queuedTasks = await getTasks(TaskStatus.Queued);
      // Pick first task matching our capabilities
      const task = queuedTasks.find((t) => handledTypes.has(t.type));

      if (!task) {
        await sleep(POLL_MS);
        continue;
      }

      const claim = await claimTask(task.id, executor.id);
      log('executor', `claimed ${task.title} (${task.id}), role=${task.type}, lease=${claim.leaseExpiresAt}`);
      await executeTask(executor, claim.task);
    } catch (error) {
      log('executor', `loop warning: ${formatError(error)}`);
      await sleep(POLL_MS);
    }
  }

  clearInterval(heartbeatTimer);
}

async function registerWithRetry(capabilities: ExecutorCapabilityValue[]): Promise<Executor> {
  while (true) {
    try {
      return await post<Executor>('/api/executors/register', {
        name: 'Claude Code Executor',
        type: ExecutorType.ClaudeCode,
        capabilities,
      });
    } catch (error) {
      log('executor', `waiting for API: ${formatError(error)}`);
      await sleep(3_000);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  任务执行                                                            */
/* ------------------------------------------------------------------ */
async function executeTask(executor: Executor, task: Task) {
  let taskHeartbeatFailed = false;
  const taskHeartbeatTimer = setInterval(() => {
    heartbeatTask(task.id, executor.id).catch((error) => {
      taskHeartbeatFailed = true;
      log('executor', `task heartbeat stopped: ${formatError(error)}`);
    });
  }, TASK_HEARTBEAT_MS);

  try {
    const result = await executeRealTask(task);

    if (taskHeartbeatFailed) {
      throw new Error('lease was lost before completion');
    }

    await uploadToVault(task.id, result.filename, result.fileContent);
    await createArtifact(task.id, result.artifact);
    await completeTask(task.id, result.output);
    log('executor', `completed ${task.title}, vault/${task.id}/${result.filename}`);
  } catch (error) {
    log('executor', `task failed: ${formatError(error)}`);
    try {
      await failTask(task.id, formatError(error));
    } catch (e) {
      log('executor', `failTask API error: ${formatError(e)}`);
    }
  } finally {
    clearInterval(taskHeartbeatTimer);
  }
}

/* ------------------------------------------------------------------ */
/*  真实 Claude CLI 执行                                                */
/* ------------------------------------------------------------------ */
function buildResult(task: Task, rawOutput: string) {
  const stamp = new Date().toISOString();
  const fileSafeStamp = stamp.replace(/[:.]/g, '-');
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;

  if (task.type === 'oracle') {
    const filename = `oracle-${fileSafeStamp}.md`;
    return {
      filename,
      fileContent: rawOutput,
      artifact: {
        type: ArtifactType.Text,
        name: `Oracle — ${task.title}`,
        path: `vault/${task.id}/${filename}`,
        metadata: { role: 'strategy', brief, generatedAt: stamp, source: 'claude-code' },
      },
      output: {
        summary: `策略拆解完成：${brief}`,
        nextStep: '交给 Forge 或 Hermes 继续执行',
        artifactPath: `vault/${task.id}/${filename}`,
        worker: 'claude-code-executor',
        completedAt: stamp,
      },
    };
  }

  // forge — extract code block
  const codeMatch = rawOutput.match(/```(?:typescript|ts)\n([\s\S]*?)```/);
  const fileContent = codeMatch ? codeMatch[1] : rawOutput;
  const filename = `forge-${fileSafeStamp}.ts`;

  return {
    filename,
    fileContent,
    artifact: {
      type: ArtifactType.Code,
      name: `Forge — ${task.title}`,
      path: `vault/${task.id}/${filename}`,
      metadata: { role: 'engineering', generatedAt: stamp, source: 'claude-code' },
    },
    output: {
      summary: `工程执行完成：${brief}`,
      checks: ['claude-code-generated'],
      artifactPath: `vault/${task.id}/${filename}`,
      worker: 'claude-code-executor',
      completedAt: stamp,
    },
  };
}

async function executeRealTask(task: Task) {
  const prompt = buildPrompt(task);
  log('executor', `spawning Claude Code CLI...`);
  const { stdout, stderr, exitCode } = await spawnClaude(prompt, CLAUDE_TIMEOUT_MS);

  if (exitCode !== 0) {
    throw new Error(`Claude exit ${exitCode}: ${stderr.slice(0, 300)}`);
  }

  const output = stdout.trim();
  if (!output) {
    throw new Error('Claude returned empty output');
  }

  return buildResult(task, output);
}

function spawnClaude(
  prompt: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_PATH, ['-p', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
    child.on('error', (err) => reject(err));
  });
}

function buildPrompt(task: Task): string {
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;

  if (task.type === 'oracle') {
    return `你是一个多智能体工坊"阿星工坊"的策略分析师（Oracle 角色）。
你的职责：将用户需求拆解为结构化任务列表，分配给工程室(Forge)和媒体室(Hermes)。

请分析以下需求，输出一份 Markdown 格式的策略文档：

## 需求
${brief}

## 输出要求
1. **需求概述**：一句话总结核心目标
2. **任务拆解**：列出 3-5 个可执行子任务表格（序号/任务/类型/优先级），类型填 forge 或 hermes
3. **风险提示**：点出关键风险点
4. **建议下一步**：nextStep 字段，建议接下来交给哪个角色`;
  }

  return `你是一个多智能体工坊"阿星工坊"的工程师（Forge 角色）。
你的职责：根据任务规格编写可执行的 TypeScript 代码。

请根据以下任务规格生成实现代码：

## 任务
${brief}

## 输出要求
1. 完整的 TypeScript 模块，包含类型定义和主函数
2. 代码整洁、可直接运行
3. 底部包含 smoke test（if (require.main === module) 块）
4. 输出纯代码，不要额外的解释文字`;
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
  artifact: { type: ArtifactTypeValue; name: string; path: string; metadata: Record<string, unknown> },
): Promise<void> {
  await post('/api/artifacts', { taskId, ...artifact });
}

async function uploadToVault(taskId: string, filename: string, content: string): Promise<void> {
  await post(`/api/vault/${taskId}`, { filename, content, encoding: 'utf8' });
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
