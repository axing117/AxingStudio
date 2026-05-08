import type { FastifyInstance } from 'fastify';
import * as taskSvc from '../services/taskService.js';
import type { Task } from '@axing/shared';

/**
 * GET /api/workflows/:rootTaskId/graph
 *
 * Returns a DAG graph representation of a workflow.
 * Traverses tasks linked by depends_on to build nodes + edges.
 */
export function workflowRoutes(app: FastifyInstance): void {
  app.get('/api/workflows/:rootTaskId/graph', async (req, reply) => {
    const { rootTaskId } = req.params as { rootTaskId: string };
    const rootTask = taskSvc.getTask(rootTaskId);
    if (!rootTask) return reply.status(404).send({ ok: false, error: 'Task not found' });

    // BFS to collect all tasks in the workflow
    const visited = new Set<string>();
    const tasks: Task[] = [];
    const queue = [rootTaskId];

    // Also search backwards: find tasks that depend on the root
    // And forwards: find tasks the root depends on
    const allTasks = taskSvc.listTasks();
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    // Build adjacency from depends_on
    const childrenOf = new Map<string, string[]>(); // taskId → tasks that depend on it
    for (const t of allTasks) {
      if (t.dependsOn) {
        for (const depId of t.dependsOn) {
          if (!childrenOf.has(depId)) childrenOf.set(depId, []);
          childrenOf.get(depId)!.push(t.id);
        }
      }
    }

    // Find the workflow root: walk up from rootTaskId through depends_on
    let startId = rootTaskId;
    const visitedUp = new Set<string>();
    while (true) {
      const t = taskMap.get(startId);
      if (!t?.dependsOn?.length) break;
      const parentId = t.dependsOn[0]; // follow first dependency up
      if (visitedUp.has(parentId)) break;
      visitedUp.add(parentId);
      startId = parentId;
    }

    // BFS down from the root
    const bfsQueue = [startId];
    const workflowTasks: Task[] = [];
    const workflowIds = new Set<string>();
    while (bfsQueue.length > 0) {
      const id = bfsQueue.shift()!;
      if (workflowIds.has(id)) continue;
      const t = taskMap.get(id);
      if (!t) continue;
      workflowIds.add(id);
      workflowTasks.push(t);
      const children = childrenOf.get(id) || [];
      bfsQueue.push(...children);
    }

    // Build graph nodes and edges
    const nodes = workflowTasks.map(t => ({
      id: t.id,
      label: t.title,
      type: t.type,
      status: t.status,
      retryCount: t.retryCount,
    }));

    const edges: { from: string; to: string }[] = [];
    for (const t of workflowTasks) {
      if (t.dependsOn) {
        for (const depId of t.dependsOn) {
          if (workflowIds.has(depId)) {
            edges.push({ from: depId, to: t.id });
          }
        }
      }
    }

    return { ok: true, data: { nodes, edges, rootId: startId } };
  });
}
