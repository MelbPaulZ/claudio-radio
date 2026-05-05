/**
 * Claudio 主服务
 * - HTTP API: /api/now, /api/taste, /api/plan/today, /api/chat, /api/trigger
 * - 静态: /tts/<hash>.mp3（TTS 缓存）, / （PWA）
 * - WebSocket /stream: 推 now-playing、DJ say、状态
 */

import 'dotenv/config';
import { exitIfInvalidEnv } from './env.js';
exitIfInvalidEnv();
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from './log.js';
import { intent } from './router.js';
import { ask } from './claude.js';
import { build as buildContext } from './context.js';
import { synth, cacheDir, ttsUrl, provider as ttsProvider } from './tts.js';
import { startScheduler } from './scheduler.js';
import { state } from './state.js';
import { mergePlay } from './queue.js';
import * as ncm from './music/netease.js';
import { healthHandler } from './health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(express.json());
app.get('/health', healthHandler);

// ---- 静态 ----
app.use('/tts', express.static(cacheDir()));
app.use('/', express.static(path.join(ROOT, 'web')));

// ---- 运行时状态 ----
const runtime = {
  queue: [],          // 待播歌曲队列 {id, name, artists, cover, url}
  current: null,      // 正在播的
  lastDjSay: null,    // 最新 DJ 说的话 {text, ttsUrl}
  songPool: [],       // 当前曲库候选（从网易云拉的）
  lastUserTriggerAt: 0, // 上次用户主动触发的时间戳，用来压制紧随其后的自动调度
  userInFlight: false,  // 用户请求正在处理中（含 SIMPLE 命令的同步 queue_drain），期间 cron 不插队
};

const AUTO_TRIGGER_COOLDOWN_MS = 60_000;

// ---- WebSocket ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, t: Date.now() });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

// ---- 核心：处理一次触发 ----
async function handleTrigger({ userInput = '', trigger = 'user' } = {}) {
  log.info(`→ trigger=${trigger}${userInput ? ' input="' + userInput + '"' : ''}`);

  const isUser = trigger === 'user';
  if (isUser) {
    runtime.lastUserTriggerAt = Date.now();
    runtime.userInFlight = true;
  }
  try {
    return await handleTriggerInner({ userInput, trigger });
  } finally {
    if (isUser) runtime.userInFlight = false;
  }
}

async function handleTriggerInner({ userInput, trigger }) {
  // 简单指令直走，不烧 claude —— 但仍要把用户说的话记到对话历史，让后续 queue_drain 时 Claude 知道刚才发生了什么
  if (userInput) {
    const it = intent(userInput);
    if (it.kind === 'command') {
      state.addMessage('user', userInput);
      return await handleSimpleCommand(it.action);
    }
    state.addMessage('user', userInput);
  }

  // 如果曲库为空，先拉
  if (runtime.songPool.length === 0) {
    await refreshSongPool();
  }

  // 过滤掉 24h 内已播过的
  const pool = runtime.songPool.filter(s => !state.playedWithin(s.id, 24));
  const prompt = await buildContext({
    userInput, trigger, songPool: pool,
    nowPlaying: runtime.current,
    queue: runtime.queue,
  });

  const { say, play, immediate: modelImmediate, clearQueue: modelClearQueue, playNext: modelPlayNext, reason } = await ask(prompt);
  // 用户意图兜底：只要说了"换/切/别的/不想听/这首不行/太吵/太慢/太快"，强制当作切歌，不管 Claude 返回了什么
  const userWantsChange = trigger === 'user' && /换|切|别的|不想|不行|太吵|太慢|太快/.test(userInput);
  const immediate = userWantsChange || modelImmediate;
  const clearQueue = userWantsChange || modelClearQueue;
  if (userWantsChange && !modelImmediate) {
    log.info(`↪ 覆盖：检测到用户要换歌，强制 immediate=true clearQueue=true（模型返回 immediate=${modelImmediate} clearQueue=${modelClearQueue}）`);
  }
  // immediate=true 语义上必然要求 Claude 的选歌"立刻就播"，所以顺带清空旧队列（否则 advance 会弹出队头的老货）
  const shouldClear = clearQueue || immediate;
  // playNext 只在「不清队列 + 不打断」的语境下生效；immediate/clearQueue 已经含更强语义，playNext 无意义
  const playNext = modelPlayNext && !shouldClear;
  log.info(`DJ: say="${say}" play=${play.length}首 immediate=${immediate} clearQueue=${shouldClear}${clearQueue !== shouldClear ? '(由immediate联动)' : ''}${playNext ? ' playNext=true' : ''} reason="${reason.slice(0, 60)}"`);

  if (shouldClear && runtime.queue.length > 0) {
    log.info(`🧹 清空旧队列（${runtime.queue.length} 首）`);
  }

  // 先收集解析好的歌，最后再由 mergePlay 决定插队头 (playNext) 还是追加队尾 (默认)
  const resolved = [];
  for (const p of play) {
    const meta = runtime.songPool.find(s => s.id === p.id);
    if (!meta) { log.warn(`claude 选了 id=${p.id} 但不在曲库里，跳过`); continue; }
    // 去重兜底：Claude 按理已经看不到这些 id，但它也可能 hallucinate
    if (runtime.current?.id === p.id) { log.warn(`${meta.name} 正在播，跳过去重`); continue; }
    if (runtime.queue.some(q => q.id === p.id)) { log.warn(`${meta.name} 已在队列，跳过去重`); continue; }
    if (resolved.some(r => r.id === p.id)) { log.warn(`${meta.name} 本批重复，跳过`); continue; }
    try {
      const { url } = await ncm.songUrl(p.id);
      if (!url) { log.warn(`${meta.name} 直链为空，跳过`); continue; }
      resolved.push({ ...meta, url, reason: p.reason });
    } catch (e) {
      log.warn(`拿不到 ${meta.name} 的直链:`, e.message);
    }
  }
  runtime.queue = mergePlay({ queue: runtime.queue, resolved, shouldClear, playNext });
  for (const s of resolved) log.info(`  ${playNext && !shouldClear ? '↑ 插队头' : '+ 入队'}: ${s.name}`);
  const enqueued = resolved.length;
  log.info(`📋 入队 ${enqueued}/${play.length} 首${playNext && !shouldClear ? '(队头)' : ''}，队列总长=${runtime.queue.length}，当前=${runtime.current?.name || 'null'}`);

  // 只在「用户主动说话」且 Claude 明确标记 immediate 时才触发串场过渡（打断当前歌曲）
  // queue_drain / startup / scheduler 等自动触发不允许打断，避免刚切过去的新歌被自己的 drain 回调截胡
  const transition = trigger === 'user' && immediate && enqueued > 0 && runtime.current != null;

  if (say) {
    state.addMessage('dj', say);
    let url = null;
    try {
      const t = await synth(say);
      if (t) url = ttsUrl(t.hash);
    } catch (e) {
      log.warn('TTS 失败:', e.message);
    }
    runtime.lastDjSay = { text: say, url, transition };
    broadcast('dj_say', runtime.lastDjSay);
  }

  // 如果现在没在播歌，自动从队列取一首推到 current
  if (!runtime.current && runtime.queue.length > 0) {
    runtime.current = runtime.queue.shift();
    log.info(`▶ 开播: ${runtime.current.name} — ${runtime.current.artists}`);
    broadcast('now_playing', runtime.current);
  }

  broadcast('queue', { queue: runtime.queue, current: runtime.current });
  return { say, play, immediate, reason, queued: runtime.queue.length, current: runtime.current };
}

async function handleSimpleCommand(action) {
  switch (action) {
    case 'next': {
      log.info(`⏭ next 命令：当前=${runtime.current?.name || 'null'}，队列长=${runtime.queue.length}`);

      // 队列空就先 await queue_drain 拿到新歌再切，避免 UI 进 STAND BY、autoplay 被浏览器拦
      if (runtime.queue.length === 0) {
        log.info('  队列空，同步 queue_drain 等 LLM 选歌...');
        await handleTriggerInner({ userInput: '', trigger: 'queue_drain' });
      }

      const prev = runtime.current;
      runtime.current = runtime.queue.shift() || null;
      log.info(`  → 切换后=${runtime.current?.name || 'null'}`);
      if (prev) state.recordPlay(prev, 'user_skip');
      broadcast('now_playing', runtime.current);

      // 切完队列又空了，后台再补（不阻塞响应）
      if (runtime.queue.length < 1) {
        handleTrigger({ trigger: 'queue_drain' }).catch(e => log.error(e));
      }
      return { action, current: runtime.current };
    }
    case 'pause':
      broadcast('playback', { cmd: 'pause' });
      return { action };
    case 'play':
      broadcast('playback', { cmd: 'play' });
      return { action };
  }
}

async function readPlaylistsConfig() {
  try {
    const raw = await fs.readFile(path.join(ROOT, 'user', 'playlists.json'), 'utf8');
    const cfg = JSON.parse(raw);
    const toIds = arr => Array.isArray(arr) ? arr.map(x => Number(x)).filter(Number.isFinite) : [];
    return {
      primary: toIds(cfg.primary_playlists),
      exclude: toIds(cfg.exclude_playlists),
    };
  } catch {
    return { primary: [], exclude: [] };
  }
}

async function refreshSongPool() {
  try {
    const { primary, exclude } = await readPlaylistsConfig();

    let sources;
    if (primary.length) {
      sources = await Promise.all(primary.map(id => ncm.playlistSongs(id).catch(() => [])));
    } else {
      sources = await Promise.all([
        ncm.likedSongs().catch(() => []),
        ncm.recentPlayed().catch(() => []),
        ncm.dailyRecommend().catch(() => []),
      ]);
    }

    const excludedIds = new Set();
    if (exclude.length) {
      const excludeLists = await Promise.all(exclude.map(id => ncm.playlistSongs(id).catch(() => [])));
      for (const list of excludeLists) for (const s of list) if (s) excludedIds.add(s.id);
    }

    // 合并去重
    const seen = new Set();
    const pool = [];
    for (const list of sources) {
      for (const s of list) {
        if (!s || seen.has(s.id) || excludedIds.has(s.id)) continue;
        seen.add(s.id);
        pool.push(s);
      }
    }
    runtime.songPool = pool;
    const src = primary.length ? `自定义歌单 ${primary.length} 个` : '红心+最近+推荐';
    const exc = exclude.length ? `, 排除 ${excludedIds.size} 首` : '';
    log.info(`🎵 曲库更新: ${pool.length} 首（${src}${exc}）`);
  } catch (e) {
    log.error('曲库更新失败:', e.message);
  }
}

// ---- HTTP API ----
app.get('/api/now', (_, res) => res.json({
  current: runtime.current,
  queue: runtime.queue,
  lastDjSay: runtime.lastDjSay,
  poolSize: runtime.songPool.length,
}));

app.get('/api/plan/today', async (_, res) => {
  const plan = state.getPref('today_plan', null);
  res.json({ plan });
});

app.get('/api/taste', async (_, res) => {
  // 暴露用户语料摘要（不含敏感）
  res.json({ poolSize: runtime.songPool.length });
});

app.post('/api/chat', async (req, res) => {
  try {
    const result = await handleTrigger({ userInput: String(req.body?.text || ''), trigger: 'user' });
    res.json(result);
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trigger', async (req, res) => {
  try {
    const result = await handleTrigger({ trigger: String(req.body?.trigger || 'manual') });
    res.json(result);
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 前端标记"这首播完了"
app.post('/api/advance', async (req, res) => {
  if (runtime.current) state.recordPlay(runtime.current, 'finished');
  runtime.current = runtime.queue.shift() || null;
  broadcast('now_playing', runtime.current);
  // 快没歌了就主动叫 DJ 选新的
  if (runtime.queue.length < 1) {
    handleTrigger({ trigger: 'queue_drain' }).catch(e => log.error(e));
  }
  res.json({ current: runtime.current });
});

// 前端预加载：偷看队列里下一首（不消费）
app.get('/api/peek-next', async (req, res) => {
  const next = runtime.queue[0] || null;
  if (!next) return res.json({ next: null });
  // 刷新直链，确保预加载拿到的 URL 不过期
  try {
    const { url } = await ncm.songUrl(next.id);
    res.json({ next: { ...next, url } });
  } catch (e) {
    res.json({ next });
  }
});

// 前端刷新单首歌的直链
app.get('/api/song-url/:id', async (req, res) => {
  try {
    const { url } = await ncm.songUrl(Number(req.params.id));
    res.json({ url });
  } catch (e) {
    res.json({ url: null, error: e.message });
  }
});

// 重新拿一首歌的直链（网易云直链会过期，前端可以调这个来重试）
app.get('/api/song-url/:id', async (req, res) => {
  try {
    const { url, br } = await ncm.songUrl(Number(req.params.id));
    res.json({ url, br });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get('/api/health', async (_, res) => {
  const login = await ncm.loginStatus();
  res.json({
    ok: true,
    ncm: await ncm.ping(),
    login,
    poolSize: runtime.songPool.length,
    queueSize: runtime.queue.length,
    mode: process.env.CLAUDE_MODE || 'cli',
    tts: ttsProvider(),
  });
});

// ---- Scheduler ----
// 两条规则：
//  1) 用户请求正在处理（LLM 在算）→ cron 跳过，避免并发请求打架
//  2) 用户说话后 AUTO_TRIGGER_COOLDOWN_MS 内 → cron 跳过，避免踩用户意图继续加歌
startScheduler({ onTrigger: ({ trigger }) => {
  if (runtime.userInFlight) {
    log.info(`⏸ 跳过自动触发 ${trigger}（用户请求正在处理中）`);
    return Promise.resolve();
  }
  const since = Date.now() - runtime.lastUserTriggerAt;
  if (since < AUTO_TRIGGER_COOLDOWN_MS) {
    log.info(`⏸ 跳过自动触发 ${trigger}（用户 ${Math.round(since / 1000)}s 前刚说话）`);
    return Promise.resolve();
  }
  return handleTrigger({ trigger });
}});

// ---- 启动 ----
server.listen(PORT, async () => {
  log.info(`🎙️ Claudio Radio 在 http://localhost:${PORT}`);
  log.info(`   CLAUDE_MODE = ${process.env.CLAUDE_MODE || 'cli'}`);

  if (!(await ncm.ping())) {
    log.warn('⚠️  NeteaseCloudMusicApi 没起来！另开一个终端跑 `npm run ncm`');
    return;
  }

  await refreshSongPool();
  if (runtime.songPool.length === 0) {
    log.warn('⚠️  曲库空的。检查 NETEASE_USER_ID 对不对、你的红心歌单是不是公开的。');
    return;
  }

  log.info('→ 让 DJ 开播第一首...');
  try {
    await handleTrigger({ trigger: 'startup' });
  } catch (e) {
    log.error('自动开播失败:', e.message);
    log.warn('  你可以手动在浏览器里对 DJ 说一句话来触发');
  }
});
