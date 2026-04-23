import test from 'node:test';
import assert from 'node:assert/strict';

// 兜底环境变量，避免 import 期做配置检查
process.env.VOLC_APPID ||= 'test-appid';
process.env.VOLC_ACCESS_TOKEN ||= 'test-token';

const { synth, buildCacheKey, buildVolcBody, parseVolcResponse } = await import('../src/tts.js');

test('synth() 空字符串返回 null', async () => {
  assert.equal(await synth(''), null);
});

test('synth() 纯空白返回 null', async () => {
  assert.equal(await synth('   \n\t'), null);
});

test('synth() null 返回 null', async () => {
  assert.equal(await synth(null), null);
});

test('buildCacheKey 返回 16 字符 hex', () => {
  const key = buildCacheKey('zh_female_vv_uranus_bigtts', '你好');
  assert.match(key, /^[0-9a-f]{16}$/);
});

test('buildCacheKey 同输入同输出（稳定）', () => {
  const a = buildCacheKey('voiceA', '文本 X');
  const b = buildCacheKey('voiceA', '文本 X');
  assert.equal(a, b);
});

test('buildCacheKey 不同 voice 返回不同 key', () => {
  const a = buildCacheKey('voiceA', '相同文本');
  const b = buildCacheKey('voiceB', '相同文本');
  assert.notEqual(a, b);
});

test('buildCacheKey 不同文本返回不同 key', () => {
  const a = buildCacheKey('sameVoice', '文本一');
  const b = buildCacheKey('sameVoice', '文本二');
  assert.notEqual(a, b);
});

test('buildVolcBody 返回符合火山协议的对象', () => {
  const body = buildVolcBody({
    appid: 'APP',
    token: 'TOK',
    cluster: 'volcano_tts',
    voice: 'myVoice',
    uid: 'claudio-radio',
    reqid: 'req-123',
    text: '你好 Claudio',
  });

  assert.deepEqual(body, {
    app:     { appid: 'APP', token: 'TOK', cluster: 'volcano_tts' },
    user:    { uid: 'claudio-radio' },
    audio:   { voice_type: 'myVoice', encoding: 'mp3', speed_ratio: 1.0 },
    request: { reqid: 'req-123', text: '你好 Claudio', text_type: 'plain', operation: 'query' },
  });
});

test('parseVolcResponse 成功返回 Buffer', () => {
  const helloB64 = Buffer.from('hello').toString('base64');
  const buf = parseVolcResponse({ code: 3000, message: 'Success', data: helloB64 });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString(), 'hello');
});

test('parseVolcResponse code 非 3000 抛错', () => {
  assert.throws(
    () => parseVolcResponse({ code: 4001, message: '鉴权失败' }),
    /Volc TTS 4001: 鉴权失败/
  );
});

test('parseVolcResponse data 缺失抛错', () => {
  assert.throws(
    () => parseVolcResponse({ code: 3000, message: 'Success' }),
    /Volc TTS 返回无音频数据/
  );
});

test('parseVolcResponse 非对象抛错', () => {
  assert.throws(() => parseVolcResponse(null), /Volc TTS 返回非对象/);
  assert.throws(() => parseVolcResponse('oops'), /Volc TTS 返回非对象/);
});
