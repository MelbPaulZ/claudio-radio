/**
 * Claude CLI provider
 *
 * Spawns `claude -p --output-format json` as a child process and returns
 * the raw model text.  Requires a Claude Max subscription (no API key needed).
 *
 * Exports: ask(prompt) → Promise<string>
 */

import { spawn } from 'node:child_process';
import { log } from '../../log.js';

export async function ask(prompt) {
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
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
