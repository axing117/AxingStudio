import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import * as taskSvc from '../services/taskService.js';
import * as executorSvc from '../services/executorService.js';
import { recordEvent } from '../services/eventService.js';
import { getDb } from '../db/index.js';
import { EventType } from '@axing/shared';

const CLAUDE_PATH = process.env.CLAUDE_PATH || `${process.env.USERPROFILE || process.env.HOME || '.'}\\.local\\bin\\claude.exe`;
const CLAUDE_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || '120000');

// Direct API config — bypasses CLI for lower latency
const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_MODEL = process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash';
const USE_DIRECT_API = !!API_KEY;

// Local LLM config — zero-latency, no API key needed
const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen2.5:7b';
const USE_LOCAL_LLM = process.env.USE_LOCAL_LLM === 'true' || (!!process.env.LOCAL_LLM_URL && !USE_DIRECT_API);


interface ChatBody {
  message: string;
  targetRoom?: string;
  mode?: 'chat' | 'workflow';
}

function parseRoom(message: string): string {
  const m = message.match(/@(oracle|forge|hermes|command)/i);
  return m ? m[1].toLowerCase() : 'command';
}

function systemPrompt(room: string): string {
  const base = '你是一个多智能体工坊"阿星工坊"的一员。用中文回复。保持简洁。';

  // 动态获取在线执行器的能力
  const onlineExecutors = executorSvc.listExecutors().filter(e => e.status === 'online' && e.type !== 'mock' && !e.id.startsWith('queue-'));
  const allExecutors = executorSvc.listExecutors().filter(e => e.type !== 'mock' && !e.id.startsWith('queue-'));
  const capabilities = new Set(onlineExecutors.flatMap(e => e.capabilities));

  const hasOracle = capabilities.has('oracle.plan') || capabilities.has('oracle.review');
  const hasForge = capabilities.has('forge.implement') || capabilities.has('forge.review');
  const hasHermes = capabilities.has('hermes.media');

  // 动态生成工作室列表
  const rooms: string[] = [];
  if (hasOracle) rooms.push('- @oracle (策略室): 需求分析、策略拆解');
  if (hasForge) rooms.push('- @forge (工程室): 代码生成、工程实施');
  if (hasHermes) rooms.push('- @hermes (媒体室): 图片生成、视频制作、媒体包装');

  const roomsList = rooms.length > 0 ? rooms.join('\n') : '- 当前无可用工作室，请先启动Agent';

  // 实际在线的 Executor 列表（只包含真实 Agent，不含 mock 和 queue）
  const onlineExecutorNames = onlineExecutors.map(e => e.name);
  const offlineExecutorNames = allExecutors.filter(e => e.status !== 'online').map(e => e.name);
  const actualExecutorInfo = onlineExecutorNames.length > 0
    ? `当前在线 Agent: ${onlineExecutorNames.join(', ')}`
    : '当前没有真实 Agent 在线（仅有内置 Mock 演示执行器）。';

  const prompts: Record<string, string> = {
    command: `${base}
你是运维指挥官。严格按以下实际状态回复，不要编造项目计划或假设的 Agent：

【实际运行状态】
${actualExecutorInfo}
${offlineExecutorNames.length > 0 ? `已注册但离线: ${offlineExecutorNames.join(', ')}` : ''}

【可用工作室】
${roomsList}

用户询问"接入了几个Agent/协作体/工作室"时，只能报告【实际运行状态】部分的在线 Agent。
不要提"计划"、"预留"、"代码里有"、"规划中"、"编译时"等任何推测或描述性内容。
不要提不在线的 Agent 名称（包括 Hermes、Sentinel 等），除非它们确实在线。
不知道就说不知道，就事论事报告当前实际数据。

当用户需求需要多个工作室协作时（比如"从零做一个系统"），
正常回复后，在末尾用以下格式建议创建工作流：

\`\`\`workflow
{
  "tasks": [
    { "type": "oracle", "title": "...", "input": { "brief": "..." } },
    { "type": "forge", "title": "...", "input": { "brief": "..." }, "dependsOnIndexes": [0] }
  ]
}
\`\`\`

简单问题直接回复，不需要 workflow 块。`,
    oracle: `${base}
你是策略分析师(Oracle)。负责需求拆解、数据分析、策略制定。
输出 Markdown 格式，包含任务拆解表格和风险提示。`,
    forge: `${base}
你是工程师(Forge)。负责代码生成和工程实施。
输出纯代码（TypeScript/JSON），不要额外解释。如果需要多文件，标注文件名。`,
    hermes: `${base}
你是媒体剪辑师(Hermes)。负责图片生成、视频脚本、媒体包装、预览生成。
输出 JSON 格式的场景描述，包含 type/durationSec/scenes 字段。`,
  };

  return prompts[room] || prompts.command;
}

function sseWrite(res: ServerResponse, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function spawnClaudeStream(
  prompt: string,
  res: ServerResponse,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_PATH, ['-p', prompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    const onAbort = () => { child.kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });

    // Write prompt to stdin as well (belt and suspenders)
    child.stdin.write(prompt);
    child.stdin.end();

    let full = '';
    let buffer = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      full += chunk;
      buffer += chunk;

      // Flush buffer as SSE text events (rough sentence-level streaming)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          sseWrite(res, 'text', { room: 'command', delta: line });
        }
      }
    });

    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      // Flush remaining buffer
      if (buffer.trim()) {
        sseWrite(res, 'text', { room: 'command', delta: buffer });
      }

      if (code !== 0 && code !== null) {
        reject(new Error(`Claude exit ${code}: ${stderr.slice(0, 200)}`));
      } else {
        resolve(full);
      }
    });

    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

async function apiChatStream(
  system: string,
  message: string,
  res: ServerResponse,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: API_MODEL,
        max_tokens: 4096,
        stream: true,
        system,
        messages: [{ role: 'user', content: message }],
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`API ${response.status}: ${await response.text().catch(() => 'unknown')}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    let textBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const ev = JSON.parse(dataStr);
            if (ev.type === 'content_block_delta' && ev.delta?.text) {
              full += ev.delta.text;
              textBuffer += ev.delta.text;

              // Flush per sentence or every ~40 chars for smooth streaming
              if (textBuffer.length > 40 || /[。！？\n]/.test(textBuffer)) {
                sseWrite(res, 'text', { room: 'command', delta: textBuffer.trim() });
                textBuffer = '';
              }
            } else if (ev.type === 'message_stop') {
              if (textBuffer.trim()) {
                sseWrite(res, 'text', { room: 'command', delta: textBuffer.trim() });
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return full;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function localChatStream(
  system: string,
  message: string,
  res: ServerResponse,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(`${LOCAL_LLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LOCAL_LLM_MODEL,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Local LLM ${response.status}: ${await response.text().catch(() => 'unknown')}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    let textBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const ev = JSON.parse(dataStr);
            const delta = ev.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              textBuffer += delta;
              if (textBuffer.length > 40 || /[。！？\n]/.test(textBuffer)) {
                sseWrite(res, 'text', { room: 'command', delta: textBuffer.trim() });
                textBuffer = '';
              }
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (textBuffer.trim()) {
      sseWrite(res, 'text', { room: 'command', delta: textBuffer.trim() });
    }

    return full;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

function parseWorkflow(raw: string): { tasks: Array<{ type: string; title: string; input: Record<string, unknown>; dependsOnIndexes?: number[] }> } | null {
  const m = raw.match(/```workflow\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed.tasks?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function chatRoutes(app: FastifyInstance): void {
  app.post('/api/chat', async (req, reply) => {
    const body = req.body as ChatBody;
    const message = body.message?.trim();
    if (!message) {
      return reply.status(400).send({ ok: false, error: 'message required' });
    }

    const room = body.targetRoom || parseRoom(message);
    const prompt = `${systemPrompt(room)}\n\n用户消息：${message}`;

    const res = reply.raw as ServerResponse;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':start\n\n');

    // Record chat event for LiveWorkshop
    recordEvent(EventType.TaskCreated, undefined, undefined, {
      title: message.slice(0, 80),
      type: room,
      chat: true,
    });

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    try {
      const sysPrompt = systemPrompt(room);
      let output: string;
      if (USE_LOCAL_LLM) {
        output = await localChatStream(sysPrompt, message, res, CLAUDE_TIMEOUT_MS, abortController.signal);
      } else if (USE_DIRECT_API) {
        output = await apiChatStream(sysPrompt, message, res, CLAUDE_TIMEOUT_MS, abortController.signal);
      } else {
        output = await spawnClaudeStream(prompt, res, CLAUDE_TIMEOUT_MS, abortController.signal);
      }

      // Check for workflow block
      const workflow = parseWorkflow(output);
      if (workflow && workflow.tasks?.length) {
        const createdIds: string[] = [];
        for (const spec of workflow.tasks) {
          const task = taskSvc.createTask({
            type: spec.type as 'oracle' | 'forge' | 'hermes',
            title: spec.title,
            input: spec.input,
            maxRetries: 3,
          });
          createdIds.push(task.id);
          recordEvent(EventType.TaskCreated, task.id, undefined, {
            title: task.title,
            type: task.type,
          });
          sseWrite(res, 'task.created', { taskId: task.id, type: task.type, title: task.title });
        }

        // Handle dependencies
        const blockedIds: string[] = [];
        for (let i = 0; i < workflow.tasks.length; i++) {
          const spec = workflow.tasks[i];
          if (spec.dependsOnIndexes?.length) {
            const dependsOnIds = spec.dependsOnIndexes
              .filter((idx: number) => idx >= 0 && idx < createdIds.length)
              .map((idx: number) => createdIds[idx]);
            if (dependsOnIds.length === 0) continue;
            getDb().run(
              'UPDATE tasks SET depends_on = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
              [JSON.stringify(dependsOnIds), 'blocked', createdIds[i]],
            );
            blockedIds.push(createdIds[i]);
          }
        }

        for (const id of blockedIds) {
          recordEvent(EventType.TaskBlocked, id, undefined, {});
        }

        // Enqueue non-blocked tasks into the queue
        const { getTaskQueue } = await import('../services/taskQueue.js');
        const queue = getTaskQueue();
        for (const id of createdIds) {
          if (!blockedIds.includes(id)) {
            const t = taskSvc.getTask(id);
            if (t?.status === 'queued') queue.enqueue(id, t.type);
          }
        }

        sseWrite(res, 'done', {
          summary: `已创建 ${createdIds.length} 个任务`,
          taskIds: createdIds,
        });
      } else {
        sseWrite(res, 'done', { summary: '对话完成' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sseWrite(res, 'error', { error: msg });
    }

    res.end();
  });
}
