/**
 * Unified calendar entry point.
 * Priority: CALENDAR_ICS_URL → macOS native (icalBuddy/osascript) → empty array.
 *
 * Inside Docker container, process.platform is 'linux' so the darwin branch
 * is skipped — only ICS or empty applies.
 */
import { todayEvents as icsEvents } from './ics.js';
import { todayEvents as macosEvents, calendarText } from './macos.js';
import { log } from '../log.js';

export async function todayEvents() {
  if (process.env.CALENDAR_ICS_URL) {
    try {
      return await icsEvents();
    } catch (e) {
      log.warn('ICS calendar fetch failed, falling through:', e.message);
    }
  }

  if (process.platform === 'darwin') {
    return macosEvents();
  }

  return [];
}

export { calendarText };
