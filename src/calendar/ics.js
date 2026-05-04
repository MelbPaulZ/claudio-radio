/**
 * ICS URL calendar source. Cross-platform — works in Docker container.
 * Fetches the URL set in CALENDAR_ICS_URL, parses with node-ical,
 * and returns today's events in the same shape as macos.js: [{title, time}].
 */
import ical from 'node-ical';

const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache = { t: 0, v: null, src: '' };

function pad(n) { return String(n).padStart(2, '0'); }

function isToday(d) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return d >= start && d < end;
}

export async function todayEvents() {
  const url = process.env.CALENDAR_ICS_URL;
  if (!url) throw new Error('CALENDAR_ICS_URL not set');

  if (Date.now() - cache.t < TTL_MS && cache.v && cache.src === url) {
    return cache.v;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let body;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`ICS fetch HTTP ${res.status}`);
    body = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const parsed = ical.sync.parseICS(body);
  const events = [];
  for (const k of Object.keys(parsed)) {
    const ev = parsed[k];
    if (ev.type !== 'VEVENT') continue;
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
    if (!isToday(start)) continue;
    const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    events.push({ title: String(ev.summary || '').trim() || '(无标题)', time });
  }
  events.sort((a, b) => a.time.localeCompare(b.time));

  cache = { t: Date.now(), v: events, src: url };
  return events;
}
