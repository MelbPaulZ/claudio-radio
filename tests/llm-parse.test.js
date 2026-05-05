import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDjResponse } from '../src/llm/parse.js';

test('parseDjResponse: 完整合法 JSON 正常解析', () => {
  const raw = JSON.stringify({
    say: '来点欢快的',
    play: [{ id: 111, reason: 'bright pop' }],
    immediate: false,
    clearQueue: false,
    playNext: false,
    reason: 'just vibes',
  });
  const r = parseDjResponse(raw);
  assert.equal(r.say, '来点欢快的');
  assert.deepEqual(r.play, [{ id: 111, reason: 'bright pop' }]);
  assert.equal(r.immediate, false);
  assert.equal(r.clearQueue, false);
  assert.equal(r.playNext, false);
});

test('parseDjResponse: playNext=true 正确解析', () => {
  const raw = JSON.stringify({
    say: '下一首放给你',
    play: [{ id: 27591152, reason: 'answer' }],
    immediate: false,
    clearQueue: false,
    playNext: true,
    reason: 'recommendation',
  });
  const r = parseDjResponse(raw);
  assert.equal(r.playNext, true);
});

test('parseDjResponse: playNext 缺失时默认为 false', () => {
  const raw = JSON.stringify({
    say: 'x',
    play: [],
    immediate: false,
    clearQueue: false,
    reason: '',
  });
  const r = parseDjResponse(raw);
  assert.equal(r.playNext, false);
});

test('parseDjResponse: playNext 非 boolean 被强转（truthy/falsy 语义）', () => {
  assert.equal(parseDjResponse(JSON.stringify({ playNext: 1 })).playNext, true);
  assert.equal(parseDjResponse(JSON.stringify({ playNext: 'true' })).playNext, true);
  assert.equal(parseDjResponse(JSON.stringify({ playNext: 0 })).playNext, false);
  assert.equal(parseDjResponse(JSON.stringify({ playNext: null })).playNext, false);
});

test('parseDjResponse: 模型在 JSON 前后多说了话，仍能抠出 JSON', () => {
  const raw = '这是解释\n{"say":"hi","play":[],"immediate":false,"clearQueue":false,"playNext":true}\n尾部';
  const r = parseDjResponse(raw);
  assert.equal(r.say, 'hi');
  assert.equal(r.playNext, true);
});

test('parseDjResponse: 空输入返回 fallback 对象（包含 playNext=false）', () => {
  const r = parseDjResponse('');
  assert.equal(r.playNext, false);
  assert.equal(r.immediate, false);
  assert.equal(r.clearQueue, false);
  assert.deepEqual(r.play, []);
});

test('parseDjResponse: 非 JSON 输入返回 fallback 对象（包含 playNext=false）', () => {
  const r = parseDjResponse('not json at all');
  assert.equal(r.playNext, false);
  assert.deepEqual(r.play, []);
});

test('parseDjResponse: play[] 里 id 缺失的项被过滤掉', () => {
  const raw = JSON.stringify({
    play: [{ id: 1, reason: 'ok' }, { reason: 'no id' }, { id: 2 }],
  });
  const r = parseDjResponse(raw);
  assert.deepEqual(r.play, [
    { id: 1, reason: 'ok' },
    { id: 2, reason: '' },
  ]);
});
