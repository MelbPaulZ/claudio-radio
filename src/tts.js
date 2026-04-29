/**
 * TTS —— 文字转语音
 *
 * 当前仅支持火山引擎豆包 TTS（HTTP JSON 同步接口）。
 * 保留 TTS_PROVIDER 环境变量为未来扩展多 provider 留接口。
 *
 * 缓存：相同文本 + 相同 voice 只合成一次，存到 cache/tts/<sha256>.mp3
 * 前端通过 GET /tts/<hash>.mp3 播放。
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'tts');

const PROVIDER = (process.env.TTS_PROVIDER || 'volc').toLowerCase();

// --- 火山引擎豆包 TTS ---
const VOLC_APPID = process.env.VOLC_APPID;
const VOLC_TOKEN = process.env.VOLC_ACCESS_TOKEN;
const VOLC_CLUSTER = process.env.VOLC_CLUSTER || 'volcano_tts';
const VOLC_VOICE = process.env.VOLC_VOICE || 'zh_female_vv_uranus_bigtts';
const VOLC_VOLUME_RATIO = clampVolumeRatio(process.env.VOLC_VOLUME_RATIO, 1.5);
const VOLC_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';

function clampVolumeRatio(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(0.1, n));
}

/**
 * 缓存 key = sha256("volc::<voice>::<text>::vol=<volumeRatio>") 前 16 位
 * 导出以便单元测试。换 voice / 换 volumeRatio 都会改变 key，不会命中旧缓存。
 */
export function buildCacheKey(voice, text, volumeRatio = 1.0) {
  return crypto.createHash('sha256')
    .update(`volc::${voice}::${text}::vol=${volumeRatio}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 解析火山 TTS 响应。成功返回 base64 解码后的音频 Buffer，失败抛错。
 * 纯函数，导出便于单元测试。
 */
export function parseVolcResponse(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Volc TTS 返回非对象');
  }
  if (json.code !== 3000) {
    throw new Error(`Volc TTS ${json.code}: ${json.message || '(无 message)'}`);
  }
  if (!json.data) {
    throw new Error('Volc TTS 返回无音频数据');
  }
  return Buffer.from(json.data, 'base64');
}

/**
 * 组装火山 TTS 请求体。纯函数，导出便于单元测试。
 */
export function buildVolcBody({ appid, token, cluster, voice, uid, reqid, text, volumeRatio = 1.0 }) {
  return {
    app:     { appid, token, cluster },
    user:    { uid },
    audio:   { voice_type: voice, encoding: 'mp3', speed_ratio: 1.0, volume_ratio: volumeRatio },
    request: { reqid, text, text_type: 'plain', operation: 'query' },
  };
}

export async function synth(text) {
  if (!text || !text.trim()) return null;

  const hash = buildCacheKey(VOLC_VOICE, text, VOLC_VOLUME_RATIO);
  const file = path.join(CACHE_DIR, `${hash}.mp3`);

  // 命中缓存
  try {
    await fs.access(file);
    log.debug(`TTS cache hit: ${hash}`);
    return { hash, file, cached: true };
  } catch {
    /* miss, continue */
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  log.info(`TTS [volc] 合成: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`);

  const audio = await synthVolc(text);
  await fs.writeFile(file, audio);

  const stat = await fs.stat(file);
  log.debug(`TTS 保存 ${hash} (${(stat.size / 1024).toFixed(1)}KB)`);
  return { hash, file, cached: false };
}

async function synthVolc(text) {
  if (!VOLC_APPID || !VOLC_TOKEN) {
    throw new Error('VOLC_APPID / VOLC_ACCESS_TOKEN 没配');
  }

  const body = buildVolcBody({
    appid:       VOLC_APPID,
    token:       VOLC_TOKEN,
    cluster:     VOLC_CLUSTER,
    voice:       VOLC_VOICE,
    uid:         'claudio-radio',
    reqid:       crypto.randomUUID(),
    text,
    volumeRatio: VOLC_VOLUME_RATIO,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res;
  try {
    res = await fetch(VOLC_ENDPOINT, {
      method: 'POST',
      headers: {
        // ⚠️ 火山要求 Bearer 和 token 用分号分隔，不是空格
        'authorization': `Bearer;${VOLC_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Volc TTS 超时（30s）');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 500);
    throw new Error(`Volc TTS HTTP ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  return parseVolcResponse(json);
}

export function ttsUrl(hash) {
  return `/tts/${hash}.mp3`;
}

export function cacheDir() {
  return CACHE_DIR;
}

export function provider() {
  return 'volc';
}
