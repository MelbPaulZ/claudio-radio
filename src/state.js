/**
 * 状态持久化（SQLite）
 * 存：最近播放 / DJ 说话历史 / 今天的计划 / 用户偏好
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.STATE_DB_PATH || path.join(__dirname, '..', 'state.db');

// Ensure parent dir exists and is writable. In Docker, /app/data is bind-mounted;
// if the host owner doesn't grant write access, fail fast with a clear message
// rather than the cryptic SQLITE_READONLY later.
const DB_DIR = path.dirname(DB_PATH);
try {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const probe = path.join(DB_DIR, '.write-probe');
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
} catch (e) {
  process.stderr.write(`\n[fatal] 数据目录不可写 / Data directory not writable: ${DB_DIR}\n`);
  process.stderr.write(`        ${e.message}\n`);
  process.stderr.write(`        请检查权限（Docker 用户：宿主目录归属 uid 1000）\n`);
  process.stderr.write(`        Check permissions (Docker users: host dir must be writable by uid 1000)\n\n`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    name TEXT,
    artists TEXT,
    played_at INTEGER NOT NULL,
    source TEXT,
    reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_plays_time ON plays(played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_plays_song ON plays(song_id);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created_at DESC);

  CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );
`);

export const state = {
  recordPlay(song, source = 'dj', reason = '') {
    db.prepare(
      `INSERT INTO plays (song_id, name, artists, played_at, source, reason) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(song.id, song.name, song.artists, Date.now(), source, reason);
  },

  recentPlays(limit = 30) {
    return db.prepare(`SELECT * FROM plays ORDER BY played_at DESC LIMIT ?`).all(limit);
  },

  /** 检查一首歌过去 N 小时有没有播过 */
  playedWithin(songId, hours = 24) {
    const since = Date.now() - hours * 3600 * 1000;
    const row = db.prepare(`SELECT 1 FROM plays WHERE song_id = ? AND played_at > ? LIMIT 1`).get(songId, since);
    return !!row;
  },

  addMessage(role, content) {
    db.prepare(`INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`).run(role, content, Date.now());
  },

  recentMessages(limit = 20) {
    return db
      .prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .reverse();
  },

  setPref(key, value) {
    db.prepare(
      `INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, typeof value === 'string' ? value : JSON.stringify(value), Date.now());
  },

  getPref(key, fallback = null) {
    const row = db.prepare(`SELECT value FROM prefs WHERE key = ?`).get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  },
};
