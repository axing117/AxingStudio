// ===== Constants (also serve as runtime values) =====
export const TaskStatus = {
  Blocked: 'blocked',
  Queued: 'queued',
  Running: 'running',
  Completed: 'completed',
  Failed: 'failed',
  Retrying: 'retrying',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskType = {
  Oracle: 'oracle',
  Forge: 'forge',
  Hermes: 'hermes',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const AgentType = {
  Oracle: 'oracle',
  Forge: 'forge',
  Hermes: 'hermes',
  Sentinel: 'sentinel',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const AgentStatus = {
  Online: 'online',
  Offline: 'offline',
  Busy: 'busy',
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const EventType = {
  TaskCreated: 'task.created',
  TaskClaimed: 'task.claimed',
  TaskHeartbeat: 'task.heartbeat',
  TaskCompleted: 'task.completed',
  TaskFailed: 'task.failed',
  TaskRetrying: 'task.retrying',
  TaskBlocked: 'task.blocked',
  TaskUnblocked: 'task.unblocked',
  AgentRegistered: 'agent.registered',
  AgentOnline: 'agent.online',
  AgentOffline: 'agent.offline',
  ArtifactCreated: 'artifact.created',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const ArtifactType = {
  Text: 'text',
  Image: 'image',
  Video: 'video',
  Code: 'code',
  Log: 'log',
} as const;
export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType];

export const ErrorCode = {
  TaskNotFound: 'TASK_NOT_FOUND',
  TaskNotClaimable: 'TASK_NOT_CLAIMABLE',
  AgentNotFound: 'AGENT_NOT_FOUND',
  LeaseExpired: 'LEASE_EXPIRED',
  InvalidTransition: 'INVALID_TRANSITION',
  NotYourTask: 'NOT_YOUR_TASK',
  ValidationError: 'VALIDATION_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ===== Core Entities =====
export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  agentId?: string;
  dependsOn?: string[];
  retryCount: number;
  maxRetries: number;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  currentTaskId?: string;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: number;
  type: EventType;
  taskId?: string;
  agentId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface Artifact {
  id: string;
  taskId: string;
  type: ArtifactType;
  name: string;
  path: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ===== API Request DTOs =====
export interface CreateTaskRequest {
  type: TaskType;
  title: string;
  input: Record<string, unknown>;
  maxRetries?: number;
  dependsOn?: string[];
}

export interface RegisterAgentRequest {
  name: string;
  type: AgentType;
}

export interface WorkflowTaskSpec {
  type: TaskType;
  title: string;
  input: Record<string, unknown>;
  maxRetries?: number;
  dependsOnIndexes?: number[];
}

export interface CreateWorkflowRequest {
  tasks: WorkflowTaskSpec[];
}

export interface ClaimRequest {
  agentId: string;
}

export interface HeartbeatRequest {
  agentId: string;
}

export interface CompleteRequest {
  output: Record<string, unknown>;
}

export interface FailRequest {
  error: string;
}

// ===== API Response DTOs =====
export interface ClaimResponse {
  task: Task;
  leaseExpiresAt: string;
}

export interface HeartbeatResponse {
  ok: boolean;
  leaseExpiresAt: string;
}

export interface ApiError {
  ok: false;
  error: string;
  code: ErrorCode;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
