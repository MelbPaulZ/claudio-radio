import test from 'node:test';
import assert from 'node:assert/strict';

async function withEnv(overrides, fn) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, overrides);
  try { return await fn(); }
  finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

async function withMockFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); }
  finally { globalThis.fetch = original; }
}

test('doubao.ask: throws when DOUBAO_API_KEY missing', async () => {
  await withEnv({}, async () => {
    const { ask } = await import(`../src/llm/providers/doubao.js?t=${Date.now()}`);
    await assert.rejects(() => ask('hi'), /DOUBAO_API_KEY/);
  });
});

test('doubao.ask: posts to ark endpoint with bearer auth and json body', async () => {
  let capturedUrl, capturedInit;
  const mock = async (url, init) => {
    capturedUrl = url; capturedInit = init;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"say": "hi"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await withEnv({ DOUBAO_API_KEY: 'test-key', DOUBAO_MODEL: 'doubao-pro-32k' }, async () => {
    await withMockFetch(mock, async () => {
      const { ask } = await import(`../src/llm/providers/doubao.js?t=${Date.now()}`);
      const out = await ask('build a JSON');
      assert.equal(out, '{"say": "hi"}');
    });
  });

  assert.match(capturedUrl, /ark\.cn-beijing\.volces\.com\/api\/v3\/chat\/completions/);
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers['Authorization'], 'Bearer test-key');
  assert.equal(capturedInit.headers['Content-Type'], 'application/json');
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.model, 'doubao-pro-32k');
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.messages[0].content, 'build a JSON');
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('doubao.ask: throws on 4xx with response body in error', async () => {
  const mock = async () => new Response('rate limit hit', { status: 429 });
  await withEnv({ DOUBAO_API_KEY: 'test-key' }, async () => {
    await withMockFetch(mock, async () => {
      const { ask } = await import(`../src/llm/providers/doubao.js?t=${Date.now()}`);
      await assert.rejects(() => ask('x'), /Doubao API 429.*rate limit hit/);
    });
  });
});

test('doubao.ask: throws when response missing choices[0].message.content', async () => {
  const mock = async () => new Response(JSON.stringify({ choices: [] }), { status: 200 });
  await withEnv({ DOUBAO_API_KEY: 'test-key' }, async () => {
    await withMockFetch(mock, async () => {
      const { ask } = await import(`../src/llm/providers/doubao.js?t=${Date.now()}`);
      await assert.rejects(() => ask('x'), /missing content/);
    });
  });
});

test('doubao.ask: respects custom DOUBAO_ENDPOINT and DOUBAO_MODEL', async () => {
  let capturedUrl, capturedBody;
  const mock = async (url, init) => {
    capturedUrl = url; capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  };
  await withEnv({
    DOUBAO_API_KEY: 'k',
    DOUBAO_MODEL: 'doubao-1.5-pro-32k',
    DOUBAO_ENDPOINT: 'https://example.test/v1/chat',
  }, async () => {
    await withMockFetch(mock, async () => {
      const { ask } = await import(`../src/llm/providers/doubao.js?t=${Date.now()}`);
      await ask('hello');
    });
  });
  assert.equal(capturedUrl, 'https://example.test/v1/chat');
  assert.equal(capturedBody.model, 'doubao-1.5-pro-32k');
});
