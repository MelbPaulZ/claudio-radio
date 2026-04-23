/**
 * 启动本地 NeteaseCloudMusicApi 服务
 * 第一次跑会自动 clone 和 npm install
 */
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NCM_DIR = path.join(__dirname, '..', '.ncm');

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

if (!existsSync(NCM_DIR)) {
  console.log('→ 第一次启动，正在 clone NeteaseCloudMusicApi...');
  await run('git', ['clone', '--depth=1', 'https://github.com/ZhangDo/NeteaseCloudMusicApi', NCM_DIR]);
  // lock 文件中部分 resolved URL 指向 npmmirror，删掉让 npm 从官方源重新解析
  const lockFile = path.join(NCM_DIR, 'package-lock.json');
  if (existsSync(lockFile)) unlinkSync(lockFile);
  console.log('→ 安装依赖（可能要等一会）...');
  await run('npm', ['install', '--omit=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org/'], { cwd: NCM_DIR });
}

// 默认让 NCM 跑在 3335，让出常用的 3000 端口给别的 dev 项目。
// 可通过 NCM_PORT 环境变量覆盖。
const NCM_PORT = process.env.NCM_PORT || '3335';
console.log(`→ 启动 NCM 服务 @ http://localhost:${NCM_PORT}`);
await run('node', ['app.js'], { cwd: NCM_DIR, env: { ...process.env, PORT: NCM_PORT } });
