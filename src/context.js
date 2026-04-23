/**
 * 提示词组装 —— Claudio 架构里"第三层"最关键的组件
 *
 * 每次触发，把六片信息拼成一个 prompt 扔给 Claude：
 *   1. 系统提示词（DJ 人设）
 *   2. 用户语料（taste / routines / mood-rules / playlists）
 *   3. 环境（天气 / 日历 / 当前时间）
 *   4. 已检索记忆（最近播放 / 对话历史）
 *   5. 用户输入 / 工具结果
 *   6. 执行轨迹（scheduler / webhook 触发）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state } from './state.js';
import { weather, weatherText } from './weather/openweather.js';
import { todayEvents, calendarText } from './calendar/macos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function readSafe(p) {
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
}

export async function build({ userInput = '', trigger = 'user', songPool = [], nowPlaying = null, queue = [] } = {}) {
  const [persona, taste, routines, moodRules, playlistsJson] = await Promise.all([
    readSafe(path.join(ROOT, 'prompts', 'dj-persona.md')),
    readSafe(path.join(ROOT, 'user', 'taste.md')),
    readSafe(path.join(ROOT, 'user', 'routines.md')),
    readSafe(path.join(ROOT, 'user', 'mood-rules.md')),
    readSafe(path.join(ROOT, 'user', 'playlists.json')),
  ]);

  const [w, events] = await Promise.all([
    weather().catch(() => null),
    todayEvents().catch(() => []),
  ]);
  const now = new Date();
  const nowText = `${['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]} ${now.toTimeString().slice(0, 5)}`;

  const recentPlays = state.recentPlays(10);
  const recentMsgs = state.recentMessages(8);

  // ----- 拼 prompt -----
  const parts = [];

  // 1. 系统提示词 + 人设
  parts.push(`# 人设\n${persona}`);

  // 2. 用户语料
  parts.push(`# 用户品味 (taste.md)\n${taste.trim() || '(空)'}`);
  parts.push(`# 作息 (routines.md)\n${routines.trim() || '(空)'}`);
  parts.push(`# 情绪规则 (mood-rules.md)\n${moodRules.trim() || '(空)'}`);

  // 3. 环境
  parts.push(`# 环境
现在: ${nowText}
天气: ${weatherText(w) || '(未配置)'}
今日日程: ${calendarText(events)}`);

  // 4. 记忆
  if (recentPlays.length) {
    parts.push(
      `# 过去一小时播放历史（不要重复这些）\n${recentPlays
        .map(p => `- [${new Date(p.played_at).toTimeString().slice(0, 5)}] ${p.name} — ${p.artists}`)
        .join('\n')}`
    );
  }
  if (recentMsgs.length) {
    parts.push(
      `# 最近对话\n${recentMsgs.map(m => `${m.role === 'user' ? '👤' : '🎙️'} ${m.content}`).join('\n')}`
    );
  }

  // 5. 当前可选歌曲池（排除当前在播 + 已排队的歌，避免 Claude 选出重复）
  const excludedIds = new Set([
    ...(nowPlaying ? [nowPlaying.id] : []),
    ...queue.map(s => s.id),
  ]);
  const availablePool = songPool.filter(s => !excludedIds.has(s.id));
  if (availablePool.length) {
    parts.push(
      `# 当前曲库（只能从这里面选 id；正在播和已排队的歌已经自动剔除）\n${availablePool
        .slice(0, 80)
        .map(s => `- ${s.id} | ${s.name} — ${s.artists}`)
        .join('\n')}`
    );
  }

  // 6. 当前播放状态（Claude 决定是否切歌 / 清空队列的依据）
  const queuePreview = queue.slice(0, 5)
    .map(s => `- ${s.id} | ${s.name} — ${s.artists}`)
    .join('\n');
  const queueMore = queue.length > 5 ? `\n  ... 还有 ${queue.length - 5} 首` : '';
  parts.push(`# 当前播放状态
此刻在播: ${nowPlaying ? `${nowPlaying.name} — ${nowPlaying.artists}` : '(空闲)'}
队列里还有 ${queue.length} 首（按播放顺序）:
${queuePreview || '(空)'}${queueMore}

你的 play[] 默认**追加到队列尾**。这意味着：如果队列里已经排着别的歌，你选的歌要等它们播完才轮到。
三种覆盖默认行为的方式：
- clearQueue=true → 先清空旧队列再加 play（用户要"换方向"时）
- immediate=true → 立刻打断当前这首并清队列（用户明确要换歌时；服务端会自动兜底 clearQueue）
- playNext=true → 插入到队头，不打断当前、保留后面的队列（用户让你"推荐一首"时，确保推荐的歌下一首就播）`);

  // 7. 触发和输入
  parts.push(`# 本次触发\n类型: ${trigger}\n${userInput ? `用户说: "${userInput}"` : '（自动触发，没有用户输入）'}`);

  parts.push(`# 输出要求
严格 JSON: {"say":"...","play":[{"id":N,"reason":"..."}],"immediate":false,"clearQueue":false,"playNext":false,"reason":"..."}
- immediate: 只在用户明确要求切歌时为 true（立刻打断当前这首）。immediate=true 时服务端会自动按 clearQueue=true 处理。
- clearQueue: 如果你想让自己的 play[] 真的下一首就播（覆盖旧排队），设为 true；只是想"再加几首到队列"时设为 false。
- playNext: 当用户让你**推荐/挑/猜**一首而你给出了具体的一首歌作为回答时设为 true —— 把你的 play[] 插到队头，确保下一首就是它，但保留后面已排的歌。这时 **say 里要点明"下一首就是它"**，别让用户以为只是排到队尾了。
除了 JSON，什么都不要输出。`);

  return parts.join('\n\n---\n\n');
}
