/**
 * 豆包 LLM via 火山引擎 Ark（OpenAI 兼容接口）。
 * 申请 API key + endpoint：https://console.volcengine.com/ark
 */
import { log } from '../../log.js';

const DEFAULT_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_MODEL = 'doubao-pro-32k';

export async function ask(prompt) {
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) throw new Error('DOUBAO_API_KEY not set');

  const model = process.env.DOUBAO_MODEL || DEFAULT_MODEL;
  const endpoint = process.env.DOUBAO_ENDPOINT || DEFAULT_ENDPOINT;

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Doubao API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    log.warn('豆包响应缺少 content:', JSON.stringify(json).slice(0, 200));
    throw new Error('Doubao response missing content');
  }
  return content;
}
