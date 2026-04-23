/**
 * macOS 本地日历集成
 *
 * 推荐用 icalBuddy（更干净的输出）：
 *   brew install ical-buddy
 * 没装也能用 AppleScript 兜底。
 *
 * 只读。Claudio 不会动你的日历。
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);

let cache = { t: 0, v: null };
const TTL = 5 * 60 * 1000;

export async function todayEvents() {
  if (process.platform !== 'darwin') return [];
  if (Date.now() - cache.t < TTL && cache.v) return cache.v;

  try {
    // 优先 icalBuddy
    const { stdout } = await execAsync(
      `icalBuddy -ps "| • |" -b "" -nc -nrd -iep "title,datetime" -tf "%H:%M" eventsToday`,
      { timeout: 3000 }
    );
    const events = stdout
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        // 格式: "• 标题 • 09:00 - 10:00"
        const parts = l.split('•').map(s => s.trim()).filter(Boolean);
        return { title: parts[0] || l, time: parts[1] || '' };
      });
    cache = { t: Date.now(), v: events };
    return events;
  } catch {
    // 兜底：AppleScript 直接读 Calendar.app
    try {
      const script = `
        set output to ""
        tell application "Calendar"
          set todayStart to (current date) - (time of (current date))
          set todayEnd to todayStart + 1 * days
          repeat with cal in calendars
            repeat with evt in (every event of cal whose start date is greater than or equal to todayStart and start date is less than todayEnd)
              set output to output & (summary of evt) & "|" & ((start date of evt) as string) & return
            end repeat
          end repeat
        end tell
        return output
      `;
      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "\\'")}'`, { timeout: 5000 });
      const events = stdout
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
          const [title, when] = l.split('|');
          return { title, time: (when || '').split(' at ')[1] || when };
        });
      cache = { t: Date.now(), v: events };
      return events;
    } catch {
      return [];
    }
  }
}

export function calendarText(events) {
  if (!events || events.length === 0) return '今天日历空的';
  return events.map(e => `${e.time || '全天'} ${e.title}`).join('；');
}
