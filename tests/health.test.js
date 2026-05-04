import test from 'node:test';
import assert from 'node:assert/strict';
import { healthHandler } from '../src/health.js';

test('healthHandler responds with ok=true and numeric ts', () => {
  let captured;
  const res = {
    json(body) { captured = body; return this; },
  };
  healthHandler({}, res);
  assert.equal(captured.ok, true);
  assert.equal(typeof captured.ts, 'number');
  assert.ok(captured.ts > 0);
});

test('healthHandler does not throw on minimal req', () => {
  const res = { json() { return this; } };
  assert.doesNotThrow(() => healthHandler({}, res));
});
