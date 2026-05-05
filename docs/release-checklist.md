# Release smoke checklist

Run before every `vX.Y.Z` tag push. Aim: ~10 minutes.

Pre-flight:

- [ ] `npm test` 全绿
- [ ] CI on `main` branch is green (Actions tab)
- [ ] Local `docker compose up -d` runs against `:dev` images cleanly

In a fresh directory (`mkdir /tmp/release-smoke && cd /tmp/release-smoke`):

- [ ] `curl -O https://raw.githubusercontent.com/MelbPaulZ/claudio-radio/main/compose.yml`
- [ ] `curl -O https://raw.githubusercontent.com/MelbPaulZ/claudio-radio/main/.env.example`
- [ ] `mv .env.example .env`，填上真实 key（NETEASE / VOLC / OPENWEATHER / ANTHROPIC）
- [ ] `mkdir -p data cache user` 并复制你常用的 `user/*.md`
- [ ] `docker compose pull`（拿到 `:latest` 镜像）
- [ ] `docker compose up -d`
- [ ] 浏览器开 `http://localhost:8787`，验证 DJ 串词出现 / 歌能播 / 天气对
- [ ] CLAUDE_MODE 切换：编辑 .env → `CLAUDE_MODE=cli`，取消注释 `~/.claude` volume，重启 → 验证可用
- [ ] CALENDAR_ICS_URL：填一个真实 ICS URL，重启 → 验证今日日程出现在 DJ 串词
- [ ] `docker compose down && docker compose up -d` 三次循环 → 验证 state / cache / user 数据零丢失
- [ ] `docker pull --platform linux/amd64 melbpaulz/claudio-radio:latest`（如果你在 arm64）
- [ ] 找一台 amd64 的机器或开个 GCE 实例，重复上述 up + /health 验证

清理：

- [ ] `docker compose down`
- [ ] `cd /tmp && rm -rf release-smoke`

通过后：

- [ ] `git tag vX.Y.Z` && `git push origin vX.Y.Z`
- [ ] 等 GitHub Actions release.yml 完成（约 10-15 min）
- [ ] 检查 Docker Hub 两个 repo 的 tag 都齐
- [ ] 自己再 `docker compose pull && up -d` 一次（用真实 :vX.Y.Z），确认线上版可跑
