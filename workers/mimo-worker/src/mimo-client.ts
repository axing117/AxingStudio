/**
 * MiMo API 客户端
 * 使用 OpenAI 兼容接口调用小米 MiMo 模型
 */

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5-pro';
const MIMO_TIMEOUT_MS = numberEnv('MIMO_TIMEOUT_MS', 120_000);

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletion {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 调用 MiMo API 生成文本
 */
export async function mimoChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<string> {
  if (!MIMO_API_KEY) {
    throw new Error('MIMO_API_KEY 环境变量未设置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs || MIMO_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiMo API 错误 ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as ChatCompletion;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('MiMo API 返回空内容');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 单次调用（简化接口）
 */
export async function mimoGenerate(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  return mimoChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options
  );
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}
