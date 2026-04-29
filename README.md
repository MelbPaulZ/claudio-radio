# Claudio Radio

你的个人 AI 音乐电台。Claude 做大脑、网易云负责选歌、火山引擎豆包 TTS 做 DJ 配音、macOS 日历 + OpenWeather 做环境感知。

架构参考：@秒秒Guo 的 [Claudio 施工图](https://www.xiaohongshu.com/)。本仓库是一个可直接运行的 Node.js 实现。

## 你将得到什么
- 一个浏览器播放器 (http://localhost:8787)
- Claude 根据你的网易云红心歌单 + 品味语料选歌，像真 DJ 一样串场
- 早 7 点 / 9 点 / 下午 1 点 / 傍晚 6 点 / 夜里 10 点自动触发不同风格的"节目"
- 每小时脉冲检查、可以用自然语言跟 DJ 聊天（"太吵了换一首"、"来点爵士"）
- 天气和今天的日程会被 DJ 夹杂到串词里

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
