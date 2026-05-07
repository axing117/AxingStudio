import type { ServerResponse } from 'node:http';
import type { TaskEvent } from '@axing/shared';

interface SSEClient {
  id: number;
  res: ServerResponse;
}

let nextId = 1;
const clients = new Set<SSEClient>();

export function addClient(res: ServerResponse): number {
  const id = nextId++;
  const client: SSEClient = { id, res };
  clients.add(client);

  res.on('close', () => {
    clients.delete(client);
  });

  // Send initial keepalive
  res.write(':ok\n\n');
  return id;
}

export function broadcast(event: TaskEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try { client.res.write(data); } catch { clients.delete(client); }
  }
}

export function clientCount(): number {
  return clients.size;
}
