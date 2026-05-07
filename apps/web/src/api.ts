import type {
  Agent,
  ApiResponse,
  Artifact,
  CreateWorkflowRequest,
  CreateTaskRequest,
  Task,
  TaskEvent,
  TaskStatus,
} from '@axing/shared';

type Health = {
  status: string;
};

export type SystemStatus = {
  cpu: number;
  memory: number;
  uptime: number;
  onlineAgents: number;
  totalAgents: number;
  queuedTasks: number;
  runningTasks: number;
};

export type WorkflowResponse = {
  tasks: Task[];
  workflowId: string;
};

export type WorktreeFile = {
  name: string;
  size: number;
};

export type WorktreeInfo = {
  taskId: string;
  path: string;
  branch: string;
  files: WorktreeFile[];
};

export type VaultFile = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) {
    throw new ApiClientError(payload.error, response.status, payload.code);
  }

  return payload.data;
}

async function requestText(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ApiClientError(`文件请求失败：${response.statusText}`, response.status);
  }
  return response.text();
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
}

export const api = {
  health: () => request<Health>('/api/health'),
  systemStatus: () => request<SystemStatus>('/api/system/status'),
  agents: () => request<Agent[]>('/api/agents'),
  artifacts: (taskId?: string) => request<Artifact[]>(`/api/artifacts${query({ taskId })}`),
  createWorkflow: (body: CreateWorkflowRequest) =>
    request<WorkflowResponse>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createTask: (body: CreateTaskRequest) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  events: (limit = 50, offset = 0, taskId?: string) =>
    request<TaskEvent[]>(`/api/events${query({ limit, offset, taskId })}`),
  tasks: (status?: TaskStatus) => request<Task[]>(`/api/tasks${query({ status })}`),
  worktrees: () => request<WorktreeInfo[]>('/api/worktrees'),
  createWorktree: (taskId: string) =>
    request<WorktreeInfo>(`/api/worktrees/${encodeURIComponent(taskId)}`, { method: 'POST' }),
  removeWorktree: (taskId: string) =>
    request<{ removed: boolean }>(`/api/worktrees/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  vaultFiles: (taskId: string) => request<VaultFile[]>(`/api/vault/${encodeURIComponent(taskId)}`),
  vaultPreview: (taskId: string, filename: string) =>
    requestText(`/api/vault/${encodeURIComponent(taskId)}/${encodeURIComponent(filename)}`),
};
