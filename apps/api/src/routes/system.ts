import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { getDb, getAll } from '../db/index.js';

let prevIdle = 0;
let prevTotal = 0;

function sampleCpu(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }

  if (prevTotal === 0) {
    prevIdle = idle;
    prevTotal = total;
    return 0;
  }

  const idleDelta = idle - prevIdle;
  const totalDelta = total - prevTotal;
  prevIdle = idle;
  prevTotal = total;

  if (totalDelta <= 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

function sampleMemory(): number {
  return Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}

export function systemRoutes(app: FastifyInstance): void {
  app.get('/api/system/status', async () => {
    const cpu = sampleCpu();
    const memory = sampleMemory();
    const uptime = Math.floor(process.uptime());

    const agentRows = getAll(getDb(), 'SELECT status, COUNT(*) as cnt FROM agents GROUP BY status');
    let onlineAgents = 0;
    let totalAgents = 0;
    for (const row of agentRows) {
      const n = Number(row.cnt) || 0;
      totalAgents += n;
      if (String(row.status) === 'online') onlineAgents = n;
    }

    const taskRows = getAll(getDb(), 'SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status');
    let queuedTasks = 0;
    let runningTasks = 0;
    for (const row of taskRows) {
      const s = String(row.status);
      if (s === 'queued') queuedTasks = Number(row.cnt) || 0;
      if (s === 'running') runningTasks = Number(row.cnt) || 0;
    }

    return {
      ok: true,
      data: { cpu, memory, uptime, onlineAgents, totalAgents, queuedTasks, runningTasks },
    };
  });
}
