import test from 'node:test';
import assert from 'node:assert/strict';

import { mergePlay } from '../src/queue.js';

const X = { id: 1, name: 'X' };
const Y = { id: 2, name: 'Y' };
const A = { id: 10, name: 'A' };
const B = { id: 11, name: 'B' };

test('默认: 追加到队尾', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [A, B] });
  assert.deepEqual(out, [X, Y, A, B]);
});

test('playNext=true: 插到队头，旧队列保留在后面', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [A, B], playNext: true });
  assert.deepEqual(out, [A, B, X, Y]);
});

test('shouldClear=true: 旧队列清空，新歌成为整个队列', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [A, B], shouldClear: true });
  assert.deepEqual(out, [A, B]);
});

test('shouldClear 优先级高于 playNext（同时设时 shouldClear 胜出）', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [A, B], shouldClear: true, playNext: true });
  assert.deepEqual(out, [A, B]);
});

test('resolved 为空 + playNext=true: 队列不变（不能因为标志位就凭空插空数组）', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [], playNext: true });
  assert.deepEqual(out, [X, Y]);
});

test('resolved 为空 + shouldClear=true: 队列被清空', () => {
  const out = mergePlay({ queue: [X, Y], resolved: [], shouldClear: true });
  assert.deepEqual(out, []);
});

test('空队列 + 默认: 新歌成为队列', () => {
  const out = mergePlay({ queue: [], resolved: [A, B] });
  assert.deepEqual(out, [A, B]);
});

test('空队列 + playNext=true: 新歌成为队列（无旧的可保留）', () => {
  const out = mergePlay({ queue: [], resolved: [A, B], playNext: true });
  assert.deepEqual(out, [A, B]);
});

test('纯函数: 不改动入参', () => {
  const queue = [X, Y];
  const resolved = [A, B];
  mergePlay({ queue, resolved, playNext: true });
  assert.deepEqual(queue, [X, Y]);
  assert.deepEqual(resolved, [A, B]);
});

test('无参数调用: 返回空数组（防御性默认）', () => {
  const out = mergePlay();
  assert.deepEqual(out, []);
});

test('resolved 里 playNext 的顺序保留（不会反转）', () => {
  const C = { id: 12, name: 'C' };
  const out = mergePlay({ queue: [X], resolved: [A, B, C], playNext: true });
  assert.deepEqual(out, [A, B, C, X]);
});
