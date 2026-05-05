import type {
  Agent,
  ApiResponse,
  Artifact,
  CreateTaskRequest,
  Task,
  TaskEvent,
  TaskStatus,
} from '@axing/shared';

type Health = {
  status: string;
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
  agents: () => request<Agent[]>('/api/agents'),
  artifacts: (taskId?: string) => request<Artifact[]>(`/api/artifacts${query({ taskId })}`),
  createTask: (body: CreateTaskRequest) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  events: (limit = 50, offset = 0, taskId?: string) =>
    request<TaskEvent[]>(`/api/events${query({ limit, offset, taskId })}`),
  tasks: (status?: TaskStatus) => request<Task[]>(`/api/tasks${query({ status })}`),
};
