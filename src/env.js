/**
 * Startup env validation. Returns array of human-readable error strings.
 * Empty array = all good.
 *
 * Designed to be called once in server.js before anything else.
 */
export function validateEnv() {
  const errors = [];
  const env = process.env;

  if (!env.NETEASE_USER_ID) {
    errors.push('NETEASE_USER_ID 缺失 / NETEASE_USER_ID is required (你的网易云用户 ID)');
  }

  if (!env.NETEASE_COOKIE) {
    errors.push('NETEASE_COOKIE 缺失 / NETEASE_COOKIE is required (网易云登录 cookie)');
  } else if (!env.NETEASE_COOKIE.includes('MUSIC_U=')) {
    errors.push('NETEASE_COOKIE 格式错误 / NETEASE_COOKIE must contain "MUSIC_U=..." (从浏览器 Application → Cookies 抓)');
  }

  if (!env.VOLC_APPID) {
    errors.push('VOLC_APPID 缺失 / VOLC_APPID is required (火山引擎应用 ID)');
  }

  if (!env.VOLC_ACCESS_TOKEN) {
    errors.push('VOLC_ACCESS_TOKEN 缺失 / VOLC_ACCESS_TOKEN is required (火山引擎 access token)');
  }

  if (!env.OPENWEATHER_API_KEY) {
    errors.push('OPENWEATHER_API_KEY 缺失 / OPENWEATHER_API_KEY is required (https://openweathermap.org/api 免费注册)');
  }

  // 1. Detect legacy CLAUDE_MODE — fail-fast with migration guidance.
  if (env.CLAUDE_MODE) {
    errors.push(
      'CLAUDE_MODE 已废弃 / CLAUDE_MODE is deprecated, use LLM_PROVIDER instead. ' +
      '迁移：CLAUDE_MODE=cli → LLM_PROVIDER=claude-cli; CLAUDE_MODE=api → LLM_PROVIDER=claude-api'
    );
  }

  // 2. Validate LLM_PROVIDER value.
  const validProviders = ['claude-cli', 'claude-api', 'doubao'];
  const provider = env.LLM_PROVIDER || 'claude-cli';
  if (!validProviders.includes(provider)) {
    errors.push(
      `LLM_PROVIDER 无效 / LLM_PROVIDER must be one of: ${validProviders.join(', ')} (got: ${provider})`
    );
  }

  // 3. Provider-specific required env.
  if (provider === 'claude-api' && !env.ANTHROPIC_API_KEY) {
    errors.push('LLM_PROVIDER=claude-api 但 ANTHROPIC_API_KEY 缺失 / ANTHROPIC_API_KEY required when LLM_PROVIDER=claude-api');
  }
  if (provider === 'doubao' && !env.DOUBAO_API_KEY) {
    errors.push('LLM_PROVIDER=doubao 但 DOUBAO_API_KEY 缺失 / DOUBAO_API_KEY required when LLM_PROVIDER=doubao (https://console.volcengine.com/ark 创建)');
  }

  return errors;
}

/**
 * Print errors to stderr in a friendly format and exit if any.
 * Called from server.js startup; not used in tests.
 */
export function exitIfInvalidEnv() {
  const errors = validateEnv();
  if (errors.length === 0) return;
  process.stderr.write('\n');
  process.stderr.write('────────────────────────────────────────────────────────\n');
  process.stderr.write('启动失败：必填环境变量缺失或格式错误\n');
  process.stderr.write('Startup failed: required env vars missing or malformed\n');
  process.stderr.write('────────────────────────────────────────────────────────\n');
  for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
  process.stderr.write('\n');
  process.stderr.write('请编辑 .env 后重启 / Edit .env and restart.\n');
  process.stderr.write('参考 .env.example / See .env.example for examples.\n');
  process.stderr.write('\n');
  process.exit(1);
}
