import { addDays, dateKey, midnight, splitByHour } from './model.mjs';
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

// Pieces whose clipped [from, to) overlaps this local clock hour on `day`.
// The hour buckets are the same ones the ledger stores, so a piece that only
// touches the next hour at its end stays out, and one that crosses the hour stays in.
// `start` / `end` are ignored: overlap is only `from` / `to`.
export function sessionsOverlappingHour(pieces, day, hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return [];
  const date = dateKey(midnight(day));
  const matched = [];
  for (const piece of pieces ?? []) {
    if (splitByHour(piece?.from, piece?.to).some(part => part.date === date && part.hour === hour)) matched.push(piece);
  }
  return matched;
}

// Null when this day is past detail retention: the block is not rendered.
// Today keeps the existing copy. Any other day uses the dated keys.
export function daySessionCopy(day, now) {
  if (timelineUsesHours(day, now)) return null;
  if (midnight(day) === midnight(now)) return { today: true, titleKey: 'detail.todaySessions', emptyKey: 'detail.noSessions' };
  return { today: false, titleKey: 'detail.daySessions', emptyKey: 'detail.noDaySessions' };
}
