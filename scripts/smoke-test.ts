// 阿星工坊 V2 全链路冒烟测试
const API = process.env.API_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

async function post(path: string, body?: Record<string, unknown>) {
  const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
}

async function get(path: string) {
  const res = await fetch(`${API}${path}`);
  return res.json() as Promise<{ ok: boolean; data?: Record<string, unknown> }>;
}

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('=== Axing Studio V2 Smoke Test ===\n');

  // ---- 1. Health ----
  console.log('[1/7] Health');
  const health = await get('/api/health');
  check('API alive', health.ok === true);

  // ---- 2. Workflow + DAG ----
  console.log('[2/7] DAG Workflow');
  const wf = await post('/api/workflows', {
    tasks: [
      { type: 'oracle', title: 'Smoke-Oracle', input: { step: 1 } },
      { type: 'forge', title: 'Smoke-Forge', input: { step: 2 }, dependsOnIndexes: [0] },
      { type: 'hermes', title: 'Smoke-Hermes', input: { step: 3 }, dependsOnIndexes: [0] },
    ],
  });
  check('workflow created', wf.ok === true, wf.error);
  const tasks = (wf.data?.tasks as Array<{ id: string; status: string }>) || [];
  const oracleId = tasks[0]?.id;
  const forgeId = tasks[1]?.id;
  const hermesId = tasks[2]?.id;
  check('oracle queued', tasks[0]?.status === 'queued', tasks[0]?.status);
  check('forge blocked', tasks[1]?.status === 'blocked', tasks[1]?.status);
  check('hermes blocked', tasks[2]?.status === 'blocked', tasks[2]?.status);

  // ---- 3. Register agent + complete Oracle → unblock ----
  console.log('[3/7] Agent register & DAG unblock');
  const agent = await post('/api/agents/register', { name: 'Smoke-Oracle', type: 'oracle' });
  check('agent registered', agent.ok === true);
  const agentId = agent.data?.id as string;

  const claim = await post(`/api/tasks/${oracleId}/claim`, { agentId });
  check('oracle claimed', claim.ok === true, claim.error);

  const done = await post(`/api/tasks/${oracleId}/complete`, { output: { result: 'ok' } });
  check('oracle completed', done.ok === true);

  const forge = await get(`/api/tasks/${forgeId}`);
  const forgeStatus = (forge.data as Record<string, unknown>)?.status;
  check('forge unblocked → queued', forgeStatus === 'queued', String(forgeStatus));

  const hermes = await get(`/api/tasks/${hermesId}`);
  const hermesStatus = (hermes.data as Record<string, unknown>)?.status;
  check('hermes unblocked → queued', hermesStatus === 'queued', String(hermesStatus));

  // ---- 4. SSE stream ----
  console.log('[4/7] SSE Event Stream');
  // Test catch-up: recent events are sent on connect
  const events = await get('/api/events?limit=5');
  check('events endpoint works', events.ok === true);
  const eventList = events.data as unknown as Array<{ type: string }> | undefined;
  check('has task.unblocked event', eventList?.some((e: { type: string }) => e.type === 'task.unblocked') ?? false);

  // ---- 5. Vault ----
  console.log('[5/7] File Vault');
  // Upload a test file to the oracle task's vault
  const upload = await post(`/api/vault/${oracleId}`, { filename: 'test.md', content: '# Hello Vault' });
  check('vault upload', upload.ok === true, upload.error);

  const vaultList = await get(`/api/vault/${oracleId}`);
  const files = (vaultList.data as Array<{ name: string }>) || [];
  check('vault list has file', files.some((f: { name: string }) => f.name === 'test.md'));

  const download = await fetch(`${API}/api/vault/${oracleId}/test.md`);
  const text = await download.text();
  check('vault download correct', text === '# Hello Vault', text.slice(0, 20));

  // ---- 6. Worktree ----
  console.log('[6/7] Git Worktree');
  const wt = await post(`/api/worktrees/${forgeId}`);
  check('worktree created', wt.ok === true, wt.error);
  check('branch name', String((wt.data as Record<string, unknown>)?.branch || '').startsWith('task/'));

  const wtInfo = await get(`/api/worktrees/${forgeId}`);
  check('worktree readable', wtInfo.ok === true);

  // ---- 7. Cleanup ----
  console.log('[7/7] Cleanup');
  const del = await fetch(`${API}/api/worktrees/${forgeId}`, { method: 'DELETE' }).then(r => r.json()) as { ok: boolean };
  check('worktree removed', del.ok === true);

  // ---- Summary ----
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test harness error:', err);
  process.exit(1);
});
