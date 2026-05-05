# Claudio Radio

你的个人 AI 音乐电台。Claude 做大脑、网易云负责选歌、火山引擎豆包 TTS 做 DJ 配音、macOS 日历 + OpenWeather 做环境感知。

架构参考：@秒秒Guo 的 [Claudio 施工图](https://www.xiaohongshu.com/)。本仓库是一个可直接运行的 Node.js 实现。

## 你将得到什么
- 一个浏览器播放器 (http://localhost:8787)
- Claude 根据你的网易云红心歌单 + 品味语料选歌，像真 DJ 一样串场
- 早 7 点 / 9 点 / 下午 1 点 / 傍晚 6 点 / 夜里 10 点自动触发不同风格的"节目"
- 每小时脉冲检查、可以用自然语言跟 DJ 聊天（"太吵了换一首"、"来点爵士"）
- 天气和今天的日程会被 DJ 夹杂到串词里

## 怎么选：Docker 还是裸跑？

| 场景 | 推荐 |
|---|---|
| **macOS 上自己日常用** | **裸跑**（`npm run dev`）— 直接用 macOS 日历 + Keychain 里的 Claude Code Max 订阅 |
| **想分发给别人 / 给朋友演示** | Docker —— 一行 `docker compose up` 就跑起来 |
| **想 24h 跑（小服务器 / 树莓派 / VPS）** | Docker |
| **Linux 桌面或服务器自用** | Docker（cli 模式 + Max 订阅都能完整 work）|
| **Windows + WSL2** | 都行；Docker Desktop 体验更好 |
| **中国大陆服务器** | Docker + `LLM_PROVIDER=doubao`（豆包），用国产 LLM 替代 Anthropic |

简单说：**Docker 是分发与服务器路径，不是 Mac 上日常开发的优选**。Mac 上自用直接看下方 [运行前准备](#运行前准备) 章节。

---

## Docker 部署（分发 / 服务器场景）

**前置**：Docker Desktop 或 Docker Engine + `docker compose` v2。

```bash
# 1. 准备目录
mkdir claudio && cd claudio

# 2. 拿模板
curl -O https://raw.githubusercontent.com/MelbPaulZ/claudio-radio/main/compose.yml
curl -O https://raw.githubusercontent.com/MelbPaulZ/claudio-radio/main/.env.example

# 3. 填 key
mv .env.example .env
# 编辑 .env，按里面的注释填 NETEASE / VOLC / OPENWEATHER / ANTHROPIC（如果用 api 模式）

# 4. 准备目录（持久化数据）
mkdir -p data cache user

# 5. （可选）复制你的品味文档到 user/
# 没有的话，DJ 用默认人格也能跑

# 6. 起！
docker compose up -d

# 浏览器打开 http://localhost:8787
```

### LLM_PROVIDER：选择 DJ 大脑

| Provider | 适用场景 | 怎么填 .env | compose.yml 调整 |
|---|---|---|---|
| `claude-cli`（默认）| 本机用 Max 订阅 | `LLM_PROVIDER=claude-cli` | 取消注释 `- ~/.claude:/home/node/.claude:ro` 那行；宿主机要先 `claude login` 过 |
| `claude-api` | Anthropic HTTP（境外服务器或想按 token 计费） | `LLM_PROVIDER=claude-api` + `ANTHROPIC_API_KEY=...` | 不用动 |
| `doubao` | **中国大陆部署推荐**——Anthropic 不可达时 | `LLM_PROVIDER=doubao` + `DOUBAO_API_KEY=...` | 不用动 |

申请豆包 API key：https://console.volcengine.com/ark

> ⚠️ **`claude-cli` 模式仅在 Linux 宿主上可用**。macOS 上 Claude Code 把 OAuth token 存在系统 Keychain 里，不在 `~/.claude/`，挂载进容器拿不到凭证。Mac 用户如果想用 Max 订阅，请用[裸跑模式](#运行前准备)；想用 Docker 就走 `claude-api` 或 `doubao`。

> ℹ️ 旧字段 `CLAUDE_MODE` 已废弃（v0.2.0 起）。迁移：`cli` → `claude-cli`，`api` → `claude-api`。启动会 fail-fast 给迁移提示。

### 升级与回滚

```bash
# 升级到最新
docker compose pull && docker compose up -d

# 锁定到某个版本：在 .env 里写
CLAUDIO_VERSION=v0.1.0
docker compose pull && docker compose up -d
```

### 常见问题

- **报 `数据目录不可写 / Data directory not writable`**：Linux 宿主上挂载目录必须能被容器内的 `node` 用户（uid 1000）写。`mkdir -p data cache user` 之后跑一句 `sudo chown -R 1000:1000 data cache user` 即可。macOS / Windows + Docker Desktop 通常自动处理；只有 Linux 直接装 Docker / Podman rootful 时会遇到
- **DJ 自动开播报 `claude exit 1`（cli 模式）**：容器找不到 Claude Code 凭证。检查 `~/.claude:/home/node/.claude:ro` 这行有没有取消注释。**macOS 用户该路径无效**（凭证在 Keychain 里），改用 `CLAUDE_MODE=api` 或者 macOS 上直接裸跑
- **8787 端口被占了**：编辑 `compose.yml`，把 `"8787:8787"` 改成 `"8788:8787"`，浏览器开 `:8788`
- **日历没了**：Docker 容器看不到 macOS 日历。设 `CALENDAR_ICS_URL` 为 Google/iCloud 日历的 ICS 订阅链接即可恢复
- **想看日志**：`docker compose logs -f claudio`
- **想清缓存**：`rm -rf cache/tts/*`，下次 DJ 串词会重新合成
- **数据迁移**：`data/`、`cache/`、`user/` 三个目录整体打包就是全部状态。注意 `data/state.db` 必须连同 `state.db-shm` 和 `state.db-wal` 一起拷
- **只暴露在内网**：把 `compose.yml` 的 `"8787:8787"` 改成 `"127.0.0.1:8787:8787"`

---

## 运行前准备

**1. 装 Node.js 20+**
```bash
node --version  # 需要 >= 20
```

**2. 装 Claude Code CLI**（如果你用 CLI 模式，推荐）
跟 Anthropic 官方文档走一遍: https://docs.claude.com/claude-code
装完 `claude --version` 能跑就行。

**3. 拿几个 API key**
- **火山引擎豆包 TTS**（DJ 配音）: https://console.volcengine.com/speech/ → 实名认证 → 开通"语音合成大模型" → 应用管理拿 AppID + Access Token
- **OpenWeather**（天气）: https://openweathermap.org/api → 免费 key
- **Anthropic API key**（可选）: 只在不想用 Claude Code CLI 时才需要

**4. macOS 用户（日程功能）**：推荐装 icalBuddy
```bash
brew install ical-buddy
```
没装也能跑，只是日程读取会走 AppleScript 兜底。

## 首次启动

```bash
cd claudio-radio
npm install
cp .env.example .env
# 按 .env 里的注释填好你的 key
```

`.env` 里必填的几项（标了 `[必填]`）：
- `NETEASE_USER_ID` —— 你的网易云用户 ID
- `NETEASE_COOKIE` —— 网易云登录 cookie，没有只能拿到 30 秒试听
- `VOLC_APPID` / `VOLC_ACCESS_TOKEN` —— 火山 TTS 凭证
- `OPENWEATHER_API_KEY` —— 天气 API
- 其它按注释走即可

**分两个终端启动：**

终端 1（网易云 API 代理，要常驻）：
```bash
npm run ncm
```
第一次跑会自动 clone + install，后续就是一句 `node app.js`。

终端 2（Claudio 主服务）：
```bash
npm run dev
```

打开浏览器：http://localhost:8787

## 填好你的人设（这是 DJ 灵魂）

`user/` 目录里放了 `*.example.md` 模板，先复制成正式文件再填：

```bash
cp user/taste.example.md      user/taste.md
cp user/routines.example.md   user/routines.md
cp user/mood-rules.example.md user/mood-rules.md
cp user/playlists.example.json user/playlists.json
```

然后编辑这几个文件。越详细，DJ 选歌越贴：
- `user/taste.md` —— 你的音乐品味、你喜欢的和不能忍的
- `user/routines.md` —— 你一天的节奏
- `user/mood-rules.md` —— 一些硬性规则
- `user/playlists.json` —— 想额外纳入选歌池的歌单 ID（留空也可以）

⚠️ 正式文件已被 `.gitignore` —— 你的品味偏好不会被 commit 出去。

## 自测工具

```bash
node scripts/test-netease.js   # 验证网易云链通了吗，你的红心拉到了吗
node scripts/test-claude.js    # 验证 Claude 能正常返回 DJ 响应
node scripts/test-tts.js "你好世界"   # 验证火山 TTS 合成成功
```

## 目录结构

```
claudio-radio/
├── src/
│   ├── server.js              # HTTP + WebSocket 主服务
│   ├── router.js              # 意图分流：简单指令 vs 走 claude
│   ├── context.js             # 六片 prompt 组装
│   ├── claude.js              # Claude 大脑适配器（CLI / API 双模式）
│   ├── tts.js                 # 火山引擎豆包 TTS + 缓存
│   ├── scheduler.js           # 节律调度（cron）
│   ├── state.js               # SQLite 持久化
│   ├── log.js
│   ├── music/netease.js       # 网易云 API 封装
│   ├── weather/openweather.js
│   └── calendar/macos.js
├── prompts/
│   └── dj-persona.md          # DJ 人设 system prompt（可自由修改）
├── user/                      # 你的品味语料（gitignored，不会泄漏）
├── web/                       # PWA 前端（单页）
├── scripts/                   # 各种测试脚本 + NCM 启动器
├── cache/tts/                 # TTS 合成缓存
└── state.db                   # SQLite (自动生成)
```

## 常见问题

**Q: 某些歌拿不到直链？**
A: 网易云的版权音乐需要登录会员。在 NCM 容器内用 phone 或 qrkey 登录一次就可以了。

**Q: DJ 选歌怪怪的？**
A: 把 `user/taste.md` 写细一点。特别是"让我此刻就想按播放的五张专辑"这种具体信息。

**Q: 能不能连到家里的音响？**
A: 原版用 UPnP 推到 Naim 功放。本实现先做浏览器版，后续可以加 `src/music/upnp.js` 模块对接 `node-ssdp` + `upnp-device-client`。

**Q: 想换别的情绪 / DJ 风格？**
A: 改 `prompts/dj-persona.md`，这是 DJ 的灵魂。

**Q: 换个音色？或者换 TTS 厂商？**
A: 换音色改 `.env` 里的 `VOLC_VOICE`（音色 ID 在火山控制台"音色管理"里查）。换厂商要重写 `src/tts.js` 里的 `synth()` 实现，保持返回 `{hash, file, cached}` 接口不变即可，上游无需改动。

## 接下来可以做什么

- [ ] UPnP 推到家庭音响
- [ ] 飞书 / Outlook 日历集成
- [ ] 每日 email 摘要
- [ ] 可视化"今天的心情曲线"
- [ ] 手机端 PWA 图标和离线缓存
