import * as claudeCli from './providers/claude-cli.js';
import * as claudeApi from './providers/claude-api.js';
import * as doubao from './providers/doubao.js';
import { parseDjResponse } from './parse.js';

const PROVIDER = process.env.LLM_PROVIDER || 'claude-cli';

const REGISTRY = {
  'claude-cli': claudeCli,
  'claude-api': claudeApi,
  'doubao': doubao,
};

export async function ask(prompt) {
  const impl = REGISTRY[PROVIDER];
  if (!impl) throw new Error(`Unknown LLM_PROVIDER: ${PROVIDER}`);
  return impl.ask(prompt);
}

export { parseDjResponse };
