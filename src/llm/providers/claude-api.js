/**
 * Claude API provider
 *
 * POSTs directly to api.anthropic.com/v1/messages and returns the raw model
 * text.  Requires ANTHROPIC_API_KEY to be set at call time.
 *
 * Exports: ask(prompt) → Promise<string>
 */

import { log } from '../../log.js';

export async function ask(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('CLAUDE_MODE=api 但没配 ANTHROPIC_API_KEY');
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}
