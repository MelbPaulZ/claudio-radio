/**
 * 测试 Claude 大脑是否通
 * 用法: node scripts/test-claude.js
 */
import 'dotenv/config';
import { ask } from '../src/claude.js';

const testPrompt = `你是 Claudio，一个 AI 电台 DJ。

环境：周三下午 3 点，上海，晴。

用户的歌曲库里有这几首：
- 1901371647 "Said And Done" by Nils Frahm
- 28797308 "夜空中最亮的星" by 逃跑计划
- 1379357589 "轻涟" by 窦靖童

现在是下午专注时段，请选一首歌开场。

严格按 JSON 格式输出：{"say":"...", "play":[{"id":N,"reason":"..."}], "reason":"..."}`;

console.log('→ 调用 Claude...');
console.log('   模式:', process.env.CLAUDE_MODE || 'cli');
const t0 = Date.now();
try {
  const res = await ask(testPrompt);
  console.log(`✅ ${Date.now() - t0}ms`);
  console.log('\nsay:   ', res.say);
  console.log('play:  ', JSON.stringify(res.play, null, 2));
  console.log('reason:', res.reason);
} catch (e) {
  console.error('❌', e.message);
  console.error('\n提示：');
  console.error('  - CLI 模式要先装 Claude Code: https://docs.anthropic.com/claude/docs/claude-code');
  console.error('  - API 模式要在 .env 填 ANTHROPIC_API_KEY');
}
