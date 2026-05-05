import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/env.js';

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, overrides);
  try { return fn(); }
  finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const FULL = {
  NETEASE_USER_ID: '123',
  NETEASE_COOKIE: 'MUSIC_U=abc',
  VOLC_APPID: 'app',
  VOLC_ACCESS_TOKEN: 'tok',
  OPENWEATHER_API_KEY: 'wk',
  CLAUDE_MODE: 'api',
  ANTHROPIC_API_KEY: 'sk-test',
};

test('validateEnv: all required present → empty errors', () => {
  withEnv(FULL, () => {
    const errors = validateEnv();
    assert.deepEqual(errors, []);
  });
});

test('validateEnv: missing NETEASE_USER_ID → reports it', () => {
  const env = { ...FULL };
  delete env.NETEASE_USER_ID;
  withEnv(env, () => {
    const errors = validateEnv();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /NETEASE_USER_ID/);
  });
});

test('validateEnv: NETEASE_COOKIE without MUSIC_U= → reports format error', () => {
  withEnv({ ...FULL, NETEASE_COOKIE: 'someothercookie' }, () => {
    const errors = validateEnv();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /NETEASE_COOKIE/);
    assert.match(errors[0], /MUSIC_U/);
  });
});

test('validateEnv: CLAUDE_MODE=api without ANTHROPIC_API_KEY → reports it', () => {
  const env = { ...FULL };
  delete env.ANTHROPIC_API_KEY;
  withEnv(env, () => {
    const errors = validateEnv();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /ANTHROPIC_API_KEY/);
  });
});

test('validateEnv: CLAUDE_MODE=cli without ANTHROPIC_API_KEY → no error (cli does not need key)', () => {
  const env = { ...FULL, CLAUDE_MODE: 'cli' };
  delete env.ANTHROPIC_API_KEY;
  withEnv(env, () => {
    const errors = validateEnv();
    assert.deepEqual(errors, []);
  });
});

test('validateEnv: CLAUDE_MODE unset defaults to cli → no ANTHROPIC_API_KEY required', () => {
  const env = { ...FULL };
  delete env.CLAUDE_MODE;
  delete env.ANTHROPIC_API_KEY;
  withEnv(env, () => {
    const errors = validateEnv();
    assert.deepEqual(errors, []);
  });
});

test('validateEnv: multiple missing → multiple errors', () => {
  withEnv({ CLAUDE_MODE: 'api' }, () => {
    const errors = validateEnv();
    // missing: NETEASE_USER_ID, NETEASE_COOKIE, VOLC_APPID, VOLC_ACCESS_TOKEN, OPENWEATHER_API_KEY, ANTHROPIC_API_KEY
    assert.equal(errors.length, 6);
  });
});
