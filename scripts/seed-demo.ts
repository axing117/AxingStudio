// 阿星工坊 V1.5 Demo 数据播种
// 用法: npm -w apps/api run dev 先启动 API，然后 npx tsx scripts/seed-demo.ts
const API = process.env.API_URL || 'http://localhost:3001';

interface DemoTask {
  type: 'oracle' | 'forge' | 'hermes';
  title: string;
  brief: string;
}

const DEMO_TASKS: DemoTask[] = [
  {
    type: 'oracle',
    title: '拆解产品需求文档',
    brief: '分析用户提供的产品需求，输出结构化任务列表，为下游工程室和媒体室提供执行依据。',
  },
  {
    type: 'forge',
    title: '生成API模块骨架',
    brief: '基于策略室拆解结果，生成 TypeScript 接口定义、参数校验和单元测试草稿。',
  },
  {
    type: 'hermes',
    title: '制作宣传预览视频',
    brief: '根据脚本生成 15 秒模拟预览视频，包含标题卡、转场和片尾占位。',
  },
];

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; data?: { id: string }; error?: string };
  if (!json.ok) throw new Error(`${res.status} ${json.error}`);
  return json.data!;
}

async function main() {
  console.log(`Seeding demo tasks → ${API}\n`);

  for (const t of DEMO_TASKS) {
    const data = await post('/api/tasks', {
      type: t.type,
      title: t.title,
      input: { brief: t.brief, source: 'seed-demo' },
    });
    console.log(`  [${t.type}] ${t.title}  →  ${data.id}`);
  }

  console.log(`\nDone. ${DEMO_TASKS.length} demo tasks created.`);
  console.log('Dashboard: http://localhost:5173');
}

main().catch((err) => {
  console.error('Seed failed — is the API running?', err.message);
  process.exit(1);
});
