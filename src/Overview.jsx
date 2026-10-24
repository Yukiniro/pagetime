import { useEffect, useState } from 'react';
import { ArrowRight, CaretDown, CaretRight } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { useTranslation } from 'react-i18next';
import { EmptyState, FilterEmpty } from './EmptyState.jsx';
import { iconForSite } from './data.js';
import { colorsFor } from './timeline-colors.mjs';
import { timelineSwatchesFor } from './theme.mjs';
import { DayHourChart, Heatmap, Timeline, Trend } from './Charts.jsx';
import { heatmapHasActivity } from './heatmap.mjs';
import { KpiCompare } from './KpiCompare.jsx';
import { SiteIcon } from './SiteIcon.jsx';
import { dayHourTotals } from './ledger-view.mjs';
import { duration, formatDate } from './i18n.js';
import { addDays, dateKey } from './model.mjs';
import { dayCount, timelineDay, timelineUsesHours } from './range.mjs';
import { focusSpans, focusSummary, timelineHasActivity, trendHasActivity } from './site-filter.mjs';
import { timelineCopy } from './timeline-copy.mjs';

const RANK_LIMIT = 8;

function byVisits(rows) {
  return [...rows].sort((a, b) => b.visits - a.visits || b.ms - a.ms || a.domain.localeCompare(b.domain));
}

function RankRows({ rows, metric, filterSite, onFilter, onOpen }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map(row => metric === 'visits' ? row.visits : row.ms));
  return <ol className="rank-list">
    {rows.map((row, index) => {
      const value = metric === 'visits' ? row.visits : row.ms;
      const share = Math.round(value * 100 / max);
      const icon = iconForSite(row.domain, row.hosts) || row.domain;
      const active = filterSite === row.domain;
      const time = duration(row.ms);
      const visits = t('records.count', { count: row.visits });
      return <li key={row.domain} className="rank-line">
        <span className="rank-position" aria-hidden="true">{index + 1}</span>
        <Button variant="ghost" className={active ? 'rank-row is-filtered' : 'rank-row'} aria-pressed={active} aria-label={t('ranking.filterSite', { domain: row.domain })} onClick={() => onFilter(row.domain)}>
          <span className="rank-bar" style={{ width: `${share}%` }} aria-hidden="true" />
          <span className="rank-main"><SiteIcon domain={icon} site={icon} /><span>{row.domain}</span></span>
          <span className="rank-metrics">
            <span className="rank-value">{metric === 'visits' ? row.visits : time}</span>
            <span className="rank-secondary">{metric === 'visits' ? time : visits}</span>
          </span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="rank-detail" aria-label={t('ranking.openDetail', { domain: row.domain })} onClick={event => onOpen(row.domain, event)}><CaretRight /></Button>
      </li>;
    })}
  </ol>;
}

export function Overview({ compare, preset, todayStats, stats, trendDays = [], spans, hourRows, since, start, end, today, now, rangeLabel, chartMode = 'timeline', trendLabel, filterSite = '', onFilter, openSite, onSelectDay, isDark = false }) {
  const { t } = useTranslation();
  const [chart, setChart] = useState(chartMode);
  const [metric, setMetric] = useState('visits');
  const [expanded, setExpanded] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  useEffect(() => { setChart(chartMode); }, [chartMode, start, end]);
  const rows = stats?.rows ?? [];
  const limit = expanded ? rows.length : RANK_LIMIT;
  const timeRows = rows.slice(0, limit);
  const rightRows = (metric === 'visits' ? byVisits(rows) : rows).slice(0, limit);
  const kpi = focusSummary(stats, filterSite);
  const todayKpi = focusSummary(todayStats, filterSite);
  const chartSpans = focusSpans(spans, filterSite);
  const filtered = Boolean(filterSite);
  const single = dayCount(start, end) === 1;
  const chartDay = timelineDay({ start, end }, today);
  const chartKpi = single ? kpi : todayKpi;
  const hoursMode = single && timelineUsesHours(chartDay, now);
  const hourBars = dayHourTotals(hourRows, dateKey(chartDay), filterSite);
  const showHours = !filtered || hourBars.some(row => row.ms > 0);
  const showTimeline = !filtered || timelineHasActivity(chartSpans, chartDay, addDays(chartDay, 1));
  const showTrend = !filtered || trendHasActivity(trendDays);
  const showHeatmap = !filtered || heatmapHasActivity(hourRows, start, end, since, today, filterSite);
  const swatches = timelineSwatchesFor(isDark);
  const colors = colorsFor(chartKpi?.rows ?? [], swatches);
  const legend = [...colors.keys()].filter(domain => colors.get(domain) !== swatches.other);
  const showOther = colors.size > legend.length;
  const chartDate = formatDate(chartDay, { month: 'long', day: 'numeric', weekday: 'long' });
  const caption = <p className="chart-caption">{chartDate}<span>·</span>{t('active', { duration: duration(chartKpi.ms) })}</p>;
  const copy = timelineCopy(chartDay, today);
  const timelineDate = copy.today ? '' : chartDate;
  const timelineTitle = t(copy.titleKey);
  const trendTitle = trendLabel || t('range.last7');
  const tabs = [['timeline', timelineTitle], ['trend', trendTitle]];

  return <div className="contents" data-status="ready">
    {filtered && <div className="filter-bar" role="status">
      <div className="filter-chip"><span>{t('filter.active', { domain: filterSite })}</span><Button variant="ghost" size="sm" onClick={() => onFilter('')}>{t('filter.clear')}</Button></div>
    </div>}
    <section className="kpi ledger-card" aria-label={t('kpi.label', { range: rangeLabel })}>
      <div className="kpi-item primary">
        <div className="kpi-label"><span>{t('ranking.activeTime')}</span></div>
        <div className="kpi-value">{duration(kpi.ms)}</div>
        <KpiCompare metric="ms" compare={compare} preset={preset} />
      </div>
      <div className="kpi-item">
        <div className="kpi-label">{t('ranking.visits')}</div>
        <div className="kpi-value">{kpi.visits}</div>
        <KpiCompare metric="visits" compare={compare} preset={preset} />
      </div>
      <div className="kpi-item">
        <div className="kpi-label">{t('kpi.sites')}</div>
        <div className="kpi-value">{kpi.rows.length}</div>
        <KpiCompare metric="sites" compare={compare} preset={preset} />
      </div>
    </section>
    <section className="chart-card ledger-card" aria-label={t('chart.label')}>
      <div className="chart-head">
        <h2 className="sr-only">{chart === 'timeline' ? timelineTitle : trendTitle}</h2>
        <div className="chart-tabs" role="tablist" aria-label={t('chart.label')}>
          {tabs.map(([key, label]) => <Button key={key} variant="ghost" size="sm" role="tab" id={`chart-tab-${key}`} className="chart-tab" aria-selected={chart === key} aria-controls="primary-chart" onClick={() => setChart(key)}>{label}</Button>)}
        </div>
      </div>
      <div id="primary-chart" role="tabpanel" aria-labelledby={`chart-tab-${chart}`} className="chart-panel">
        {chart === 'timeline' ? (hoursMode ? (showHours ? <>
          {caption}
          <DayHourChart hours={hourBars} isDark={isDark} />
        </> : <FilterEmpty domain={filterSite} onClear={() => onFilter('')} />) : (showTimeline ? <>
          {caption}
          <Timeline spans={chartSpans} day={chartDay} className="primary-timeline" lane={36} isDark={isDark} showEmpty labelKey={copy.labelKey} emptyKey={copy.emptyKey} date={timelineDate} colorOf={domain => colors.get(domain) ?? swatches.other} onSelectSite={openSite} />
          <div className="legend">{legend.map(domain => <Button variant="ghost" size="xs" key={domain} onClick={event => openSite(domain, event)}><i style={{ background: colors.get(domain) }} />{domain}</Button>)}{showOther && <span className="legend-other"><i style={{ background: swatches.other }} />{t('timeline.other')}</span>}</div>
        </> : <FilterEmpty domain={filterSite} onClear={() => onFilter('')} />)) : (showTrend ? <Trend days={trendDays} className="primary-trend" isDark={isDark} onSelectDay={onSelectDay} /> : <FilterEmpty domain={filterSite} onClear={() => onFilter('')} />)}
      </div>
    </section>
    <section className="rank-section" aria-label={t('ranking.title')}>
      {!rows.length ? (filtered ? <FilterEmpty className="ledger-card chart-empty" domain={filterSite} onClear={() => onFilter('')} title={t('filter.emptyRankingTitle')} description={t('filter.emptyRankingDescription', { domain: filterSite })} /> : <EmptyState className="ledger-card chart-empty" title={t('ranking.emptyTitle')} description={t('ranking.emptyDescription')} />) : <>
        <div className="rank-grid">
          <div className="rank-card ledger-card">
            <div className="rank-card-head"><h2>{t('ranking.title')}</h2><p>{rangeLabel}</p></div>
            <RankRows rows={timeRows} metric="time" filterSite={filterSite} onFilter={onFilter} onOpen={openSite} />
          </div>
          <div className="rank-card ledger-card">
            <div className="rank-card-head">
              <h2>{metric === 'visits' ? t('ranking.visitsTitle') : t('ranking.timeTitle')}</h2>
              <div className="metric-tabs" role="group" aria-label={t('ranking.metricLabel')}>
                <Button size="xs" variant={metric === 'visits' ? 'secondary' : 'ghost'} aria-pressed={metric === 'visits'} onClick={() => setMetric('visits')}>{t('ranking.visits')}</Button>
                <Button size="xs" variant={metric === 'time' ? 'secondary' : 'ghost'} aria-pressed={metric === 'time'} onClick={() => setMetric('time')}>{t('ranking.activeTime')}</Button>
              </div>
            </div>
            <RankRows rows={rightRows} metric={metric} filterSite={filterSite} onFilter={onFilter} onOpen={openSite} />
          </div>
        </div>
        {rows.length > RANK_LIMIT && <div className="table-footer"><Button variant="link" className="px-0" onClick={() => setExpanded(open => !open)}>{expanded ? t('ranking.collapse') : t('ranking.showAll', { count: rows.length })}<ArrowRight /></Button></div>}
      </>}
    </section>
    <section className="heatmap-fold ledger-card" aria-labelledby="active-hours-title">
      <Button variant="ghost" className="heatmap-toggle" aria-expanded={hoursOpen} aria-controls="active-hours-panel" onClick={() => setHoursOpen(open => !open)}>
        <span id="active-hours-title">{t('heatmap.title')}</span>
        <CaretDown className={hoursOpen ? 'heatmap-caret open' : 'heatmap-caret'} />
      </Button>
      {hoursOpen && <div id="active-hours-panel" className="heatmap-panel">{/* Hour cells are not a filter; filtering by hour is deferred. */}{showHeatmap ? <Heatmap rows={hourRows} site={filterSite} since={since} start={start} end={end} today={today} isDark={isDark} /> : <FilterEmpty domain={filterSite} onClear={() => onFilter('')} />}</div>}
    </section>
  </div>;
}
