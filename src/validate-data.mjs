// Validate at storage/message boundaries. Invalid records stay untouched for recovery.
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
const domain = value => {
  if (typeof value !== 'string' || !value || /[/?#@\s]/.test(value)) return false;
  try { return new URL(`https://${value}`).hostname === value; }
  catch { return false; }
};

export function validateData(value) {
  if (!value || typeof value !== 'object' ||
      typeof value.enabled !== 'boolean' || !timestamp(value.since) ||
      !Array.isArray(value.visits) || !Array.isArray(value.spans) ||
      !value.visits.every(visit => visit && domain(visit.domain) && timestamp(visit.at)) ||
      !value.spans.every(span => span && domain(span.domain) && timestamp(span.start) && timestamp(span.end) && span.end > span.start)) {
    throw new Error('data');
  }
  return value;
}
