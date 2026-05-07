import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentType,
  ArtifactType,
  TaskStatus,
  type Agent,
  type ApiResponse,
  type ArtifactType as ArtifactTypeValue,
  type ClaimResponse,
  type Task,
} from '@axing/shared';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const API_URL = trimTrailingSlash(process.env.API_URL || 'http://localhost:3001');
const POLL_MS = numberEnv('POLL_MS', 2_500);
const AGENT_HEARTBEAT_MS = numberEnv('AGENT_HEARTBEAT_MS', 8_000);
const TASK_HEARTBEAT_MS = numberEnv('TASK_HEARTBEAT_MS', 10_000);
const WORK_MIN_MS = numberEnv('WORK_MIN_MS', 4_000);
const WORK_MAX_MS = numberEnv('WORK_MAX_MS', 9_000);
const FAILURE_RATE = Math.max(0, Math.min(1, Number(process.env.FAILURE_RATE ?? '0')));

const runnableTypes = [AgentType.Oracle, AgentType.Forge, AgentType.Hermes] as const;
type RunnableAgentType = (typeof runnableTypes)[number];

async function main() {
  const selectedTypes = parseAgentTypes(process.env.AGENT_TYPE);
  log('system', `Mock agents connecting to ${API_URL}`);
  log('system', `Enabled types: ${selectedTypes.join(', ')}`);

  await Promise.all(selectedTypes.map((type) => runAgent(type)));
}

async function runAgent(type: RunnableAgentType) {
  const agent = await registerWithRetry(type);
  const heartbeatTimer = setInterval(() => {
    heartbeatAgent(agent.id).catch((error) => log(type, `agent heartbeat failed: ${formatError(error)}`));
  }, AGENT_HEARTBEAT_MS);

  log(type, `registered ${agent.name} (${agent.id})`);

  while (true) {
    try {
      await heartbeatAgent(agent.id);
      const queuedTasks = await getTasks(TaskStatus.Queued);
      const task = queuedTasks.find((item) => item.type === type);

      if (!task) {
        await sleep(POLL_MS);
        continue;
      }

      const claim = await claimTask(task.id, agent.id);
      log(type, `claimed ${task.title} (${task.id}), lease ${claim.leaseExpiresAt}`);
      await executeTask(type, agent, claim.task);
    } catch (error) {
      log(type, `loop warning: ${formatError(error)}`);
      await sleep(POLL_MS);
    }
  }

  clearInterval(heartbeatTimer);
}

async function registerWithRetry(type: RunnableAgentType): Promise<Agent> {
  while (true) {
    try {
      return await post<Agent>('/api/agents/register', {
        name: process.env.AGENT_NAME || defaultAgentName(type),
        type,
      });
    } catch (error) {
      log(type, `waiting for API: ${formatError(error)}`);
      await sleep(3_000);
    }
  }
}

async function executeTask(type: RunnableAgentType, agent: Agent, task: Task) {
  let taskHeartbeatFailed = false;
  const taskHeartbeatTimer = setInterval(() => {
    heartbeatTask(task.id, agent.id).catch((error) => {
      taskHeartbeatFailed = true;
      log(type, `task heartbeat stopped: ${formatError(error)}`);
    });
  }, TASK_HEARTBEAT_MS);

  try {
    // Forge agents create an isolated worktree
    let worktreePath = '';
    if (type === AgentType.Forge) {
      const wt = await createWorktree(task.id);
      if (wt.path) {
        worktreePath = wt.path;
        log(type, `worktree created: ${wt.path} (branch: ${wt.branch})`);
      }
    }

    const duration = randomBetween(WORK_MIN_MS, WORK_MAX_MS);
    log(type, `working ${duration}ms on ${task.title}`);
    await sleep(duration);

    if (taskHeartbeatFailed) {
      throw new Error('lease was lost before completion');
    }

    if (Math.random() < FAILURE_RATE) {
      await failTask(task.id, simulatedFailure(type));
      log(type, `failed ${task.title}`);
      return;
    }

    const result = buildMockResult(type, task);
    await uploadToVault(task.id, result.filename, result.fileContent);

    // If worktree exists, also write the file there
    if (worktreePath) {
      try {
        writeFileSync(join(worktreePath, result.filename), result.fileContent);
        log(type, `wrote to worktree: ${result.filename}`);
      } catch (e) {
        log(type, `worktree write failed: ${formatError(e)}`);
      }
    }

    await createArtifact(task.id, result.artifact);
    await completeTask(task.id, result.output);
    log(type, `completed ${task.title}, vault/${task.id}/${result.filename}`);
  } finally {
    clearInterval(taskHeartbeatTimer);
  }
}

function buildMockResult(type: RunnableAgentType, task: Task): {
  filename: string;
  fileContent: string;
  artifact: {
    type: ArtifactTypeValue;
    name: string;
    path: string;
    metadata: Record<string, unknown>;
  };
  output: Record<string, unknown>;
} {
  const stamp = new Date().toISOString();
  const fileSafeStamp = stamp.replace(/[:.]/g, '-');
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;

  if (type === AgentType.Oracle) {
    const filename = `oracle-${fileSafeStamp}.md`;
    const fileContent = [
      `# ${task.title}`,
      '',
      `> 生成时间: ${stamp}`,
      `> 来源: Oracle Mock Strategy`,
      '',
      '## 需求拆解',
      '',
      `**原始需求**: ${brief}`,
      '',
      '## 结构化任务列表',
      '',
      '| 序号 | 任务 | 类型 | 优先级 |',
      '|------|------|------|--------|',
      '| 1 | 接口定义与类型校验 | forge | P0 |',
      '| 2 | 数据模型设计 | forge | P0 |',
      '| 3 | 单元测试草稿 | forge | P1 |',
      '| 4 | 预览视频脚本 | hermes | P1 |',
      '| 5 | README 文档更新 | forge | P2 |',
      '',
      '## 风险提示',
      '',
      '- 输入数据未经过校验，需要上游确认 schema',
      '- 视频资源需要提前准备素材',
      '',
      '---',
      '_由阿星工坊 Oracle 策略室自动生成_',
    ].join('\n');

    return {
      filename,
      fileContent,
      artifact: {
        type: ArtifactType.Text,
        name: `Oracle brief - ${task.title}`,
        path: `vault/${task.id}/${filename}`,
        metadata: { role: 'strategy', brief, generatedAt: stamp },
      },
      output: {
        summary: `已完成策略拆解：${brief}`,
        nextStep: '交给 Forge 或 Hermes 继续执行',
        artifactPath: `vault/${task.id}/${filename}`,
        worker: 'oracle-mock',
        completedAt: stamp,
      },
    };
  }

  if (type === AgentType.Forge) {
    const filename = `forge-${fileSafeStamp}.ts`;
    const lines = randomBetween(24, 60);
    const fileContent = [
      `// ${task.title}`,
      `// Generated by Forge Mock Engineer @ ${stamp}`,
      `// Source: Axing Studio V2`,
      '',
      `export interface TaskSpec {`,
      `  id: string;`,
      `  title: string;`,
      `  type: 'oracle' | 'forge' | 'hermes';`,
      `  input: Record<string, unknown>;`,
      `  status: 'blocked' | 'queued' | 'running' | 'completed' | 'failed' | 'retrying';`,
      `}`,
      '',
      `export function validateTaskSpec(input: unknown): input is TaskSpec {`,
      `  if (typeof input !== 'object' || input === null) return false;`,
      `  const t = input as Record<string, unknown>;`,
      `  return typeof t.id === 'string'`,
      `    && typeof t.title === 'string'`,
      `    && ['oracle','forge','hermes'].includes(t.type as string)`,
      `    && typeof t.input === 'object';`,
      `}`,
      '',
      `export function parseInput(raw: string): Record<string, unknown> {`,
      `  try { return JSON.parse(raw); } catch { return {}; }`,
      `}`,
      '',
      `// Smoke test (run: npx tsx this-file.ts)`,
      `if (typeof require !== 'undefined' && require.main === module) {`,
      `  console.log(validateTaskSpec({`,
      `    id: 'test-1',`,
      `    title: '${brief.replace(/'/g, "\\'")}',`,
      `    type: 'forge',`,
      `    input: {},`,
      `    status: 'queued',`,
      `  }) ? 'PASS' : 'FAIL');`,
      `}`,
      '',
    ].join('\n');

    return {
      filename,
      fileContent,
      artifact: {
        type: ArtifactType.Code,
        name: `Forge module - ${task.title}`,
        path: `vault/${task.id}/${filename}`,
        metadata: { role: 'engineering', linesChanged: lines, generatedAt: stamp },
      },
      output: {
        summary: `已生成工程模块草稿：${brief}`,
        checks: ['type-shape', 'mock-build', 'readme-note'],
        artifactPath: `vault/${task.id}/${filename}`,
        worker: 'forge-mock',
        completedAt: stamp,
      },
    };
  }

  const filename = `hermes-${fileSafeStamp}.json`;
  const fileContent = JSON.stringify({
    title: task.title,
    type: 'video-preview',
    durationSec: randomBetween(8, 18),
    generatedAt: stamp,
    worker: 'hermes-mock',
    scenes: [
      { index: 0, type: 'title-card', text: brief, durationSec: 3 },
      { index: 1, type: 'transition', effect: 'fade', durationSec: 1 },
      { index: 2, type: 'content', text: '阿星工坊 AI 媒体室自动生成', durationSec: 5 },
      { index: 3, type: 'end-card', text: 'Axing Studio V2', durationSec: 3 },
    ],
  }, null, 2);

  return {
    filename,
    fileContent,
    artifact: {
      type: ArtifactType.Video,
      name: `Hermes preview - ${task.title}`,
      path: `vault/${task.id}/${filename}`,
      metadata: { role: 'media', durationSec: randomBetween(8, 18), generatedAt: stamp },
    },
    output: {
      summary: `已生成媒体预览占位：${brief}`,
      previewMode: 'mock-video',
      artifactPath: `vault/${task.id}/${filename}`,
      worker: 'hermes-mock',
      completedAt: stamp,
    },
  };
}

async function getTasks(status: Task['status']): Promise<Task[]> {
  return get<Task[]>(`/api/tasks?status=${status}`);
}

async function heartbeatAgent(agentId: string): Promise<void> {
  await post<{ ok: boolean }>(`/api/agents/${agentId}/heartbeat`, {});
}

async function claimTask(taskId: string, agentId: string): Promise<ClaimResponse> {
  return post<ClaimResponse>(`/api/tasks/${taskId}/claim`, { agentId });
}

async function heartbeatTask(taskId: string, agentId: string): Promise<void> {
  await post<{ ok: boolean; leaseExpiresAt: string }>(`/api/tasks/${taskId}/heartbeat`, { agentId });
}

async function completeTask(taskId: string, output: Record<string, unknown>): Promise<Task> {
  return post<Task>(`/api/tasks/${taskId}/complete`, { output });
}

async function failTask(taskId: string, error: string): Promise<Task> {
  return post<Task>(`/api/tasks/${taskId}/fail`, { error });
}

async function createWorktree(taskId: string): Promise<{ path: string; branch: string }> {
  try {
    return await post<{ path: string; branch: string }>(`/api/worktrees/${taskId}`, {});
  } catch {
    // Worktree creation is optional — agent can still work without it
    return { path: '', branch: 'none' };
  }
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
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) {
    throw new Error(`${response.status} ${payload.code}: ${payload.error}`);
  }
  return payload.data;
}

function parseAgentTypes(value?: string): RunnableAgentType[] {
  if (!value || value === 'all') return [...runnableTypes];

  const selected = value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is RunnableAgentType => runnableTypes.includes(item as RunnableAgentType));

  return selected.length > 0 ? selected : [...runnableTypes];
}

function defaultAgentName(type: RunnableAgentType): string {
  const names: Record<RunnableAgentType, string> = {
    [AgentType.Oracle]: 'Oracle Mock Strategy',
    [AgentType.Forge]: 'Forge Mock Engineer',
    [AgentType.Hermes]: 'Hermes Mock Media',
  };
  return names[type];
}

function simulatedFailure(type: RunnableAgentType): string {
  const reasons: Record<RunnableAgentType, string> = {
    [AgentType.Oracle]: 'mock strategy confidence below threshold',
    [AgentType.Forge]: 'mock build check failed',
    [AgentType.Hermes]: 'mock render timeout',
  };
  return reasons[type];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
