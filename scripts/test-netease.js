/**
 * 测试网易云集成是否通
 * 用法: node scripts/test-netease.js
 */
import 'dotenv/config';
import { ping, userPlaylists, likedSongs, songUrl, searchSong } from '../src/music/netease.js';

const UID = process.env.NETEASE_USER_ID;

console.log('→ 测试 NCM 连通性...');
if (!(await ping())) {
  console.error('❌ NCM 服务没起来。先跑 `npm run ncm` 或 `node app.js` 把 NeteaseCloudMusicApi 起来。');
  process.exit(1);
}
console.log('✅ NCM 在线');

console.log(`\n→ 拉用户 ${UID} 的公开歌单...`);
const pls = await userPlaylists();
console.log(`✅ ${pls.length} 个歌单：`);
pls.slice(0, 5).forEach(p => console.log(`   [${p.isHearted ? '❤️ ' : '  '}] ${p.name} (${p.trackCount} 首)`));

console.log('\n→ 拿红心歌单前 5 首...');
try {
  const liked = await likedSongs();
  console.log(`✅ 红心共 ${liked.length} 首：`);
  liked.slice(0, 5).forEach(s => console.log(`   - ${s.name} — ${s.artists}`));
  if (liked[0]) {
    console.log(`\n→ 拿第一首的直链...`);
    const { url, br } = await songUrl(liked[0].id);
    console.log(`✅ ${br}kbps: ${url.slice(0, 80)}...`);
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
}

console.log('\n→ 搜索测试："孙燕姿"...');
const hits = await searchSong('孙燕姿', 3);
hits.forEach(s => console.log(`   - ${s.name} — ${s.artists}`));
