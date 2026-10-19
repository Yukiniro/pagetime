import { useState } from 'react';
import { ArrowRight, CaretDown, CaretRight, GlobeHemisphereWest, Info } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@app/components/ui/empty';
import { useTranslation } from 'react-i18next';
import { colorOf, iconForSite } from './data.js';
import { Heatmap, Timeline, Trend } from './Charts.jsx';
import { SiteIcon } from './SiteIcon.jsx';
import { duration, formatDate } from './i18n.js';
import { focusSpans, focusSummary, timelineHasActivity, trendHasActivity } from './site-filter.mjs';

const RANK_LIMIT = 8;

function FilterEmpty({ domain }) {
  const { t } = useTranslation();
  return <Empty className="chart-empty"><EmptyHeader><EmptyMedia><GlobeHemisphereWest size={32} /></EmptyMedia><EmptyTitle>{t('filter.emptyTitle')}</EmptyTitle><EmptyDescription>{t('filter.emptyDescription', { domain })}</EmptyDescription></EmptyHeader></Empty>;
}

function byVisits(rows) {
  return [...rows].sort((a, b) => b.visits - a.visits || b.ms - a.ms || a.domain.localeCompare(b.domain));
}

function RankRows({ rows, metric, filterSite, onFilter, onOpen }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map(row => metric === 'visits' ? row.visits : row.ms));
  return <ol className="rank-list">
    {rows.map(row => {
      const value = metric === 'visits' ? row.visits : row.ms;
      const share = Math.round(value * 100 / max);
      const icon = iconForSite(row.domain, row.hosts) || row.domain;
      const active = filterSite === row.domain;
      return <li key={row.domain} className="rank-line">
        <Button variant="ghost" className={active ? 'rank-row is-filtered' : 'rank-row'} aria-pressed={active} aria-label={t('ranking.filterSite', { domain: row.domain })} onClick={() => onFilter(row.domain)}>
          <span className="rank-bar" style={{ width: `${share}%` }} aria-hidden="true" />
          <span className="rank-main"><SiteIcon domain={icon} site={icon} /><span>{row.domain}</span></span>
          <span className="rank-value">{metric === 'visits' ? row.visits : duration(row.ms)}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="rank-detail" aria-label={t('ranking.openDetail', { domain: row.domain })} onClick={event => onOpen(row.domain, event)}><CaretRight /></Button>
      </li>;
    })}
  </ol>;
}

export function Overview({ todayStats, stats, weekDays = [], spans, hourRows, since, start, end, today, now, rangeLabel, filterSite = '', onFilter, openSite, openHow }) {
  const { t } = useTranslation();
  const [chart, setChart] = useState('timeline');
  const [metric, setMetric] = useState('visits');
  const [expanded, setExpanded] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const rows = stats?.rows ?? [];
  const limit = expanded ? rows.length : RANK_LIMIT;
  const timeRows = rows.slice(0, limit);
  const rightRows = (metric === 'visits' ? byVisits(rows) : rows).slice(0, limit);
  const kpi = focusSummary(todayStats, filterSite);
  const chartSpans = focusSpans(spans, filterSite);
  const filtered = Boolean(filterSite);
  const showTimeline = !filtered || timelineHasActivity(chartSpans, today, end);
  const showTrend = !filtered || trendHasActivity(weekDays);
  const legend = (kpi?.rows ?? []).filter(row => row.ms).slice(0, 5);
  const tabs = [['timeline', t('timeline.title')], ['trend', t('range.lastDays', { count: 7 })]];

  return <>
    {filtered && <div className="filter-bar" role="status">
      <div className="filter-chip"><span>{t('filter.active', { domain: filterSite })}</span><Button variant="ghost" size="sm" onClick={() => onFilter('')}>{t('filter.clear')}</Button></div>
    </div>}
    <section className="kpi ledger-card" aria-label={t('kpi.label')}>
      <div className="kpi-item primary">
        <div className="kpi-label"><span>{t('ranking.activeTime')}</span><span className="kpi-today">{t('range.today')}</span><Button variant="ghost" size="icon-sm" aria-label={t('howItWorks.infoButton')} onClick={openHow}><Info /></Button></div>
        <div className="kpi-value">{duration(kpi.ms)}</div>
      </div>
      <div className="kpi-item">
        <div className="kpi-label">{t('ranking.visits')}</div>
        <div className="kpi-value">{kpi.visits}</div>
      </div>
      <div className="kpi-item">
        <div className="kpi-label">{t('kpi.sites')}</div>
        <div className="kpi-value">{kpi.rows.length}</div>
      </div>
    </section>
    <section className="chart-card ledger-card" aria-label={t('chart.label')}>
      <div className="chart-head">
        <h2>{chart === 'timeline' ? t('timeline.title') : t('range.lastDays', { count: 7 })}</h2>
        <div className="chart-tabs" role="tablist" aria-label={t('chart.label')}>
          {tabs.map(([key, label]) => <Button key={key} variant="ghost" size="sm" role="tab" id={`chart-tab-${key}`} className="chart-tab" aria-selected={chart === key} aria-controls="primary-chart" onClick={() => setChart(key)}>{label}</Button>)}
        </div>
      </div>
      <div id="primary-chart" role="tabpanel" aria-labelledby={`chart-tab-${chart}`} className="chart-panel">
        {chart === 'timeline' ? (showTimeline ? <>
          <p className="chart-caption">{formatDate(now, { month: 'long', day: 'numeric', weekday: 'long' })}<span>·</span>{t('active', { duration: duration(kpi.ms) })}</p>
          <Timeline spans={chartSpans} className="primary-timeline" lane={36} />
          <div className="legend">{legend.map(row => <Button variant="ghost" size="xs" key={row.domain} onClick={event => openSite(row.domain, event)}><i style={{ background: colorOf(row.domain) }} />{row.domain}</Button>)}<span className="idle-legend"><i />{t('timeline.idle')}</span></div>
        </> : <FilterEmpty domain={filterSite} />) : (showTrend ? <Trend days={weekDays} className="primary-trend" /> : <FilterEmpty domain={filterSite} />)}
      </div>
    </section>
    <section className="rank-section" aria-label={t('ranking.title')}>
      {!rows.length ? <Empty className="ledger-card"><EmptyHeader><EmptyMedia><GlobeHemisphereWest size={32} /></EmptyMedia><EmptyTitle>{t('ranking.emptyTitle')}</EmptyTitle><EmptyDescription>{t('ranking.emptyDescription')}</EmptyDescription></EmptyHeader></Empty> : <>
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
      {hoursOpen && <div id="active-hours-panel" className="heatmap-panel"><p>{t('heatmap.caption')}</p>{/* Hour cells are not a filter; filtering by hour is deferred. */}<Heatmap rows={hourRows} since={since} start={start} end={end} today={today} /></div>}
    </section>
  </>;
}
