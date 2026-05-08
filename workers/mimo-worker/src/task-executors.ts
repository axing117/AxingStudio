/**
 * 任务执行器 — Oracle (策略) & Forge (工程)
 */
import type { Task, ArtifactType } from '@axing/shared';
import { mimoGenerate } from './mimo-client.js';

const stamp = () => new Date().toISOString();
const fileSafeStamp = () => stamp().replace(/[:.]/g, '-');

function log(scope: string, message: string) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${ts}] [${scope}] ${message}`);
}

interface TaskResult {
  filename: string;
  fileContent: string;
  artifact: {
    type: ArtifactType;
    name: string;
    path: string;
    metadata: Record<string, unknown>;
  };
  output: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Oracle — 策略拆解                                                   */
/* ------------------------------------------------------------------ */

const ORACLE_SYSTEM = `你是"阿星工坊"的策略分析师（Oracle 角色）。
你的职责：将用户需求拆解为结构化任务列表，分配给工程室(Forge)和媒体室(Hermes)。

输出格式要求：
1. **需求概述**：一句话总结核心目标
2. **任务拆解**：列出 3-5 个可执行子任务，用 Markdown 表格（序号 | 任务 | 类型 | 优先级），类型填 forge 或 hermes
3. **风险提示**：点出关键风险点
4. **建议下一步**：明确下一步应该交给哪个角色`;

export async function executeOracle(task: Task): Promise<TaskResult> {
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;

  const userPrompt = `请分析以下需求，输出一份 Markdown 格式的策略文档：

## 需求
${brief}

## 任务背景
- 任务ID: ${task.id}
- 任务类型: ${task.type}
${task.dependsOn?.length ? `- 依赖任务: ${task.dependsOn.join(', ')}` : ''}`;

  const rawOutput = await mimoGenerate(ORACLE_SYSTEM, userPrompt, {
    temperature: 0.6,
    maxTokens: 3000,
  });

  const ts = fileSafeStamp();
  const filename = `oracle-${ts}.md`;

  return {
    filename,
    fileContent: rawOutput,
    artifact: {
      type: 'text' as ArtifactType,
      name: `Oracle — ${task.title}`,
      path: `vault/${task.id}/${filename}`,
      metadata: { role: 'strategy', brief, generatedAt: stamp(), source: 'mimo-worker' },
    },
    output: {
      summary: `策略拆解完成：${brief}`,
      nextStep: '交给 Forge 或 Hermes 继续执行',
      artifactPath: `vault/${task.id}/${filename}`,
      worker: 'mimo-worker',
      completedAt: stamp(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Forge — 工程实现                                                    */
/* ------------------------------------------------------------------ */

const FORGE_SYSTEM = `你是"阿星工坊"的工程师（Forge 角色）。
你的职责：根据任务规格编写可执行的 TypeScript 代码。

输出要求：
1. 完整的 TypeScript 模块，包含类型定义和主函数
2. 代码整洁、可直接运行
3. 底部包含 smoke test（if (require.main === module) 块）
4. 输出纯代码，不要额外的解释文字`;

export async function executeForge(task: Task): Promise<TaskResult> {
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;

  const userPrompt = `请根据以下任务规格生成实现代码：

## 任务
${brief}

## 任务背景
- 任务ID: ${task.id}
${task.dependsOn?.length ? `- 依赖任务: ${task.dependsOn.join(', ')}` : ''}
${task.input.context ? `\n## 上下文\n${task.input.context}` : ''}`;

  const rawOutput = await mimoGenerate(FORGE_SYSTEM, userPrompt, {
    temperature: 0.4,
    maxTokens: 4096,
  });

  // 提取代码块
  const codeMatch = rawOutput.match(/```(?:typescript|ts)\n([\s\S]*?)```/);
  const fileContent = codeMatch ? codeMatch[1] : rawOutput;
  const ts = fileSafeStamp();
  const filename = `forge-${ts}.ts`;

  return {
    filename,
    fileContent,
    artifact: {
      type: 'code' as ArtifactType,
      name: `Forge — ${task.title}`,
      path: `vault/${task.id}/${filename}`,
      metadata: { role: 'engineering', generatedAt: stamp(), source: 'mimo-worker' },
    },
    output: {
      summary: `工程执行完成：${brief}`,
      checks: ['mimo-generated'],
      artifactPath: `vault/${task.id}/${filename}`,
      worker: 'mimo-worker',
      completedAt: stamp(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Hermes — 媒体生成 (Seedream 生图)                                    */
/* ------------------------------------------------------------------ */

const ARK_IMAGE_API_KEY = process.env.ARK_IMAGE_API_KEY || '';
const ARK_IMAGE_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const ARK_IMAGE_MODEL = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128';

interface SeedreamResponse {
  data: { b64_json: string }[];
}

/**
 * 调用 Seedream API 生成图片
 */
async function generateImage(prompt: string, size: string = '1920x1920'): Promise<string> {
  if (!ARK_IMAGE_API_KEY) {
    throw new Error('ARK_IMAGE_API_KEY 环境变量未设置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const response = await fetch(ARK_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_IMAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_IMAGE_MODEL,
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Seedream API 错误 ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as SeedreamResponse;
    const b64 = data.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error('Seedream API 返回空图片');
    }

    return b64;
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeHermes(task: Task): Promise<TaskResult> {
  const brief = typeof task.input.brief === 'string' ? task.input.brief : task.title;
  const imagePrompt = typeof task.input.prompt === 'string' ? task.input.prompt : null;

  // 如果任务包含图片 prompt，直接生成图片
  if (imagePrompt) {
    log('hermes', `生成图片: ${imagePrompt.slice(0, 60)}...`);
    const b64 = await generateImage(imagePrompt);
    const ts = fileSafeStamp();
    const filename = `hermes-${ts}.png`;

    return {
      filename,
      fileContent: b64, // base64 encoded PNG
      artifact: {
        type: 'image' as ArtifactType,
        name: `Hermes — ${task.title}`,
        path: `vault/${task.id}/${filename}`,
        metadata: { role: 'media', prompt: imagePrompt, generatedAt: stamp(), source: 'seedream' },
      },
      output: {
        summary: `图片生成完成：${brief}`,
        previewMode: 'image',
        artifactPath: `vault/${task.id}/${filename}`,
        worker: 'mimo-worker',
        completedAt: stamp(),
      },
    };
  }

  // 否则，用 MiMo 生成媒体策划方案
  const HERMES_SYSTEM = `你是"阿星工坊"的媒体制作人（Hermes 角色）。
你的职责：根据需求生成媒体内容的策划方案和图片 prompt。

输出格式：Markdown 文档，包含：
1. 媒体需求概述
2. 素材清单（类型、描述、规格）
3. 图片生成 Prompt（英文，详细描述画面内容、风格、色调）
4. 预期产出`;

  const userPrompt = `请为以下媒体任务生成策划方案和图片 prompt：

## 需求
${brief}

## 任务背景
- 任务ID: ${task.id}`;

  const rawOutput = await mimoGenerate(HERMES_SYSTEM, userPrompt, {
    temperature: 0.7,
    maxTokens: 3000,
  });

  const ts = fileSafeStamp();
  const filename = `hermes-${ts}.md`;

  return {
    filename,
    fileContent: rawOutput,
    artifact: {
      type: 'text' as ArtifactType,
      name: `Hermes — ${task.title}`,
      path: `vault/${task.id}/${filename}`,
      metadata: { role: 'media', brief, generatedAt: stamp(), source: 'mimo-worker' },
    },
    output: {
      summary: `媒体策划完成：${brief}`,
      previewMode: 'text-plan',
      artifactPath: `vault/${task.id}/${filename}`,
      worker: 'mimo-worker',
      completedAt: stamp(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  任务分发                                                            */
/* ------------------------------------------------------------------ */

export async function executeTask(task: Task): Promise<TaskResult> {
  switch (task.type) {
    case 'oracle':
      return executeOracle(task);
    case 'forge':
      return executeForge(task);
    case 'hermes':
      return executeHermes(task);
    default:
      throw new Error(`未知任务类型: ${task.type}`);
  }
}
