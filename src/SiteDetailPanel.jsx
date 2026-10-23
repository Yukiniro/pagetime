import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Trash, X } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { ScrollArea } from '@app/components/ui/scroll-area';
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@app/components/ui/sheet';
import { useTranslation } from 'react-i18next';
import { Breakdown, HourChart, SiteTrend } from './Charts.jsx';
import { iconForSite } from './data.js';
import { clipDaySessions, daySessionCopy, sessionsOverlappingHour } from './day-sessions.mjs';
import { duration, timeLabel } from './i18n.js';
import { IGNORED_LIMIT } from './settings.mjs';
import { singleDayLabel } from './range-label.mjs';
import { SiteIcon } from './SiteIcon.jsx';

const NARROW_DRAWER = '(max-width: 760px)';

function hourSlot(hour, t) {
  const from = new Date(2000, 0, 1, hour, 0, 0, 0);
  return t('detail.hours.slot', { from: timeLabel(from), to: timeLabel(from.getTime() + 3_600_000) });
}

function useSessionHour(siteKey, day, showSessions) {
  const [hourFilter, setHourFilter] = useState(null);
  const [hourScope, setHourScope] = useState({ siteKey, day, showSessions });
  const scopeChanged = hourScope.siteKey !== siteKey || hourScope.day !== day || hourScope.showSessions !== showSessions;
  if (scopeChanged) {
    setHourScope({ siteKey, day, showSessions });
    setHourFilter(null);
  }
  const activeHour = scopeChanged ? null : hourFilter;
  const selectHour = hour => setHourFilter(current => current === hour ? null : hour);
  return { activeHour, selectHour, clearHour: () => setHourFilter(null) };
}

function DaySessionBlock({ copy, pieces, day, merged, activeHour, onClear }) {
  const { t } = useTranslation();
  const result = useRef(null);
  const date = copy.today ? '' : singleDayLabel(day);
  const shown = activeHour === null ? pieces : sessionsOverlappingHour(pieces, day, activeHour);
  const emptyKey = activeHour === null ? copy.emptyKey : 'detail.hours.empty';
  useEffect(() => {
    if (activeHour === null) return;
    result.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeHour, shown.length]);
  return <>
    <h3>{t(copy.titleKey, { date })}</h3>
    <div ref={result}>
      {activeHour !== null && <div className="session-filter" role="status">
        <div className="filter-chip"><span>{hourSlot(activeHour, t)}</span><Button variant="ghost" size="sm" onClick={onClear}>{t('filter.clear')}</Button></div>
      </div>}
      {shown.length ? <SessionList pieces={shown} merged={merged} /> : <p className="muted">{t(emptyKey, { date })}</p>}
    </div>
  </>;
}

function useNarrowDrawer() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_DRAWER).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_DRAWER);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function SessionList({ pieces, merged }) {
  return <ScrollArea className="h-[230px]"><ul className="session-list">{pieces.map(piece => <li key={`${piece.domain}-${piece.start}-${piece.end}`}>
    <time>{timeLabel(piece.from)} — {timeLabel(piece.to)}</time>
    {merged && <span className="session-host">{piece.domain}</span>}
    <span>{duration(piece.to - piece.from)}</span>
  </li>)}</ul></ScrollArea>;
}

function DetailActions({ busy, listField, alreadyListed, scopeHost, listLimit, onListAdd, onViewVisits, onDelete }) {
  const { t } = useTranslation();
  const listedKey = listField === 'allowed' ? 'detail.allowed' : 'detail.ignored';
  const addKey = listField === 'allowed' ? 'detail.allow' : 'detail.ignore';
  return <SheetFooter className="site-detail-actions">
    <Button variant="outline" className="action-button w-full" disabled={busy || alreadyListed || !scopeHost || listLimit} onClick={onListAdd}>{alreadyListed ? t(listedKey) : t(addKey)}</Button>
    {!alreadyListed && !scopeHost && <p className="text-sm text-destructive" role="alert">{t(`settings.${listField}.error`)}</p>}
    {!alreadyListed && scopeHost && listLimit && <p className="text-sm text-destructive" role="alert">{t(`settings.${listField}.limit`, { count: IGNORED_LIMIT })}</p>}
    <Button className="action-button w-full" onClick={onViewVisits}>{t('detail.viewVisits')}<ArrowRight /></Button>
    <Button variant="destructive" className="action-button w-full" disabled={busy} onClick={onDelete}><Trash />{t('detail.delete')}</Button>
  </SheetFooter>;
}

export function SiteDetailPanel({ siteKey, row, detail, sessions, day, now, dayCount, isDark = false, onSelectDay, ...actions }) {
  const { t } = useTranslation();
  const icon = iconForSite(siteKey, row?.hosts) || siteKey;
  const hosts = row?.hosts ?? [];
  const merged = hosts.length >= 2;
  const copy = dayCount > 1 ? null : daySessionCopy(day, now);
  const { activeHour, selectHour, clearHour } = useSessionHour(siteKey, day, Boolean(copy));
  const pieces = copy ? clipDaySessions(sessions, day) : [];
  return <>
    <div className="site-detail-scroll">
      <div className="detail-site"><SiteIcon domain={icon} site={icon} /><h3>{siteKey}</h3></div>
      <div className="detail-stats">
        <div><strong>{duration(row?.ms || 0)}</strong><span>{t('ranking.activeTime')}</span></div>
        <div><strong>{t('detail.visits', { count: row?.visits || 0 })}</strong><span>{t('ranking.visits')}</span></div>
      </div>
      {detail && <section className="detail-chart min-w-0">
        <h3>{t('detail.trend.title')}</h3>
        <SiteTrend days={detail.days} domain={siteKey} isDark={isDark} onSelectDay={onSelectDay} />
        <h3>{t('detail.hours.title')}</h3>
        <HourChart hours={detail.hours} dayCount={detail.hourDays} domain={siteKey} isDark={isDark} onSelectHour={copy ? selectHour : undefined} selectedHour={activeHour} />
      </section>}
      {merged && <><h3>{t('detail.breakdown.title')}</h3><Breakdown hosts={hosts} isDark={isDark} /></>}
      {copy && <DaySessionBlock copy={copy} pieces={pieces} day={day} merged={merged} activeHour={activeHour} onClear={clearHour} />}
    </div>
    <DetailActions {...actions} />
  </>;
}

export function SiteDetailSheet({ open, onOpenChange, finalFocus, siteKey, ready, onSelectDay, ...panel }) {
  const { t } = useTranslation();
  const narrow = useNarrowDrawer();

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={narrow ? 'bottom' : 'right'} showCloseButton={false} finalFocus={finalFocus} className="site-detail">
      <SheetHeader className="site-detail-head flex-row items-start justify-between gap-3 border-b px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-xl">{t('detail.title')}</SheetTitle>
        </div>
        <SheetClose render={<Button variant="ghost" size="icon-sm" className="shrink-0" />} aria-label={t('detail.close')}><X /></SheetClose>
      </SheetHeader>
      {siteKey && ready && <SiteDetailPanel siteKey={siteKey} onSelectDay={onSelectDay} {...panel} />}
    </SheetContent>
  </Sheet>;
}
