import { addDays, midnight } from './model.mjs';
import { timelineUsesHours } from './range.mjs';

// The slice of each session that falls on this local day. A session that crosses
// midnight keeps only this day's part. A session with no overlap is left out,
// so the list never shows a start of 00:00 with a negative duration.
export function clipDaySessions(sessions, day) {
  const start = midnight(day);
  const end = addDays(start, 1);
  const pieces = [];
  for (const session of sessions ?? []) {
    const from = Math.max(start, session.start);
    const to = Math.min(end, session.end);
    if (!(to > from)) continue;
    pieces.push({ domain: session.domain, site: session.site, start: session.start, end: session.end, from, to });
  }
  return pieces;
}

// Null when this day is past detail retention: the block is not rendered.
// Today keeps the existing copy. Any other day uses the dated keys.
export function daySessionCopy(day, now) {
  if (timelineUsesHours(day, now)) return null;
  if (midnight(day) === midnight(now)) return { today: true, titleKey: 'detail.todaySessions', emptyKey: 'detail.noSessions' };
  return { today: false, titleKey: 'detail.daySessions', emptyKey: 'detail.noDaySessions' };
}
