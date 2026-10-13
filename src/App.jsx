import React, { useEffect, useRef, useState } from 'react';
import { ChartBar, Clock, GearSix, ShieldCheck, Pause, Play, ArrowRight, GlobeHemisphereWest, MagnifyingGlass, X, Trash, CaretDown, CalendarBlank, Translate } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@app/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@app/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@app/components/ui/sidebar';
import { TooltipProvider } from '@app/components/ui/tooltip';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@app/components/ui/input-group';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@app/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@app/components/ui/empty';
import { Avatar, AvatarImage, AvatarFallback } from '@app/components/ui/avatar';
import { ScrollArea } from '@app/components/ui/scroll-area';
import { Trans, useTranslation } from 'react-i18next';
import { blankData, midnight, summarize } from './model.mjs';
import { command, knownSites, colorOf } from './data.js';
import { Trend, Timeline } from './Charts.jsx';
import { duration, formatDate, languages, timeLabel } from './i18n.js';

function SiteIcon({ domain }) {
  return <Avatar className="site-icon rounded-none after:hidden">
    {knownSites.includes(domain) && <AvatarImage className="rounded-none object-contain" src={`./assets/${domain}.svg`} alt="" />}
    <AvatarFallback className="rounded-none bg-transparent"><GlobeHemisphereWest size={23} /></AvatarFallback>
  </Avatar>;
}

export function App() {
  const { t, i18n } = useTranslation();
  const rangeLabel = range => range === 1 ? t('range.today') : t('range.lastDays', { count: range });
  const [data, setData] = useState(blankData), [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [page, setPage] = useState('overview'), [range, setRange] = useState(7), [search, setSearch] = useState(''), [expanded, setExpanded] = useState(false), [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const detailTrigger = useRef(null);
  async function act(type = 'snapshot') {
    setBusy(true);
    try { setData(await command(type)); setError(''); setReady(true); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => { act(); const timer = setInterval(() => act(), 30_000); return () => clearInterval(timer); }, []);
  const now = Date.now(), today = midnight(now);
  const fromDate = new Date(today); fromDate.setDate(fromDate.getDate() - range + 1);
  const start = fromDate.getTime();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.getTime();
  const stats = summarize(data, start, end), todayStats = summarize(data, today, end);
  const visits = data.visits.filter(v => v.at >= start && v.at < end && v.domain.includes(search.trim().toLowerCase())).sort((a, b) => b.at - a.at);
  const goRecords = (domain = '') => { setSearch(domain); setPage('records'); };
  const openSite = (domain, event) => { detailTrigger.current = event.currentTarget; setSelected(domain); };
  const errorText = t([`error.${error}`, 'error.connect']);
  const languageName = languages.find(([code]) => code === i18n.resolvedLanguage)?.[1];
  const sessions = data.spans.filter(s => s.domain === selected && s.end > today && s.start < end);

  return <TooltipProvider><AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="sidebar">
        <SidebarHeader className="p-0"><div className="brand"><ChartBar size={32} weight="bold" /><span>PageTime</span></div></SidebarHeader>
        <SidebarContent className="sidebar-navigation"><nav aria-label={t('nav.label')}><SidebarMenu className="navigation-menu">
          {[['overview', ChartBar], ['records', Clock], ['settings', GearSix]].map(([key, Icon]) =>
            <SidebarMenuItem key={key}><SidebarMenuButton className="nav-item" size="lg" isActive={page === key} aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}><Icon /><span>{t(`nav.${key}`)}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></nav></SidebarContent>
        <SidebarFooter className="local-note"><ShieldCheck size={21} /><span>{t('localNote')}</span></SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="record-status"><span className={`status-dot ${data.enabled ? '' : 'paused'}`} /><div><strong>{data.enabled ? t('status.recording') : t('status.paused')}</strong><small>{t('status.since', { date: formatDate(data.since) })}</small></div></div>
          <Button variant="outline" className="action-button" disabled={busy || !ready} onClick={() => act('toggle')}>{data.enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{data.enabled ? t('actions.pause') : t('actions.resume')}</Button>
        </header>
        <main>
          <div className="page-header"><div><h1>{t(`pages.${page}.title`)}</h1><p>{t(`pages.${page}.subtitle`)}</p></div>
            {page !== 'settings' && <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="range" />} aria-label={t('range.label', { range: rangeLabel(range) })}>
                <CalendarBlank /><span>{rangeLabel(range)}</span>{range !== 1 && <span className="range-dates">{formatDate(start, { month: '2-digit', day: '2-digit' })}–{formatDate(today, { month: '2-digit', day: '2-digit' })}</span>}<CaretDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={String(range)} onValueChange={value => setRange(Number(value))}>
                {[1, 7, 30].map(value => <DropdownMenuRadioItem closeOnClick key={value} value={String(value)}>{rangeLabel(value)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>}
          </div>
          {error && <Alert variant="destructive" className="my-4"><AlertTitle>{t('error.title')}</AlertTitle><AlertDescription>{errorText}<Button variant="link" size="sm" onClick={() => act()}>{t('error.retry')}</Button></AlertDescription></Alert>}
          {!ready && !error ? <p className="py-8 text-center text-muted-foreground">{t('loading')}</p> : page === 'overview' ? <>
            <section className="summary" aria-label={t('summary.label')}><div className="total-time">{duration(stats.ms)}</div><p>{t('summary.totalTime')}</p><div className="totals"><Trans i18nKey="summary.visits" count={stats.visits} components={{ b: <strong /> }} /><span>·</span><Trans i18nKey="summary.sites" count={stats.rows.length} components={{ b: <strong /> }} /></div></section>
            <Trend data={data} start={start} end={end} />
            <section className="timeline-section"><h2>{t('timeline.title')}</h2><p>{formatDate(now, { month: 'long', day: 'numeric', weekday: 'long' })}<span>·</span>{t('active', { duration: duration(todayStats.ms) })}</p><Timeline spans={data.spans} />
              <div className="legend">{todayStats.rows.filter(r => r.ms).slice(0, 5).map(r => r.domain).map(domain => <Button variant="ghost" size="xs" key={domain} onClick={event => openSite(domain, event)}><i style={{ background: colorOf(domain) }} />{domain}</Button>)}<span className="idle-legend"><i />{t('timeline.idle')}</span></div>
            </section>
            <section className="ranking"><h2>{t('ranking.title')}</h2>
              <Table><TableHeader><TableRow><TableHead className="rank-col">#</TableHead><TableHead>{t('ranking.site')}</TableHead><TableHead>{t('ranking.activeTime')}</TableHead><TableHead>{t('ranking.visits')}</TableHead></TableRow></TableHeader><TableBody>
                {stats.rows.slice(0, expanded ? undefined : 5).map((site, i) => <TableRow key={site.domain}><TableCell>{i + 1}</TableCell><TableCell><Button variant="ghost" className="site-link" onClick={event => openSite(site.domain, event)}><SiteIcon domain={site.domain} /><span>{site.domain}</span></Button></TableCell><TableCell>{duration(site.ms)}</TableCell><TableCell>{site.visits}</TableCell></TableRow>)}
              </TableBody></Table>
              {!stats.rows.length && <Empty><EmptyHeader><EmptyMedia><GlobeHemisphereWest size={32} /></EmptyMedia><EmptyTitle>{t('ranking.emptyTitle')}</EmptyTitle><EmptyDescription>{t('ranking.emptyDescription')}</EmptyDescription></EmptyHeader></Empty>}
              {!!stats.rows.length && <div className="table-footer"><Button variant="link" className="px-0" onClick={() => setExpanded(!expanded)}>{expanded ? t('ranking.collapse') : t('ranking.showAll', { count: stats.rows.length })}<ArrowRight /></Button><Button className="action-button" onClick={event => openSite(stats.rows[0].domain, event)}>{t('ranking.details')}<ArrowRight /></Button></div>}
            </section>
          </> : page === 'records' ? <section className="records">
            <InputGroup className="h-11 max-w-[460px]"><InputGroupInput aria-label={t('records.search')} placeholder={t('records.placeholder')} value={search} onChange={e => setSearch(e.target.value)} /><InputGroupAddon><MagnifyingGlass /></InputGroupAddon>{search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label={t('records.clearSearch')} onClick={() => setSearch('')}><X /></InputGroupButton></InputGroupAddon>}</InputGroup>
            <p className="muted">{t('records.count', { count: visits.length })}{visits.length > 200 ? t('records.limited') : ''}</p>
            <Table><TableHeader><TableRow><TableHead>{t('ranking.site')}</TableHead><TableHead>{t('records.visitedAt')}</TableHead><TableHead>{t('records.details')}</TableHead></TableRow></TableHeader><TableBody>
              {visits.slice(0, 200).map((visit, i) => <TableRow key={`${visit.at}-${i}`}><TableCell><div className="site-link"><SiteIcon domain={visit.domain} />{visit.domain}</div></TableCell><TableCell>{formatDate(visit.at)} {timeLabel(visit.at)}</TableCell><TableCell><Button variant="link" className="px-0" onClick={event => openSite(visit.domain, event)}>{t('records.view')}<ArrowRight /></Button></TableCell></TableRow>)}
            </TableBody></Table>
            {!visits.length && <Empty><EmptyHeader><EmptyTitle>{t('records.empty')}</EmptyTitle></EmptyHeader></Empty>}
          </section> : <section className="settings">
            <div className="setting-row"><div><h2>{t('settings.language.title')}</h2><p>{t('settings.language.description')}</p></div><DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="action-button" />} aria-label={t('settings.language.label', { language: languageName })}><Translate />{languageName}<CaretDown /></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={value => i18n.changeLanguage(value)}>
                {languages.map(([code, name]) => <DropdownMenuRadioItem closeOnClick key={code} value={code} lang={code}>{name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu></div>
            <div className="setting-row"><div><h2>{t('settings.recording.title')}</h2><p>{t('settings.recording.description')}</p></div><Button variant="outline" className="action-button" disabled={busy} onClick={() => act('toggle')}>{data.enabled ? t('actions.pause') : t('actions.enable')}</Button></div>
            <div className="setting-row"><div><h2>{t('settings.privacy.title')}</h2><p><Trans i18nKey="settings.privacy.description" /></p></div><ShieldCheck size={28} className="privacy-icon" /></div>
            <div className="setting-row"><div><h2>{t('settings.method.title')}</h2><p><Trans i18nKey="settings.method.description" /></p></div></div>
            <div className="setting-row"><div><h2>{t('settings.clear.title')}</h2><p>{t('settings.clear.description')}</p></div><AlertDialogTrigger render={<Button variant="destructive" className="action-button" disabled={busy} />}><Trash />{t('settings.clear.button')}</AlertDialogTrigger></div>
          </section>}
        </main>
      </div>
    </SidebarProvider>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px] p-7" finalFocus={detailTrigger} showCloseButton={false}>
        <DialogHeader><DialogTitle className="text-xl">{t('detail.title')}</DialogTitle><DialogDescription>{t('detail.description', { range: rangeLabel(range) })}</DialogDescription></DialogHeader>
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute right-4 top-4" />} aria-label={t('detail.close')}><X /></DialogClose>
        {selected && <><div className="detail-site"><SiteIcon domain={selected} /><h3>{selected}</h3></div>
          <div className="detail-stats"><div><strong>{duration(stats.rows.find(r => r.domain === selected)?.ms || 0)}</strong><span>{t('ranking.activeTime')}</span></div><div><strong>{t('detail.visits', { count: stats.rows.find(r => r.domain === selected)?.visits || 0 })}</strong><span>{t('ranking.visits')}</span></div></div>
          <h3>{t('detail.todaySessions')}</h3>
          {sessions.length ? <ScrollArea className="h-[230px]"><ul className="session-list">{sessions.map((s, i) => <li key={i}><time>{timeLabel(Math.max(today, s.start))} — {timeLabel(Math.min(end, s.end))}</time><span>{duration(Math.min(end, s.end) - Math.max(today, s.start))}</span></li>)}</ul></ScrollArea> : <p className="muted">{t('detail.noSessions')}</p>}
          <Button className="action-button w-full" onClick={() => { goRecords(selected); setSelected(null); }}>{t('detail.viewVisits')}<ArrowRight /></Button>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.description')}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('clear')) setConfirmClear(false); }}>{busy ? t('confirm.clearing') : t('confirm.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></TooltipProvider>;
}
