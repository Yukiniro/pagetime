import { useTranslation } from 'react-i18next';
import { formatDate, formatNumber, timeLabel } from './i18n.js';
import { dateKeyStart } from './model.mjs';

export function BackupSummary({ summary }) {
  const { t } = useTranslation();
  if (!summary) return null;
  const startAt = dateKeyStart(summary.startDay);
  const endAt = dateKeyStart(summary.endDay);
  const rows = [
    ['exportedAt', summary.exportedAt === null
      ? t('settings.export.backup.unknown')
      : t('settings.export.backup.at', { date: formatDate(summary.exportedAt), time: timeLabel(summary.exportedAt) })],
    ['format', formatNumber(summary.schemaVersion)],
    ['span', startAt === null || endAt === null
      ? t('settings.export.backup.none')
      : t('settings.export.backup.range', { start: formatDate(startAt), end: formatDate(endAt) })],
    ['sites', formatNumber(summary.rows.domains)],
    ['days', formatNumber(summary.rows.days)],
    ['hours', formatNumber(summary.rows.hours)],
    ['spans', formatNumber(summary.rows.spans)],
    ['visits', formatNumber(summary.rows.visits)],
    ['settings', t(summary.includesSettings ? 'settings.export.backup.included' : 'settings.export.backup.missing')],
  ];
  if (summary.appVersion) rows.push(['version', summary.appVersion]);
  return <section className="backup-summary" aria-labelledby="backup-summary-title">
    <h3 id="backup-summary-title">{t('settings.export.backup.label')}</h3>
    <dl>
      {rows.map(([key, value]) => <div key={key} data-field={key}><dt>{t(`settings.export.backup.${key}`)}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}
