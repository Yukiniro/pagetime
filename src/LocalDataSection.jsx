import { Trans, useTranslation } from 'react-i18next';
import { LEDGER_NAME } from './ledger.mjs';
import { DETAIL_TABLES } from './local-data.mjs';
import { formatBytes, formatDate, formatNumber } from './i18n.js';

function Item({ label, children, note }) {
  return <div className="flex flex-col gap-1">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="m-0 text-[15px] font-medium text-(--ink-strong)">{children}</dd>
    {note && <dd className="m-0 text-[13px] leading-relaxed text-muted-foreground">{note}</dd>}
  </div>;
}

export function LocalDataSection({ data }) {
  const { t } = useTranslation();
  const { overview, usage, legacy } = data;
  const day = at => at === null ? t('settings.localData.none') : formatDate(at);
  return <section className="setting-row" aria-labelledby="local-data"><div className="min-w-0 flex-1">
    <h2 id="local-data">{t('settings.localData.title')}</h2>
    <p>{t('settings.localData.description')}</p>
    <p><Trans i18nKey="settings.localData.location" values={{ name: LEDGER_NAME }} components={{ code: <code /> }} /></p>
    <dl className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2">
      <Item label={t('settings.localData.since')}>{day(overview.since)}</Item>
      <Item label={t('settings.localData.firstDay')}>{day(overview.firstDay)}</Item>
      <Item label={t('settings.localData.detail')} note={<>
        {t('settings.localData.detailNote')}
        {overview.firstDetail !== null && <><br />{t('settings.localData.firstDetail', { date: formatDate(overview.firstDetail) })}</>}
      </>}>{t('settings.localData.detailValue', { count: overview.detailDays, date: formatDate(overview.detailFrom) })}</Item>
      <Item label={t('settings.localData.sites')}>{t('settings.localData.sitesValue', { count: overview.sites, n: formatNumber(overview.sites) })}</Item>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <dt className="text-sm text-muted-foreground">{t('settings.localData.rows')}</dt>
        <dd className="m-0"><ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
          {DETAIL_TABLES.map(name => <li key={name} className="flex flex-col rounded-md border border-(--line) px-3 py-2">
            <strong className="text-[17px] font-semibold text-(--ink-strong) tabular-nums">{formatNumber(overview.rows[name])}</strong>
            <span className="text-[13px] text-muted-foreground">{t(`settings.localData.table.${name}`)} · <code>{name}</code></span>
          </li>)}
        </ul></dd>
      </div>
      {usage !== null && <Item label={t('settings.localData.usage')} note={t('settings.localData.usageNote')}>{t('settings.localData.about', { size: formatBytes(usage) })}</Item>}
      {legacy !== null && <Item label={t('settings.localData.legacy')} note={<Trans i18nKey="settings.localData.legacyNote" components={{ code: <code /> }} />}>{t('settings.localData.about', { size: formatBytes(legacy) })}</Item>}
    </dl>
  </div></section>;
}
