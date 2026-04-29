// ============ Claudio 前端播放器 ============

const $ = id => document.getElementById(id);
const cover = $('cover');
const titleEl = $('title');
const artistEl = $('artist');
const status = $('status');
const btnPlay = $('btn-play');
const btnNext = $('btn-next');
const btnPrev = $('btn-prev');
const music = $('player-music');
const tts = $('player-tts');
const chatLog = $('chat-log');

let current = null;
let playing = false;
let lastSongId = null;   // detect real track transitions for event rows
let lastHour = null;     // insert hour-separators into chat log
let inTransition = false; // suppress WS now_playing during DJ transition

// Pending user-initiated chat. When set, the next DJ message (from either
// HTTP response.say OR WS dj_say) resolves this thinking bubble; subsequent
// ones fall through to a normal appended DJ bubble.
let pendingChat = null; // { thinkingBubble: HTMLElement } | null

// ========== Nothing UI 装饰: 时钟 / segbar ==========
const clockEl = $('clock');
function tickClock() {
  if (!clockEl) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}`;
}
tickClock();
setInterval(tickClock, 15_000);

// Segmented progress bar（48 格）
const segbarEl = $('segbar');
const SEG_N = 48;
if (segbarEl) {
  for (let i = 0; i < SEG_N; i++) segbarEl.appendChild(document.createElement('span'));
}
function renderSegbar(ratio) {
  if (!segbarEl) return;
  const cells = segbarEl.children;
  const filled = Math.max(0, Math.min(SEG_N, Math.round(ratio * SEG_N)));
  for (let i = 0; i < SEG_N; i++) {
    cells[i].classList.remove('on', 'hot');
    if (i < filled) cells[i].classList.add(i === filled - 1 ? 'hot' : 'on');
  }
}
renderSegbar(0);

// Time readout — cur on left of segbar, tot on right
const timeCurEl = $('time-cur');
const timeTotEl = $('time-tot');
function fmtDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function renderTimeReadout() {
  const cur = music.currentTime || 0;
  const tot = music.duration;
  if (timeCurEl) timeCurEl.textContent = fmtDuration(cur);
  if (timeTotEl) timeTotEl.textContent = isFinite(tot) && tot > 0 ? fmtDuration(tot) : '0:00';
}
renderTimeReadout();

setInterval(() => {
  if (!music.duration || !isFinite(music.duration) || music.duration === 0) return;
  renderSegbar(music.currentTime / music.duration);
  renderTimeReadout();
}, 500);

// ========== WebSocket ==========
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/stream`);
  ws.onopen = () => { status.textContent = 'ON AIR'; status.className = 'status on'; };
  ws.onclose = () => { status.textContent = 'OFFLINE'; status.className = 'status off'; setTimeout(connect, 3000); };
  ws.onmessage = e => {
    const { event, data } = JSON.parse(e.data);
    handleEvent(event, data);
  };
}

// 按钮内部图标 helper（因为 btn 里有 <span class="g">）
const btnIcon = (btn, glyph) => {
  const g = btn.querySelector('.g');
  if (g) g.textContent = glyph; else btn.textContent = glyph;
};

function handleEvent(event, data) {
  switch (event) {
    case 'now_playing':
      if (!inTransition) setCurrent(data);
      break;
    case 'dj_say': playDj(data); break;
    case 'queue': /* could show queue in UI */ break;
    case 'playback':
      if (data.cmd === 'pause') { music.pause(); playing = false; btnIcon(btnPlay, '▶'); cover.classList.remove('spinning'); }
      if (data.cmd === 'play')  { music.play();  playing = true;  btnIcon(btnPlay, '▮▮'); cover.classList.add('spinning'); }
      break;
  }
}

// ========== 播放 ==========
// 当 music.play() 被浏览器 autoplay policy 拦截时置 true，
// 页面任意地方下一次用户 gesture 会自动重新 play()。
let autoplayBlocked = false;
// 互斥：同一时刻只允许一个 play() 在飞，防止按钮点击同时被
// pointerdown 捕获监听器和 onclick 双重触发导致两个 play() 互相 abort。
let playInFlight = null;

function tryPlayMusic() {
  if (playInFlight) return playInFlight;
  playInFlight = music.play().then(
    () => { autoplayBlocked = false; },
    (err) => {
      console.warn('autoplay blocked:', err.message);
      autoplayBlocked = true;
    }
  ).finally(() => { playInFlight = null; });
  return playInFlight;
}

// 用户在页面任意地方 click / keydown 都尝试解锁（只要当前是 blocked 状态）
// 关键：跳过 player 控制按钮 —— 它们自己的 onclick 会处理。否则 pointerdown 捕获阶段会
// 先触发一次 play()，然后 click 阶段 btnPlay.onclick 发现 playing=true 又把它 pause 掉。
function resumeIfBlocked(e) {
  if (e && e.target && e.target.closest && e.target.closest('#btn-play, #btn-prev, #btn-next')) return;
  if (autoplayBlocked && music.src) tryPlayMusic();
}
document.addEventListener('pointerdown', resumeIfBlocked, true);
document.addEventListener('keydown', resumeIfBlocked, true);

function setCurrent(song) {
  current = song;
  if (!song) {
    titleEl.textContent = '—';
    artistEl.textContent = 'STAND BY — WAITING FOR SIGNAL';
    return;
  }

  // Only announce as an event when the song actually changed — not on initial load.
  const isNewTrack = lastSongId !== null && lastSongId !== song.id;
  lastSongId = song.id;

  titleEl.textContent = song.name;
  artistEl.textContent = song.artists;
  if (song.cover) cover.style.backgroundImage = `url(${song.cover})`;

  if (isNewTrack) appendTrackEvent(song);

  // 只有 URL 真的变了才重置 src —— 否则浏览器会 abort 正在进行的 load/play
  // (初始加载时 /api/now 和 WS now_playing 几乎同时到达，会各调一次 setCurrent)
  if (music.src !== song.url) {
    music.src = song.url;
    tryPlayMusic();
    // 清空预加载状态，为下一首做准备
    preloadedSong = null;
  }
}

async function playDj(data) {
  if (!data?.text) return;
  const hasTts = Boolean(data.url);

  if (pendingChat?.thinkingBubble?.isConnected) {
    resolveThinking(pendingChat.thinkingBubble, data.text, { tts: hasTts });
    pendingChat = null;
  } else {
    appendBubble('dj', data.text, { tts: hasTts });
  }

  if (data.transition) {
    // ---- 串场过渡：fade out → TTS → 短间隔 → 切歌 → 立刻恢复音量 ----
    // 如果正在另一次 transition 里，最多等 8s 让它收尾；超时就放弃这次（保持当前播放，不乱动音量）
    if (inTransition) {
      console.warn('[transition] 有另一次 transition 在跑，等它完成...');
      const waitStart = performance.now();
      while (inTransition && performance.now() - waitStart < 8000) {
        await sleep(150);
      }
      if (inTransition) { console.warn('[transition] 等 8s 前一次还没完，放弃本次切歌'); return; }
    }
    inTransition = true;
    // 防御：如果当前 music.volume < 0.5，说明可能还在 duck 或上一次 fade 没恢复，fallback 到 1.0
    const savedVol = music.volume >= 0.5 ? music.volume : 1.0;
    console.log('[transition] start, savedVol=', savedVol, 'music.volume=', music.volume);

    try {
      await fadeVolume(music, 0, FADE_DURATION);

      if (hasTts) {
        tts.src = data.url;
        try { await playAndWait(tts); } catch (e) { console.warn('TTS play fail:', e); }
      }

      await sleep(SEGUE_GAP);

      const res = await fetch('/api/advance', { method: 'POST' });
      const j = await res.json();
      if (j.current) {
        // 关键：在切 src 之前把音量先恢复，新歌一响就是正常音量（放弃 fade-in 效果，换 autoplay 稳定性）
        music.volume = savedVol;
        setCurrent(j.current);
        console.log('[transition] done, current=', j.current.name, 'music.volume=', music.volume);
      } else {
        music.volume = savedVol;
      }
    } catch (e) {
      console.warn('[transition] fail:', e);
      music.volume = savedVol;
    } finally {
      inTransition = false;
    }
  } else if (hasTts) {
    // ---- 普通 duck：压低音量说话，说完恢复 ----
    // 防御：若当前 music.volume < 0.5，说明上一次 duck 还没恢复（ended 未触发
    // 或被新 src 中断），直接读当前值会把"已被压低的音量"当成正常音量保存，
    // 之后 restore 反而把音量锁死在低位。此时 fallback 到 1.0。
    const savedVol = music.volume >= 0.5 ? music.volume : 1.0;
    music.volume = Math.max(TTS_DUCK_MIN, savedVol * TTS_DUCK_FACTOR);

    // 两种结束路径恢复音量：正常播完 / 播放出错。
    // 注意：不能监听 'abort' —— 设置 tts.src 时浏览器会自己 fire abort，
    // 会把本轮的 restore 提前触发，导致音乐瞬间被恢复、听起来像没 duck。
    // "被下一段 TTS 打断"的场景由新一轮 duck 分支里的 savedVol 防御 + 新一轮 ended 接管。
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      music.volume = savedVol;
    };
    tts.addEventListener('ended', restore, { once: true });
    tts.addEventListener('error', restore, { once: true });

    tts.src = data.url;
    try { await tts.play(); } catch (e) { console.warn('TTS play fail:', e); restore(); }
  }
}

// ---- 音频工具 ----
function fadeVolume(el, target, duration) {
  return new Promise(resolve => {
    const start = el.volume;
    const diff = target - start;
    if (Math.abs(diff) < 0.01) { el.volume = target; resolve(); return; }
    const t0 = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - t0) / duration);
      el.volume = start + diff * progress;
      if (progress < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}

function playAndWait(el) {
  return new Promise((resolve, reject) => {
    el.addEventListener('ended', resolve, { once: true });
    el.addEventListener('error', reject, { once: true });
    el.play().catch(reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========== 预加载下一首 ==========
const preloadAudio = new Audio();
preloadAudio.preload = 'auto';
let preloadedSong = null; // { id, url, ... }

async function preloadNext() {
  try {
    const res = await fetch('/api/peek-next');
    const { next } = await res.json();
    if (!next || !next.url) { preloadedSong = null; return; }
    if (preloadedSong?.id === next.id) return; // 已经在预加载了
    preloadedSong = next;
    preloadAudio.src = next.url;
    preloadAudio.load();
  } catch { preloadedSong = null; }
}

// 歌曲播放到最后 15 秒时开始预加载
music.addEventListener('timeupdate', () => {
  if (!music.duration || !isFinite(music.duration)) return;
  const remaining = music.duration - music.currentTime;
  if (remaining > 0 && remaining < 15 && !preloadedSong) {
    preloadNext();
  }
});

// ========== 控件 ==========
btnPlay.onclick = () => {
  if (playing) {
    music.pause();
    // state + icon flipped by the 'pause' event listener
  } else {
    // use tryPlayMusic so a rejected promise flips autoplayBlocked correctly,
    // and let the 'play' event listener own the state/icon transition
    tryPlayMusic();
  }
};
btnNext.onclick = () => say('换一首');
btnPrev.onclick = () => say('上一首');

music.addEventListener('play',  () => { playing = true;  btnIcon(btnPlay, '▮▮'); cover.classList.add('spinning'); });
music.addEventListener('pause', () => { playing = false; btnIcon(btnPlay, '▶');  cover.classList.remove('spinning'); });
music.addEventListener('ended', () => {
  // 确保是真正播完（至少播了 30 秒），而不是 URL 过期/加载失败
  if (music.currentTime > 30) {
    // 立刻开始 advance，同时利用预加载
    fetch('/api/advance', { method: 'POST' }).then(r => r.json()).then(j => setCurrent(j.current));
  } else {
    console.warn('歌曲过早结束 (', music.currentTime.toFixed(1), 's)，可能是 URL 过期，尝试刷新直链');
    retryCurrentSong();
  }
});

music.addEventListener('error', (e) => {
  console.warn('播放出错:', e);
  retryCurrentSong();
});

async function retryCurrentSong() {
  if (!current) return;
  try {
    const res = await fetch(`/api/song-url/${current.id}`);
    const { url } = await res.json();
    if (url) {
      music.src = url;
      music.play().catch(() => {});
    } else {
      // 拿不到就跳下一首
      fetch('/api/advance', { method: 'POST' }).then(r => r.json()).then(j => setCurrent(j.current));
    }
  } catch {
    fetch('/api/advance', { method: 'POST' }).then(r => r.json()).then(j => setCurrent(j.current));
  }
}

// ========== Autoscroll + "N NEW" pill ==========
const NEAR_BOTTOM_PX = 500;
const newPillEl = $('new-pill');
const newPillCountEl = $('new-pill-count');
let newPillCount = 0;

function isNearBottom() {
  if (!chatLog) return true;
  return (chatLog.scrollTop + chatLog.clientHeight) >= (chatLog.scrollHeight - NEAR_BOTTOM_PX);
}

function scrollToBottom(smooth = true) {
  if (!chatLog) return;
  chatLog.scrollTo({
    top: chatLog.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
  hidePill();
}

function showPillIncrement() {
  if (!newPillEl || !newPillCountEl) return;
  newPillCount += 1;
  newPillCountEl.textContent = String(newPillCount);
  newPillEl.hidden = false;
}

function hidePill() {
  newPillCount = 0;
  if (newPillCountEl) newPillCountEl.textContent = '0';
  if (newPillEl) newPillEl.hidden = true;
}

function maybeAutoscroll() {
  if (!chatLog) return;
  if (isNearBottom()) {
    requestAnimationFrame(() => scrollToBottom(true));
  } else {
    showPillIncrement();
  }
}

if (newPillEl) {
  newPillEl.addEventListener('click', () => scrollToBottom(true));
}
if (chatLog) {
  chatLog.addEventListener('scroll', () => {
    if (newPillEl && !newPillEl.hidden && isNearBottom()) hidePill();
  });
}

// ========== Chat log rendering ==========

// Burst grouping: same-sender consecutive messages within 60s share one row
// with a shared timestamp at the bottom.
const BURST_WINDOW_MS = 60_000;
const TTS_DUCK_FACTOR = 0.25;   // duck music to 25% while TTS plays
const TTS_DUCK_MIN = 0.1;       // floor (never below 10%)
const FADE_DURATION = 1500;      // fade in/out 时长 ms
const SEGUE_GAP = 300;           // TTS 结束后静默间隔 ms
let lastBurst = null; // { role, row, lastAt, timestampEl }

function appendBubble(role, text, opts = {}) {
  if (!chatLog) { console.error('chatLog not found'); return document.createElement('div'); }
  const now = Date.now();
  const nowDate = new Date(now);

  const inBurst =
    lastBurst &&
    lastBurst.role === role &&
    (now - lastBurst.lastAt) < BURST_WINDOW_MS &&
    lastBurst.row.isConnected;

  let row;
  if (inBurst) {
    row = lastBurst.row;
    if (lastBurst.timestampEl) {
      lastBurst.timestampEl.remove();
      lastBurst.timestampEl = null;
    }
  } else {
    maybeInsertHourSep();
    row = document.createElement('div');
    row.className = `chat-row ${role}`;
    chatLog.appendChild(row);
  }

  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  if (opts.variant === 'thinking') bubble.classList.add('thinking');
  if (opts.variant === 'error') bubble.classList.add('error');
  if (opts.tts && role === 'dj') bubble.classList.add('tts');
  bubble.textContent = text;
  row.appendChild(bubble);

  let timestampEl = null;
  if (opts.variant !== 'thinking') {
    timestampEl = document.createElement('div');
    timestampEl.className = 'timestamp';
    timestampEl.textContent = fmtTime(nowDate);
    row.appendChild(timestampEl);
  }

  // A thinking bubble should NOT update lastBurst — resolveThinking syncs
  // lastBurst when the thinking bubble resolves to a final state.
  if (opts.variant !== 'thinking') {
    lastBurst = { role, row, lastAt: now, timestampEl };
  }

  maybeAutoscroll();
  return bubble;
}

// Backwards-compat wrapper (callers that were using appendRow still work)
function appendRow(role, text, opts = {}) {
  return appendBubble(role, text, opts);
}

function fmtTime(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function maybeInsertHourSep() {
  if (!chatLog) return;
  const h = new Date().getHours();
  if (lastHour === h) return;
  lastHour = h;
  const sep = document.createElement('div');
  sep.className = 'chat-sep';
  sep.textContent = `${String(h).padStart(2, '0')}:00`;
  chatLog.appendChild(sep);
}

function appendTrackEvent(song) {
  if (!chatLog || !song) return;
  maybeInsertHourSep();
  const row = document.createElement('div');
  row.className = 'chat-row event';

  const card = document.createElement('div');
  card.className = 'chat-event';

  const cov = document.createElement('div');
  cov.className = 'ev-cover';
  if (song.cover) cov.style.backgroundImage = `url(${song.cover})`;

  const meta = document.createElement('div');
  meta.className = 'ev-meta';
  const label = document.createElement('div');
  label.className = 'ev-label';
  label.textContent = 'NOW PLAYING';
  const title = document.createElement('div');
  title.className = 'ev-title';
  title.textContent = song.name || '—';
  const sub = document.createElement('div');
  sub.className = 'ev-sub';
  sub.textContent = song.artists || '';
  meta.append(label, title, sub);

  card.append(cov, meta);
  row.appendChild(card);
  chatLog.appendChild(row);

  // Breaks burst grouping so any DJ bubble that follows starts fresh.
  lastBurst = null;

  maybeAutoscroll();
}

function resolveThinking(bubble, text, { error = false, tts = false } = {}) {
  if (!bubble || !bubble.isConnected) return;
  const row = bubble.parentElement;

  bubble.classList.remove('thinking');
  if (error) bubble.classList.add('error');
  if (tts) bubble.classList.add('tts');
  bubble.textContent = text;

  let ts = row.querySelector('.timestamp');
  if (ts) ts.remove();
  ts = document.createElement('div');
  ts.className = 'timestamp';
  ts.textContent = fmtTime(new Date());
  row.appendChild(ts);

  lastBurst = { role: 'dj', row, lastAt: Date.now(), timestampEl: ts };

  maybeAutoscroll();
}

// ========== 聊天 ==========
async function say(text) {
  if (!text || !text.trim()) return;
  // Use the user gesture to unlock music playback if autoplay was blocked earlier.
  if (music.paused && !music.ended && music.src) {
    music.play().catch(() => {});
  }
  appendBubble('user', text);

  // If an earlier request is still pending, resolve it as stale.
  if (pendingChat?.thinkingBubble?.isConnected) {
    resolveThinking(pendingChat.thinkingBubble, '—');
    pendingChat = null;
  }

  const thinkingBubble = appendBubble('dj', 'processing', { variant: 'thinking' });
  pendingChat = { thinkingBubble };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Simple command (next/pause/play) — no WS dj_say follows.
    if (data.action && (!data.say || data.say.length === 0)) {
      if (pendingChat?.thinkingBubble === thinkingBubble) {
        resolveThinking(thinkingBubble, `ok — ${data.action === 'next' ? 'next track' : data.action}`);
        pendingChat = null;
      }
      return;
    }

    // Brain reply with say: WS dj_say may arrive before or after HTTP. First
    // to reach the pending thinking bubble wins.
    if (data.say && pendingChat?.thinkingBubble === thinkingBubble) {
      resolveThinking(thinkingBubble, data.say, { tts: Boolean(data.url) });
      pendingChat = null;
      return;
    }

    if ((!data.say || data.say.length === 0) && pendingChat?.thinkingBubble === thinkingBubble) {
      resolveThinking(thinkingBubble, 'no reply');
      pendingChat = null;
    }
  } catch (err) {
    if (pendingChat?.thinkingBubble === thinkingBubble) {
      resolveThinking(thinkingBubble, err.message, { error: true });
      pendingChat = null;
    }
  }
}

const chatForm = $('chat-form');
const chatTextEl = $('chat-text');
if (chatForm && chatTextEl) {
  chatForm.onsubmit = e => {
    e.preventDefault();
    const t = chatTextEl.value;
    chatTextEl.value = '';
    say(t);
  };
}

// ========== 启动时拿一次 state ==========
fetch('/api/now').then(r => r.json()).then(j => {
  if (j.current) setCurrent(j.current);
  if (j.lastDjSay) appendRow('dj', j.lastDjSay.text, { tts: Boolean(j.lastDjSay.url) });
});

// ========== Placeholder rotation ==========
const PLACEHOLDERS = [
  'TYPE TO TALK TO DJ',
  'E.G. 太吵了',
  'E.G. MORE LIKE THIS',
  'E.G. 来点爵士',
  'E.G. PAUSE',
];
let placeholderIdx = 0;
let placeholderTimer = null;

function startPlaceholderRotation() {
  if (placeholderTimer) return;
  if (!chatTextEl) return;
  placeholderTimer = setInterval(() => {
    if (document.activeElement === chatTextEl) return;
    if (chatTextEl.value) return;
    placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
    chatTextEl.placeholder = PLACEHOLDERS[placeholderIdx];
  }, 15_000);
}
function stopPlaceholderRotation() {
  if (placeholderTimer) { clearInterval(placeholderTimer); placeholderTimer = null; }
}

if (chatTextEl) {
  chatTextEl.addEventListener('focus', stopPlaceholderRotation);
  chatTextEl.addEventListener('blur', startPlaceholderRotation);
  startPlaceholderRotation();
}

connect();
