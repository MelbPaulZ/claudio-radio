/**
 * NetEase Cloud Music 集成
 *
 * 前提：本机上要跑着 NeteaseCloudMusicApi
 *   git clone https://github.com/Binaryify/NeteaseCloudMusicApi
 *   cd NeteaseCloudMusicApi && npm install && node app.js
 * 默认监听 3000 端口。
 */

const BASE = process.env.NETEASE_API_URL || 'http://localhost:3000';
const UID = process.env.NETEASE_USER_ID;
// 从 .env 的 NETEASE_COOKIE 读取。从浏览器 Copy MUSIC_U=xxxxxxx 整条进来。
const COOKIE = (process.env.NETEASE_COOKIE || '').trim();

// 简单的内存缓存，避免重复请求
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function get(path, params = {}, useCache = true) {
  const allParams = { ...params, timestamp: useCache ? Math.floor(Date.now() / CACHE_TTL) : Date.now() };
  // NCM 支持把 cookie 从 query string 传进来，它会自动转成 Cookie 头
  if (COOKIE) allParams.cookie = COOKIE;
  const qs = new URLSearchParams(allParams);
  const url = `${BASE}${path}?${qs}`;
  const cacheKey = `${path}:${JSON.stringify(params)}`;

  if (useCache && cache.has(cacheKey)) {
    const { t, v } = cache.get(cacheKey);
    if (Date.now() - t < CACHE_TTL) return v;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NCM ${path} -> HTTP ${res.status}`);
  const json = await res.json();
  if (useCache) cache.set(cacheKey, { t: Date.now(), v: json });
  return json;
}

/** 验证 cookie 是否还有效 */
export async function loginStatus() {
  try {
    const res = await get('/login/status', {}, false);
    const profile = res?.data?.profile || res?.profile;
    if (profile?.userId) {
      return { loggedIn: true, userId: profile.userId, nickname: profile.nickname, vip: profile.vipType > 0 };
    }
    return { loggedIn: false };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

/** 用户所有公开歌单（第一个通常是红心） */
export async function userPlaylists(uid = UID) {
  const { playlist = [] } = await get('/user/playlist', { uid, limit: 50 });
  return playlist.map(p => ({
    id: p.id,
    name: p.name,
    trackCount: p.trackCount,
    coverImgUrl: p.coverImgUrl,
    creator: p.creator?.nickname,
    isHearted: p.specialType === 5, // 红心歌单的标志
  }));
}

/** 红心歌单的所有歌 */
export async function likedSongs(uid = UID) {
  const playlists = await userPlaylists(uid);
  const liked = playlists.find(p => p.isHearted);
  if (!liked) throw new Error('没找到红心歌单，检查 uid 是否正确');
  return playlistSongs(liked.id);
}

/** 拿一个歌单里的所有歌 */
export async function playlistSongs(id, limit = 500) {
  const { songs = [] } = await get('/playlist/track/all', { id, limit });
  return songs.map(normalizeSong);
}

/** 搜索歌曲 */
export async function searchSong(keywords, limit = 10) {
  const { result } = await get('/search', { keywords, limit, type: 1 }, false);
  return (result?.songs || []).map(s => ({
    id: s.id,
    name: s.name,
    artists: (s.artists || []).map(a => a.name).join(' / '),
    album: s.album?.name,
    duration: s.duration,
  }));
}

/** 拿一首歌的直链 URL（会过期，每次播放前要拿新的） */
export async function songUrl(id, br = 320000) {
  const { data } = await get('/song/url/v1', { id, level: 'exhigh' }, false);
  const item = data?.[0];
  if (!item?.url) throw new Error(`歌曲 ${id} 拿不到直链（可能需要会员）`);
  // 过滤掉 30 秒试听版：freeTrialInfo 非 null，或者 time 明显比全曲短
  if (item.freeTrialInfo) {
    throw new Error(`歌曲 ${id} 只有 30 秒试听（需要网易云会员）`);
  }
  return { url: item.url, br: item.br, size: item.size, type: item.type, time: item.time };
}

/** 批量拿歌曲详情（补齐元数据） */
export async function songDetail(ids) {
  if (!ids || ids.length === 0) return [];
  const { songs = [] } = await get('/song/detail', { ids: ids.join(',') });
  return songs.map(normalizeSong);
}

/** 歌词 */
export async function lyric(id) {
  const res = await get('/lyric', { id });
  return {
    lrc: res?.lrc?.lyric || '',
    tlyric: res?.tlyric?.lyric || '',
  };
}

/** 每日推荐（基于听歌行为，比 taste.md 更动态） */
export async function dailyRecommend() {
  // 需要登录态。如果没登录，改用 personalized
  try {
    const { data } = await get('/recommend/songs', {}, false);
    return (data?.dailySongs || []).map(normalizeSong);
  } catch {
    const { result } = await get('/personalized/newsong', {}, false);
    return (result || []).map(s => normalizeSong(s.song));
  }
}

/** 基于一首歌找相似 */
export async function similarSongs(id) {
  const { songs = [] } = await get('/simi/song', { id });
  return songs.map(normalizeSong);
}

/** 最近听过 */
export async function recentPlayed(uid = UID, limit = 50) {
  try {
    const { data } = await get('/user/record', { uid, type: 1 }, false); // 1=最近一周
    return (data?.weekData || []).slice(0, limit).map(r => ({
      ...normalizeSong(r.song),
      playCount: r.playCount,
    }));
  } catch {
    return [];
  }
}

function normalizeSong(s) {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    artists: (s.ar || s.artists || []).map(a => a.name).join(' / '),
    album: (s.al || s.album)?.name,
    cover: (s.al || s.album)?.picUrl,
    duration: s.dt || s.duration,
  };
}

/** 检查 NCM 服务是否起来了 */
export async function ping() {
  try {
    const res = await fetch(`${BASE}/`);
    return res.ok;
  } catch {
    return false;
  }
}
