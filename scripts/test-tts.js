/**
 * 测试 TTS（火山引擎豆包）
 * 用法: node scripts/test-tts.js "要合成的文本"
 */
import 'dotenv/config';
import { synth, provider } from '../src/tts.js';

const text = process.argv[2] || '你好，我是 Claudio。这是第一次测试声音合成。';

console.log(`→ provider = ${provider()}`);
console.log('→ 合成:', text);
const t0 = Date.now();
try {
  const r = await synth(text);
  if (!r) {
    console.error('❌ 合成失败：文本为空');
    process.exit(1);
  }
  console.log(`✅ ${Date.now() - t0}ms, ${r.cached ? '[缓存]' : '[新合成]'} ${r.file}`);
  console.log('   用命令播放: afplay', r.file, '  (Mac)');
  console.log('   或: mpg123', r.file, '  (Linux)');
} catch (e) {
  console.error('❌ 错误:', e?.message || e);
  if (e?.stack) console.error(e.stack);
  if (e?.cause) console.error('cause:', e.cause);
  process.exit(1);
}
