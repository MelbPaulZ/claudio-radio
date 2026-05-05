import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fmt(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function startIcsServer() {
  const fixture = await fs.readFile(path.join(__dirname, 'fixtures', 'sample.ics'), 'utf8');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const body = fixture
    .replaceAll('__TODAY__', fmt(today))
    .replaceAll('__TOMORROW__', fmt(tomorrow));

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/calendar' });
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return server;
}

test('ics: fetches and parses today events from URL', async () => {
  const server = await startIcsServer();
  const port = server.address().port;
  process.env.CALENDAR_ICS_URL = `http://127.0.0.1:${port}/test.ics`;
  // Bust cache by re-importing
  const mod = await import(`../src/calendar/ics.js?t=${Date.now()}`);
  try {
    const events = await mod.todayEvents();
    assert.equal(Array.isArray(events), true);
    // Should include "今日会议" and "Lunch with Alice", not tomorrow's standup
    const titles = events.map(e => e.title);
    assert.ok(titles.includes('今日会议'), `expected 今日会议 in ${JSON.stringify(titles)}`);
    assert.ok(titles.includes('Lunch with Alice'), `expected Lunch with Alice in ${JSON.stringify(titles)}`);
    assert.ok(!titles.includes('Tomorrow standup'), `tomorrow event should be filtered out`);
  } finally {
    delete process.env.CALENDAR_ICS_URL;
    await new Promise(r => server.close(r));
  }
});

test('ics: time field formatted as HH:MM', async () => {
  const server = await startIcsServer();
  const port = server.address().port;
  process.env.CALENDAR_ICS_URL = `http://127.0.0.1:${port}/test.ics`;
  const mod = await import(`../src/calendar/ics.js?t=${Date.now()}`);
  try {
    const events = await mod.todayEvents();
    for (const e of events) {
      assert.match(e.time, /^\d{2}:\d{2}$/, `time should be HH:MM, got "${e.time}"`);
    }
  } finally {
    delete process.env.CALENDAR_ICS_URL;
    await new Promise(r => server.close(r));
  }
});

test('ics: missing CALENDAR_ICS_URL → throws clear error', async () => {
  delete process.env.CALENDAR_ICS_URL;
  const mod = await import(`../src/calendar/ics.js?t=${Date.now()}`);
  await assert.rejects(() => mod.todayEvents(), /CALENDAR_ICS_URL/);
});
