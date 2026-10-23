import { useTranslation } from 'react-i18next';
import { formatDate, timeLabel } from './i18n.js';
import { dateKeyStart } from './model.mjs';

export function ExportSummary({ summary }) {
  const { t } = useTranslation();
  if (!summary) return null;
  const startAt = dateKeyStart(summary.startDay);
  const endAt = dateKeyStart(summary.endDay);
  return <ul className="export-summary" id="export-summary" aria-label={t('settings.export.summary.label')}>
    <li>{t('settings.export.summary.exportedAt', { date: formatDate(summary.exportedAt), time: timeLabel(summary.exportedAt) })}</li>
    <li>{t('settings.export.summary.timeZone', { zone: summary.timeZone })}</li>
    {startAt !== null && endAt !== null && <li>{t('settings.export.summary.span', { start: formatDate(startAt), end: formatDate(endAt) })}</li>}
    <li>{t('settings.export.summary.sites', { total: summary.siteCount })}</li>
    <li>{t('settings.export.summary.dayRows', { total: summary.dayRows })}</li>
    {summary.includesSettings && <li>{t('settings.export.summary.settings')}</li>}
    {summary.appVersion && <li>{t('settings.export.summary.version', { version: summary.appVersion })}</li>}
  </ul>;
}
