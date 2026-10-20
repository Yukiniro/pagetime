import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { duration, formatDate, signedPercent, timeLabel } from './i18n.js';
import { addDays } from './model.mjs';

const UNDER_MINUTE = 60_000;
const day = at => formatDate(at, { month: '2-digit', day: '2-digit' });

function periodName(t, preset) {
  if (preset === 'today') return t('compare.yesterday');
  if (preset === '7d') return t('compare.previous7');
  if (preset === '30d') return t('compare.previous30');
  return t('compare.previousPeriod');
}

function changeText(t, metric, { diff, percent }) {
  if (diff === 0) return t('compare.unchanged');
  const sign = diff > 0 ? '+' : '−';
  const size = Math.abs(diff);
  const amount = metric !== 'ms' ? `${sign}${size}` : size < UNDER_MINUTE ? t('compare.underMinute', { sign }) : `${sign}${duration(size)}`;
  return percent === null ? amount : t('compare.change', { diff: amount, percent: signedPercent(percent) });
}

// Neutral by design: one ink colour, no direction colouring, no wording about better or worse.
export function KpiCompare({ metric, compare, preset, since }) {
  const { t } = useTranslation();
  if (!compare) return null;
  const { window, summary } = compare;
  const change = summary[metric];
  const name = periodName(t, preset);
  const label = window.cutoff === null ? name : t('compare.asOf', { period: name, time: timeLabel(window.cutoff) });
  const first = window.period.start;
  const last = addDays(window.period.end, -1);
  const range = first === last ? day(first) : `${day(first)}–${day(last)}`;
  const basis = window.cutoff === null
    ? t('compare.basis', { range })
    : t('compare.basisAsOf', { range, time: timeLabel(window.cutoff) });
  const reason = change.reason && t(`compare.reason.${change.reason}`, { date: formatDate(since, { month: '2-digit', day: '2-digit' }) });
  return <Tooltip>
    <TooltipTrigger render={<p className="kpi-compare" tabIndex={0} data-compare={metric} />}>
      <span className="kpi-compare-label">{label}</span>
      <span className="kpi-compare-change">{change.reason ? '—' : changeText(t, metric, change)}</span>
      {reason && <span className="kpi-compare-reason">{reason}</span>}
    </TooltipTrigger>
    <TooltipContent>{basis}</TooltipContent>
  </Tooltip>;
}
