import test from 'node:test';
import assert from 'node:assert/strict';

// Note: calendar/index.js dispatches based on env + process.platform.
// We test by manipulating process.env (platform mocking is harder in Node;
// for the darwin branch we rely on macos.js own behavior on actual macOS,
// and for the empty branch we verify non-darwin returns []).

test('calendar/index.js: no CALENDAR_ICS_URL on non-darwin → []', async (t) => {
  if (process.platform === 'darwin') {
    t.skip('darwin branch tested via macos.js fallback');
    return;
  }
  delete process.env.CALENDAR_ICS_URL;
  const { todayEvents } = await import(`../src/calendar/index.js?t=${Date.now()}`);
  const events = await todayEvents();
  assert.deepEqual(events, []);
});

test('calendar/index.js: CALENDAR_ICS_URL fetch failure → falls through to platform fallback', async () => {
  // Use a bogus URL to force ics.js to throw
  process.env.CALENDAR_ICS_URL = 'http://127.0.0.1:1/does-not-exist.ics';
  try {
    const { todayEvents } = await import(`../src/calendar/index.js?t=${Date.now()}`);
    const events = await todayEvents();
    // On non-darwin: falls through to []
    // On darwin: falls through to macos.js (could be anything)
    assert.equal(Array.isArray(events), true);
  } finally {
    delete process.env.CALENDAR_ICS_URL;
  }
});

test('calendar/index.js: re-exports calendarText from macos.js', async () => {
  const mod = await import(`../src/calendar/index.js?t=${Date.now()}`);
  assert.equal(typeof mod.calendarText, 'function');
});

test('calendar/index.js: calendarText handles empty array', async () => {
  const { calendarText } = await import(`../src/calendar/index.js?t=${Date.now()}`);
  assert.equal(calendarText([]), '今天日历空的');
});
