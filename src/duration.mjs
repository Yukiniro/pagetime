// Shared by the dashboard (`src/i18n.js`) and the toolbar badge. The service worker cannot load `i18n.js`:
// that module starts react-i18next and writes `document` on language changes.
export function formatDuration(ms, t) {
  if (ms < 60_000) return ms ? t('duration.underMinute') : t('duration.minutes', { count: 0 });
  const mins = Math.floor(ms / 60_000);
  return mins >= 60 ? t('duration.hours', { hours: Math.floor(mins / 60), minutes: mins % 60 }) : t('duration.minutes', { count: mins });
}
