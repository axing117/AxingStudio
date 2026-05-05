import type { FastifyInstance } from 'fastify';
import * as agentSvc from '../services/agentService.js';
import * as eventSvc from '../services/eventService.js';
import { EventType, ErrorCode } from '@axing/shared';
import type { RegisterAgentRequest } from '@axing/shared';

export function agentRoutes(app: FastifyInstance): void {
  // POST /api/agents/register
  app.post('/api/agents/register', async (req, reply) => {
    const body = req.body as RegisterAgentRequest;
    if (!body.name || !body.type) {
      return reply.status(400).send({ ok: false, error: 'Missing required fields: name, type', code: ErrorCode.ValidationError });
    }
    const agent = agentSvc.registerAgent(body);
    eventSvc.recordEvent(EventType.AgentRegistered, undefined, agent.id, { name: agent.name, type: agent.type });
    return reply.status(201).send({ ok: true, data: agent });
  });

  // GET /api/agents — list all agents
  app.get('/api/agents', async () => {
    const agents = agentSvc.listAgents();
    return { ok: true, data: agents };
  });

  // GET /api/agents/:id — get single agent
  app.get('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = agentSvc.getAgent(id);
    if (!agent) return reply.status(404).send({ ok: false, error: 'Agent not found', code: ErrorCode.AgentNotFound });
    return { ok: true, data: agent };
  });

  // POST /api/agents/:id/heartbeat — agent health ping (only log on status transition)
  app.post('/api/agents/:id/heartbeat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = agentSvc.getAgent(id);
    if (!prev) return reply.status(404).send({ ok: false, error: 'Agent not found', code: ErrorCode.AgentNotFound });
    agentSvc.updateHeartbeat(id);
    if (prev.status === 'offline') {
      eventSvc.recordEvent(EventType.AgentOnline, undefined, id, { name: prev.name });
    }
    return { ok: true, data: { ok: true } };
  });
}
