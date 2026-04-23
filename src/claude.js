/**
 * Claude 大脑适配器
 *
 * 支持两种模式：
 *   1. cli (默认) —— 起 `claude -p --output-format stream-json` 子进程，靠 Max 订阅，不需要 API key
 *   2. api —— 直接调 Anthropic API，需要 ANTHROPIC_API_KEY
 *
 * 统一输入 prompt (字符串) ，统一输出结构化 {say, play, immediate, clearQueue, reason}
 */

import { spawn } from 'node:child_process';
import { log } from './log.js';

const MODE = process.env.CLAUDE_MODE || 'cli';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export async function ask(prompt, opts = {}) {
  const raw = MODE === 'api' ? await askViaApi(prompt) : await askViaCli(prompt);
  return parseDjResponse(raw);
}

// -------- CLI 模式 --------
function askViaCli(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json'];
    const p = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', d => (stdout += d));
    p.stderr.on('data', d => (stderr += d));
    p.on('error', reject);
    p.on('exit', code => {
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr}`));
      try {
        const parsed = JSON.parse(stdout);
        // claude -p --output-format json 返回 { result: "...模型文本..." }
        resolve(parsed.result || parsed.response || stdout);
      } catch {
        resolve(stdout);
      }
    });
  });
}

// -------- API 模式 --------
async function askViaApi(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('CLAUDE_MODE=api 但没配 ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// -------- 解析 DJ 响应 --------
export function parseDjResponse(raw) {
  if (!raw) return emptyResponse('模型没返回内容');
  // 有时模型会在 JSON 前后多一点解释，抠出第一个 { 到最后一个 }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    log.warn('claude 输出不是 JSON:', raw.slice(0, 200));
    return emptyResponse(raw.slice(0, 200));
  }
  try {
    const obj = JSON.parse(m[0]);
    return {
      say: String(obj.say || '').trim(),
      play: Array.isArray(obj.play) ? obj.play.filter(x => x?.id).map(x => ({ id: Number(x.id), reason: String(x.reason || '') })) : [],
      immediate: Boolean(obj.immediate),
      clearQueue: Boolean(obj.clearQueue),
      playNext: Boolean(obj.playNext),
      reason: String(obj.reason || ''),
    };
  } catch (e) {
    log.warn('JSON parse 失败:', e.message);
    log.warn('原始内容:', m[0].slice(0, 500));
    return emptyResponse('');
  }
}

function emptyResponse(fallbackSay) {
  return { say: fallbackSay, play: [], immediate: false, clearQueue: false, playNext: false, reason: '' };
}
