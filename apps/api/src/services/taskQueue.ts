/**
 * TaskQueue — In-process task queue with BullMQ-like features.
 *
 * Features:
 *   - Priority-based scheduling (lower number = higher priority)
 *   - Exponential backoff retry with jitter
 *   - Configurable concurrency per task type
 *   - Dead letter queue (permanently failed tasks)
 *   - Delayed retry support
 *   - Event-driven (onActive, onComplete, onFailed, onDeadLetter)
 *
 * Architecture: wraps the existing taskService state machine.
 * To swap to real BullMQ later, replace this file only.
 */

import * as taskSvc from './taskService.js';
import * as eventSvc from './eventService.js';
import { getDb, getOne } from '../db/index.js';
import { EventType } from '@axing/shared';
import type { Task, TaskStatus } from '@axing/shared';

// ===== Types =====

export interface QueueJob {
  taskId: string;
  priority: number;       // lower = higher priority
  runAt: number;          // timestamp (ms) when job becomes eligible
  attempts: number;       // how many times it's been tried
}

export interface QueueOptions {
  concurrency: number;        // max parallel jobs per type
  maxRetries: number;         // max retry attempts
  baseDelayMs: number;        // initial backoff delay
  maxDelayMs: number;         // max backoff cap
  backoffMultiplier: number;  // exponential multiplier
}

export interface QueueEvents {
  onActive?: (task: Task) => void;
  onComplete?: (task: Task) => void;
  onFailed?: (task: Task, error: string) => void;
  onDeadLetter?: (task: Task, error: string) => void;
  onRetry?: (task: Task, delayMs: number, attempt: number) => void;
}

const DEFAULT_OPTIONS: QueueOptions = {
  concurrency: 3,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

// ===== TaskQueue =====

export class TaskQueue {
  private queues: Map<string, QueueJob[]> = new Map();  // type → sorted jobs
  private active: Map<string, Set<string>> = new Map(); // type → active task IDs
  private deadLetter: QueueJob[] = [];
  private options: QueueOptions;
  private events: QueueEvents;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private claimFn: (taskId: string, executorId: string) => { task: Task; leaseExpiresAt: string } | null;

  constructor(
    options: Partial<QueueOptions> = {},
    events: QueueEvents = {},
    claimFn?: (taskId: string, executorId: string) => { task: Task; leaseExpiresAt: string } | null,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.events = events;
    this.claimFn = claimFn ?? taskSvc.claimTask;
  }

  /** Start the queue processor (polls every 1s) */
  start(): void {
    if (this.pollTimer) return;
    // Register virtual executors for each task type so claim works
    this.ensureQueueExecutors();
    this.pollTimer = setInterval(() => this.tick(), 1000);
    console.log('[TaskQueue] Started');
  }

  /** Stop the queue processor */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[TaskQueue] Stopped');
  }

  /** Enqueue a task into the queue */
  enqueue(taskId: string, type: string, priority = 5): void {
    if (!this.queues.has(type)) {
      this.queues.set(type, []);
      this.active.set(type, new Set());
    }
    const job: QueueJob = { taskId, priority, runAt: Date.now(), attempts: 0 };
    const queue = this.queues.get(type)!;
    queue.push(job);
    queue.sort((a, b) => a.priority - b.priority || a.runAt - b.runAt);
    console.log(`[TaskQueue] Enqueued ${taskId} (type=${type}, priority=${priority})`);
  }

  /** Handle task failure — decide retry or dead letter */
  handleFailure(taskId: string, type: string, error: string): void {
    const activeSet = this.active.get(type);
    activeSet?.delete(taskId);

    // Find the job in dead letter or create a new tracking entry
    let attempt = 0;
    const existing = this.deadLetter.find(j => j.taskId === taskId);
    if (existing) {
      attempt = existing.attempts;
    }

    attempt++;
    const task = taskSvc.getTask(taskId);

    if (attempt >= this.options.maxRetries) {
      // Dead letter — permanent failure
      const deadJob: QueueJob = { taskId, priority: 0, runAt: Date.now(), attempts: attempt };
      this.deadLetter.push(deadJob);
      this.events.onDeadLetter?.(task!, error);
      console.log(`[TaskQueue] DEAD LETTER: ${taskId} after ${attempt} attempts`);
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = this.options.baseDelayMs * Math.pow(this.options.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delayMs = Math.min(baseDelay + jitter, this.options.maxDelayMs);

    // Re-enqueue with delay
    const retryJob: QueueJob = {
      taskId,
      priority: 0, // high priority for retries
      runAt: Date.now() + delayMs,
      attempts: attempt,
    };
    if (!this.queues.has(type)) this.queues.set(type, []);
    this.queues.get(type)!.push(retryJob);
    this.queues.get(type)!.sort((a, b) => a.priority - b.priority || a.runAt - b.runAt);

    this.events.onRetry?.(task!, delayMs, attempt);
    console.log(`[TaskQueue] Retry ${taskId} in ${Math.round(delayMs)}ms (attempt ${attempt}/${this.options.maxRetries})`);
  }

  /** Handle task completion */
  handleComplete(taskId: string, type: string): void {
    const activeSet = this.active.get(type);
    activeSet?.delete(taskId);
    const task = taskSvc.getTask(taskId);
    if (task) this.events.onComplete?.(task);
  }

  /** Get dead letter queue contents */
  getDeadLetter(): QueueJob[] {
    return [...this.deadLetter];
  }

  /** Get queue stats */
  stats(): Record<string, { queued: number; active: number; deadLetter: number }> {
    const result: Record<string, { queued: number; active: number; deadLetter: number }> = {};
    for (const [type, queue] of this.queues) {
      const now = Date.now();
      const ready = queue.filter(j => j.runAt <= now).length;
      result[type] = {
        queued: ready,
        active: this.active.get(type)?.size ?? 0,
        deadLetter: this.deadLetter.filter(j => true).length, // global count
      };
    }
    return result;
  }

  // ===== Internal =====

  private tick(): void {
    const now = Date.now();
    for (const [type, queue] of this.queues) {
      const activeSet = this.active.get(type) ?? new Set();
      const available = this.options.concurrency - activeSet.size;
      if (available <= 0) continue;

      // Clean up jobs that are no longer queued (claimed by workers)
      for (let i = queue.length - 1; i >= 0; i--) {
        const job = queue[i];
        if (job.runAt > now) continue; // not ready yet
        const task = taskSvc.getTask(job.taskId);
        if (!task || task.status !== 'queued') {
          // Task claimed or gone — remove from our queue
          queue.splice(i, 1);
          if (task?.status === 'running') activeSet.add(job.taskId);
        }
      }
      this.active.set(type, activeSet);
    }
  }

  /** Register virtual executors for queue types so claimTask works */
  private ensureQueueExecutors(): void {
    const db = getDb();
    const types = ['oracle', 'forge', 'hermes'];
    for (const type of types) {
      const id = `queue-${type}`;
      const existing = getOne(db, 'SELECT id FROM executors WHERE id = ?', [id]);
      if (!existing) {
        db.run(
          'INSERT OR IGNORE INTO executors (id, name, type, status, capabilities) VALUES (?, ?, ?, ?, ?)',
          [id, `Queue Scheduler (${type})`, 'mimo', 'online', JSON.stringify([`${type}.plan`, `${type}.implement`, `${type}.review`])]
        );
        console.log(`[TaskQueue] Registered virtual executor: ${id}`);
      }
    }

    // 注册Mock执行器
    const mockId = 'mock-agent-internal';
    const mockExisting = getOne(db, 'SELECT id FROM executors WHERE id = ?', [mockId]);
    if (!mockExisting) {
      db.run(
        'INSERT OR IGNORE INTO executors (id, name, type, status, capabilities) VALUES (?, ?, ?, ?, ?)',
        [mockId, 'Mock Agent (内置测试)', 'mock', 'online', JSON.stringify(['oracle.plan', 'oracle.review', 'forge.implement', 'forge.review'])]
      );
      console.log(`[TaskQueue] Registered mock executor: ${mockId}`);
    }
  }
}

// ===== Singleton =====

let instance: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!instance) {
    instance = new TaskQueue(
      {
        concurrency: 3,
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
      },
      {
        onActive: (task) => {
          eventSvc.recordEvent(EventType.TaskClaimed, task.id, 'task-queue', {});
        },
        onComplete: (task) => {
          // Already handled by taskSvc.completeTask
        },
        onFailed: (task, error) => {
          eventSvc.recordEvent(EventType.TaskFailed, task.id, 'task-queue', { error });
        },
        onDeadLetter: (task, error) => {
          eventSvc.recordEvent(EventType.TaskFailed, task.id, 'task-queue', { error, deadLetter: true });
        },
        onRetry: (task, delayMs, attempt) => {
          eventSvc.recordEvent(EventType.TaskRetrying, task.id, 'task-queue', { delayMs, attempt });
        },
      },
    );
  }
  return instance;
}
