/**
 * Mock Agent — 内置测试执行器
 * 仅在无真实 Agent 时作为 fallback 运行
 * 有真实 Agent 时自动禁用，避免与真 Worker 争抢任务
 */

import * as taskSvc from './taskService.js';
import * as eventSvc from './eventService.js';
import { EventType } from '@axing/shared';

const MOCK_EXECUTOR_ID = 'mock-agent-internal';
let isRunning = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** 启动Mock任务处理（仅在无外部 Agent 时生效） */
export function startMockProcessor(): void {
  if (isRunning) return;
  isRunning = true;

  console.log('[MockAgent] 启动Mock任务处理器（fallback 模式）');

  pollTimer = setInterval(async () => {
    try {
      await processNextTask();
    } catch (err) {
      console.error('[MockAgent] 处理任务失败:', err);
    }
  }, 2000);
}

/** 停止 Mock 处理器（当检测到真实 Agent 时调用） */
export function stopMockProcessor(): void {
  if (!isRunning) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isRunning = false;
  console.log('[MockAgent] 已停止（真实 Agent 已接管）');
}

/** 处理下一个任务 */
async function processNextTask(): Promise<void> {
  // 自动领取任务
  const result = taskSvc.claimNextTask(MOCK_EXECUTOR_ID, [
    'oracle.plan', 'oracle.review', 
    'forge.implement', 'forge.review'
  ]);
  
  if (!result) return;
  
  const { task } = result;
  console.log(`[MockAgent] 领取任务: ${task.title} (${task.type})`);
  
  // 模拟执行延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 生成模拟输出
  const output = generateMockOutput(task.type, task.title);
  
  // 完成任务
  taskSvc.completeTask(task.id, output);
  eventSvc.recordEvent(EventType.TaskCompleted, task.id, MOCK_EXECUTOR_ID, { output });
  
  console.log(`[MockAgent] 完成任务: ${task.title}`);
}

/** 生成模拟输出 */
function generateMockOutput(type: string, title: string): Record<string, unknown> {
  switch (type) {
    case 'oracle':
      return {
        summary: `策略分析完成: ${title}`,
        analysis: '这是一个模拟的策略分析结果。在实际环境中，Oracle Agent会进行详细的需求拆解和策略制定。',
        tasks: [
          { step: 1, description: '需求收集与分析' },
          { step: 2, description: '技术方案设计' },
          { step: 3, description: '风险评估' },
        ],
      };
    case 'forge':
      return {
        summary: `工程实现完成: ${title}`,
        code: '// 这是模拟的代码输出\nconsole.log("Hello from Forge Agent!");',
        files: ['src/index.ts', 'package.json'],
      };
    case 'hermes':
      return {
        summary: `媒体制作完成: ${title}`,
        assets: ['preview.png', 'video.mp4'],
        duration: '30s',
      };
    default:
      return {
        summary: `任务完成: ${title}`,
        message: '这是Mock Agent的模拟输出',
      };
  }
}
