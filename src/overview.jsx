import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, CaretDown, CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@app/components/ui/input-group';
import { useTranslation } from 'react-i18next';
import { indicatorFrame, nextTabKey, reducedMotion, retarget } from './retarget-motion.mjs';
import { useSettle } from './use-retarget.js';
import { EmptyState, FilterEmpty } from './empty-state.jsx';
import { iconForSite } from './data.js';
import { Heatmap, Trend } from './charts.jsx';
import { heatmapHasActivity } from './heatmap.mjs';
import { KpiCompare } from './kpi-compare.jsx';
import { SiteIcon } from './site-icon.jsx';
import { duration } from './i18n.js';
import { focusSummary, trendHasActivity } from './site-filter.mjs';
import { formatSiteShare, SITE_LEDGER_LIMIT, siteShareWidth, visibleSites } from './site-ledger.mjs';
import { SiteShareChart } from './site-share-chart.jsx';

function RankRows({ rows, total, filterSite, onFilter, onOpen }) {
  const { t } = useTranslation();
  return <ol className="rank-list">
    {rows.map((row, index) => {
      const icon = iconForSite(row.domain, row.hosts) || row.domain;
      const active = filterSite === row.domain;
      const metricsId = `rank-metrics-${index}`;
      return <li key={row.domain} className="rank-line">
        <span className="rank-position" aria-hidden="true">{index + 1}</span>
        <Button variant="ghost" className={active ? 'rank-row is-filtered' : 'rank-row'} aria-pressed={active} aria-describedby={metricsId} aria-label={t('ranking.filterSite', { domain: row.domain })} onClick={() => onFilter(row.domain)}>
          <span className="rank-bar" style={{ width: `${siteShareWidth(row.ms, total)}%` }} aria-hidden="true" />
          <span className="rank-main"><SiteIcon domain={icon} site={icon} /><span>{row.domain}</span></span>
          <span className="rank-metrics" id={metricsId}>
            <span className="rank-value">{duration(row.ms)}</span>
            <span className="rank-share">{formatSiteShare(row.ms, total)}</span>
            <span className="rank-secondary">{t('records.count', { count: row.visits })}</span>
          </span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="rank-detail" aria-label={t('ranking.openDetail', { domain: row.domain })} onClick={event => { event.stopPropagation(); onOpen(row.domain, event); }}><CaretRight /></Button>
      </li>;
    })}
  </ol>;
}

function chartKey(mode) {
  return mode === 'trend' ? 'trend' : 'share';
}

export function Overview({ compare, preset, stats, trendDays = [], hourRows, since, start, end, today, rangeLabel, chartMode = 'share', trendLabel, filterSite = '', onFilter, openSite, onSelectDay, isDark = false }) {
  const { t } = useTranslation();
  const [chart, setChart] = useState(() => chartKey(chartMode));
  const [metric, setMetric] = useState('time');
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [hoursOpen, setHoursOpen] = useState(false);
  const figuresRef = useSettle(`${start}:${end}:${filterSite}`);
  const tabsRef = useRef(null);
  const markRef = useRef(null);
  const seenTab = useRef(null);
  const focusChart = useRef(false);
  useEffect(() => { setChart(chartKey(chartMode)); }, [chartMode, start, end]);
  const rows = stats?.rows ?? [];
  const total = stats?.ms ?? 0;
  const ledger = visibleSites(rows, { metric, query, expanded });
  const canToggle = !query.trim() && rows.length > SITE_LEDGER_LIMIT;
  const kpi = focusSummary(stats, filterSite);
  const filtered = Boolean(filterSite);
  const showTrend = !filtered || trendHasActivity(trendDays);
  const showHeatmap = !filtered || heatmapHasActivity(hourRows, start, end, since, today, filterSite);
  const shareTitle = t('share.title');
  const trendTitle = trendLabel || t('range.last7');
  const tabs = [['share', shareTitle], ['trend', trendTitle]];
  const tabSignature = `${chart}:${shareTitle}:${trendTitle}`;
  useLayoutEffect(() => {
    const list = tabsRef.current;
    const mark = markRef.current;
    const tab = list?.querySelector('[aria-selected="true"]');
    if (!list || !mark || !tab || seenTab.current === tabSignature) return;
    const first = seenTab.current === null;
    seenTab.current = tabSignature;
    retarget(mark, [indicatorFrame(tab, list)], { first, reduce: reducedMotion() });
    if (tab.offsetWidth > 0) list.dataset.indicator = '1';
  }, [tabSignature]);
  useEffect(() => {
    if (!focusChart.current) return;
    focusChart.current = false;
    tabsRef.current?.querySelector('[aria-selected="true"]')?.focus();
  }, [chart]);
  function onTabKey(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setChart(current => {
      const next = nextTabKey(tabs.map(([key]) => key), current, event.key);
      if (!next || next === current) return current;
      focusChart.current = true;
      return next;
    });
  }

  return <div className="contents" data-status="ready">
    {filtered && <div className="filter-bar" role="status">
      <div className="filter-chip"><span>{t('filter.active', { domain: filterSite })}</span><Button variant="ghost" size="sm" onClick={() => onFilter('')}>{t('filter.clear')}</Button></div>
    </div>}
    <div className="ledger-figures" ref={figuresRef}>
    <section className="kpi ledger-card" aria-label={t('kpi.label', { range: rangeLabel })}>
      <div className="kpi-item primary">
        <div className="kpi-label"><span>{t('ranking.activeTime')}</span></div>
        <div className="kpi-value">{duration(kpi.ms)}</div>
        <KpiCompare metric="ms" compare={compare} preset={preset} />
      </div>
      <div className="kpi-secondary">
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
      </div>
    </section>
    <section className="chart-card ledger-card" aria-label={t('chart.label')}>
      <div className="chart-head">
        <h2 className="sr-only">{chart === 'share' ? shareTitle : trendTitle}</h2>
        <div className="chart-tabs" role="tablist" aria-label={t('chart.label')} ref={tabsRef} onKeyDown={onTabKey}>
          <span className="chart-indicator" ref={markRef} aria-hidden="true" />
          {tabs.map(([key, label]) => <Button key={key} type="button" variant="ghost" size="sm" role="tab" id={`chart-tab-${key}`} className="chart-tab" tabIndex={chart === key ? 0 : -1} aria-selected={chart === key} aria-controls="primary-chart" onClick={() => setChart(key)}>{label}</Button>)}
        </div>
      </div>
      <div id="primary-chart" role="tabpanel" aria-labelledby={`chart-tab-${chart}`} className="chart-panel">
        {chart === 'share' ? <SiteShareChart rows={rows} total={total} focusSite={filterSite} rangeLabel={rangeLabel} isDark={isDark} onOpenSite={openSite} /> : (showTrend ? <Trend days={trendDays} className="primary-trend" isDark={isDark} onSelectDay={onSelectDay} /> : <FilterEmpty domain={filterSite} onClear={() => onFilter('')} />)}
      </div>
    </section>
    </div>
    <section className="rank-section" id="site-ledger" tabIndex={-1} aria-label={t('ranking.title')}>
      {!rows.length ? (filtered ? <FilterEmpty className="ledger-card chart-empty" domain={filterSite} onClear={() => onFilter('')} title={t('filter.emptyRankingTitle')} description={t('filter.emptyRankingDescription', { domain: filterSite })} /> : <EmptyState className="ledger-card chart-empty" title={t('ranking.emptyTitle')} description={t('ranking.emptyDescription')} />) : <div className="rank-card ledger-card">
        <div className="rank-card-head">
          <div className="rank-card-title"><h2>{t('ranking.title')}</h2><p>{rangeLabel}</p></div>
          <div className="metric-tabs" role="group" aria-label={t('ranking.metricLabel')}>
            <Button size="xs" variant={metric === 'time' ? 'secondary' : 'ghost'} aria-pressed={metric === 'time'} onClick={() => setMetric('time')}>{t('ranking.timeTitle')}</Button>
            <Button size="xs" variant={metric === 'visits' ? 'secondary' : 'ghost'} aria-pressed={metric === 'visits'} onClick={() => setMetric('visits')}>{t('ranking.visitsTitle')}</Button>
          </div>
        </div>
        <InputGroup className="rank-search h-9">
          <InputGroupAddon><MagnifyingGlass aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput aria-label={t('ranking.search')} placeholder={t('ranking.searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} />
          {query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={t('ranking.clearSearch')} onClick={() => setQuery('')}><X /></InputGroupButton></InputGroupAddon>}
        </InputGroup>
        {ledger.rows.length ? <RankRows rows={ledger.rows} total={total} filterSite={filterSite} onFilter={onFilter} onOpen={openSite} /> : <div className="rank-empty" role="status"><p>{t('ranking.noMatch')}</p><Button variant="link" className="px-0" onClick={() => setQuery('')}>{t('ranking.clearSearch')}</Button></div>}
        {canToggle && <div className="table-footer"><Button variant="link" className="px-0" onClick={() => setExpanded(open => !open)}>{expanded ? t('ranking.collapse') : t('ranking.showAll', { count: rows.length })}<ArrowRight /></Button></div>}
      </div>}
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
