import React, { useEffect, useRef, useState } from 'react';
import { ChartBar, Clock, GearSix, ShieldCheck, Pause, Play, ArrowRight, MagnifyingGlass, X, Trash, CaretDown, CalendarBlank, Translate, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@app/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Switch } from '@app/components/ui/switch';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@app/components/ui/sidebar';
import { TooltipProvider } from '@app/components/ui/tooltip';
import { Input } from '@app/components/ui/input';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@app/components/ui/input-group';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@app/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle } from '@app/components/ui/empty';
import { Trans, useTranslation } from 'react-i18next';
import { addDays, dateKey, dateKeyStart, midnight, timingCopy } from './model.mjs';
import { DEFAULT_SETTINGS, IDLE_OPTIONS, IGNORED_LIMIT, MERGE_MODES, RECORD_MODES, isAllowed, isIgnored, normalizeHost } from './settings.mjs';
import { hostsToDelete } from './site.mjs';
import { IgnoredSites } from './IgnoredSites.jsx';
import { HowItWorksDialog } from './HowItWorksDialog.jsx';
import { command, isExtension } from './data.js';
import { useDaySummary, useLedger } from './use-ledger.js';
import { VISIT_LIST_LIMIT } from './ledger-view.mjs';
import { SiteIcon } from './SiteIcon.jsx';
import { SiteDetailSheet } from './SiteDetailPanel.jsx';
import { Overview } from './Overview.jsx';
import { toggleSiteFilter } from './site-filter.mjs';
import { duration, formatDate, languages, timeLabel } from './i18n.js';

export function App() {
  const { t, i18n } = useTranslation();
  const rangeLabel = range => range === 1 ? t('range.today') : t('range.lastDays', { count: range });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS), [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [page, setPage] = useState('overview'), [range, setRange] = useState(1), [search, setSearch] = useState(''), [site, setSite] = useState(''), [filterSite, setFilterSite] = useState(''), [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false), [howOpen, setHowOpen] = useState(false), [ignoreTarget, setIgnoreTarget] = useState(null);
  const [chosenDay, setChosenDay] = useState(''), [dayDone, setDayDone] = useState(''), [confirmDay, setConfirmDay] = useState(false), [deleteTarget, setDeleteTarget] = useState(null);
  const dayQuery = /^\d{4}-\d{2}-\d{2}$/.test(chosenDay) ? chosenDay : '';
  const detailTrigger = useRef(null), howTrigger = useRef(null);
  const openHow = event => { howTrigger.current = event.currentTarget; setHowOpen(true); };
  const now = Date.now(), today = midnight(now);
  const start = addDays(today, 1 - range), end = addDays(today, 1);
  const ledger = useLedger({ start, end, today, search: search.trim().toLowerCase(), site: site.trim(), siteMerge: settings.siteMerge, detail: selected ?? '', day: isExtension ? '' : dayQuery, focus: filterSite });
  const liveDay = useDaySummary(isExtension ? dayQuery : '', settings.siteMerge);
  const view = ledger.view, stats = view?.stats, todayStats = view?.todayStats;
  async function act(type = 'snapshot', body) {
    setBusy(true);
    try {
      const next = await command(type, body);
      if (type === 'settings') setSettings(next);
      else { ledger.apply(next); setSettings(await command('settings')); }
      setError(''); setReady(true); return true;
    }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => { act(); }, []);
  const shown = ready && view;
  const enabled = view?.enabled ?? true;
  const goRecords = (domain = '') => { setSite(domain); setSearch(domain); setPage('records'); };
  const openSite = (domain, event) => { detailTrigger.current = event.currentTarget; setSelected(domain); };
  const onFilter = domain => setFilterSite(current => toggleSiteFilter(current, domain));
  const problem = error || ledger.error;
  const errorText = t([`error.${problem}`, 'error.connect']);
  const languageName = languages.find(([code]) => code === i18n.resolvedLanguage)?.[1];
  const copy = timingCopy(settings);
  const idleLabel = t('settings.idle.option', { count: settings.idleSeconds / 60 });
  const mergeLabel = t(`settings.siteMerge.${settings.siteMerge}`);
  const saveSettings = next => act('settings', { settings: next });
  const selectedRow = stats?.rows.find(row => row.domain === selected);
  const sessions = view?.spans.filter(span => (span.site ?? span.domain) === selected) ?? [];
  const listField = settings.recordMode === 'whitelist' ? 'allowed' : 'ignored';
  const scopeHost = selected ? normalizeHost(selected) : null;
  const alreadyListed = selected ? (listField === 'allowed' ? isAllowed(selected, settings.allowed) : isIgnored(selected, settings.ignored)) : false;
  const listLimit = (settings[listField]?.length ?? 0) >= IGNORED_LIMIT;
  const confirmKey = listField === 'allowed' ? 'detail.allowConfirm' : 'detail.ignoreConfirm';
  async function confirmListAdd() {
    const host = normalizeHost(ignoreTarget);
    const current = settings[listField] ?? [];
    const covered = listField === 'allowed' ? isAllowed(host, current) : isIgnored(host, current);
    if (!host || covered) { setIgnoreTarget(null); return; }
    if (current.length >= IGNORED_LIMIT) return;
    if (await saveSettings({ ...settings, [listField]: [...current, host] })) setIgnoreTarget(null);
  }
  const minDay = dateKey(view?.since ?? now);
  const maxDay = dateKey(today);
  const dayReady = Boolean(dayQuery) && minDay <= maxDay && dayQuery >= minDay && dayQuery <= maxDay;
  const dayStats = dayReady ? (isExtension ? (liveDay?.date === dayQuery ? liveDay : null) : view?.day) : null;
  const removeHosts = target => hostsToDelete(target, settings.siteMerge, view?.hosts ?? [], view?.openDomain);

  return <TooltipProvider><AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="sidebar">
        <SidebarHeader className="p-0"><div className="brand"><ChartBar size={32} weight="bold" /><span>PageTime</span></div></SidebarHeader>
        <SidebarContent className="sidebar-navigation"><nav aria-label={t('nav.label')}><SidebarMenu className="navigation-menu">
          {[['overview', ChartBar], ['records', Clock], ['settings', GearSix]].map(([key, Icon]) =>
            <SidebarMenuItem key={key}><SidebarMenuButton className="nav-item" size="lg" isActive={page === key} aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}><Icon /><span>{t(`nav.${key}`)}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></nav></SidebarContent>
        <SidebarFooter className="local-note"><ShieldCheck size={21} className="shrink-0" /><span>{t('localNote')}</span></SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="record-status"><span className={`status-dot ${enabled ? '' : 'paused'}`} /><div><strong>{enabled ? t('status.recording') : t('status.paused')}</strong><small>{t('status.since', { date: formatDate(view?.since ?? now) })}</small></div></div>
          <Button variant="outline" className="action-button" disabled={busy || !shown} onClick={() => act('toggle')}>{enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{enabled ? t('actions.pause') : t('actions.resume')}</Button>
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
          {problem && <Alert variant="destructive" className="my-4"><AlertTitle>{t('error.title')}</AlertTitle><AlertDescription>{errorText}<Button variant="link" size="sm" onClick={() => { ledger.retry(); act(); }}>{t('error.retry')}</Button></AlertDescription></Alert>}
          {!shown ? (!problem && <p className="py-8 text-center text-muted-foreground">{t('loading')}</p>) : page === 'overview' ? <Overview todayStats={todayStats} stats={stats} weekDays={ledger.weekDays ?? []} spans={view.spans} hourRows={view.hourRows ?? []} since={view.since} start={start} end={end} today={today} now={now} rangeLabel={rangeLabel(range)} filterSite={filterSite} onFilter={onFilter} openSite={openSite} openHow={openHow} /> : page === 'records' ? <section className="records">
            <InputGroup className="h-11 max-w-[460px]"><InputGroupInput aria-label={t('records.search')} placeholder={t('records.placeholder')} value={search} onChange={e => { setSearch(e.target.value); setSite(''); }} /><InputGroupAddon><MagnifyingGlass /></InputGroupAddon>{search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label={t('records.clearSearch')} onClick={() => { setSearch(''); setSite(''); }}><X /></InputGroupButton></InputGroupAddon>}</InputGroup>
            <p className="muted">{t('records.count', { count: view.visitCount })}{view.visitCount > VISIT_LIST_LIMIT ? t('records.limited') : ''}</p>
            <Table><TableHeader><TableRow><TableHead>{t('ranking.site')}</TableHead><TableHead>{t('records.visitedAt')}</TableHead><TableHead>{t('records.details')}</TableHead></TableRow></TableHeader><TableBody>
              {view.visits.map((visit, i) => <TableRow key={`${visit.at}-${i}`}><TableCell><div className="site-link"><SiteIcon domain={visit.domain} site={visit.site} />{visit.domain}</div></TableCell><TableCell>{formatDate(visit.at)} {timeLabel(visit.at)}</TableCell><TableCell><Button variant="link" className="px-0" onClick={event => openSite(visit.site ?? visit.domain, event)}>{t('records.view')}<ArrowRight /></Button></TableCell></TableRow>)}
            </TableBody></Table>
            {!view.visits.length && <Empty><EmptyHeader><EmptyTitle>{t('records.empty')}</EmptyTitle></EmptyHeader></Empty>}
          </section> : <section className="settings">
            <div className="setting-row"><div><h2>{t('settings.language.title')}</h2><p>{t('settings.language.description')}</p></div><DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="action-button" />} aria-label={t('settings.language.label', { language: languageName })}><Translate />{languageName}<CaretDown /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={value => i18n.changeLanguage(value)}>
                {languages.map(([code, name]) => <DropdownMenuRadioItem closeOnClick key={code} value={code} lang={code}>{name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu></div>
            <div className="setting-row"><div><h2 id="toolbar-badge">{t('settings.badge.title')}</h2><p>{t('settings.badge.description')}</p></div><Switch className="shrink-0" checked={settings.badge} onCheckedChange={checked => saveSettings({ ...settings, badge: checked })} disabled={busy} aria-labelledby="toolbar-badge" /></div>
            <div className="setting-row"><div><h2>{t('settings.recording.title')}</h2><p>{t('settings.recording.description')}</p></div><Button variant="outline" className="action-button" disabled={busy} onClick={() => act('toggle')}>{enabled ? t('actions.pause') : t('actions.enable')}</Button></div>
            <div className="setting-row"><div><h2>{t('settings.privacy.title')}</h2><p><Trans i18nKey="settings.privacy.description" /></p></div><ShieldCheck size={28} className="privacy-icon" /></div>
            <div className="setting-row"><div className="min-w-0 flex-1"><h2 id="record-mode">{t('settings.recordMode.title')}</h2><p>{t('settings.recordMode.description')}</p>
              <RadioGroup className="mt-4 gap-3" aria-labelledby="record-mode" value={settings.recordMode} disabled={busy} onValueChange={value => { if (value !== settings.recordMode) saveSettings({ ...settings, recordMode: value }); }}>
                {RECORD_MODES.map(mode => <label key={mode} className="flex items-start gap-3"><RadioGroupItem value={mode} className="mt-1" /><span className="min-w-0"><strong>{t(`settings.recordMode.${mode}`)}</strong><p>{t(`settings.recordMode.${mode}Hint`)}</p></span></label>)}
              </RadioGroup>
              {listField === 'allowed' && !(settings.allowed?.length) && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.allowed.emptyWarningTitle')}</AlertTitle><AlertDescription>{t('settings.allowed.emptyWarning')}</AlertDescription></Alert>}
              <h3 className="mt-4">{t(`settings.${listField}.title`)}</h3><p>{t(`settings.${listField}.description`)}</p><IgnoredSites key={listField} field={listField} settings={settings} busy={busy} onSave={saveSettings} />
            </div></div>
            <div className="setting-row"><div className="min-w-0 flex-1"><h2>{t('settings.method.title')}</h2><p><Trans i18nKey="settings.method.description" values={copy} /></p>{settings.countAudible && <p>{t('settings.method.audible')}</p>}<div className="mt-4 flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="min-w-48 flex-1"><h3 id="count-audible">{t('settings.audible.title')}</h3><p>{t('settings.audible.description')}</p></div><Switch checked={settings.countAudible} onCheckedChange={checked => saveSettings({ ...settings, countAudible: checked })} disabled={busy} aria-labelledby="count-audible" /></div><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="min-w-48 flex-1"><h3 id="idle-threshold">{t('settings.idle.title')}</h3><p>{t('settings.idle.description')}</p></div><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="action-button shrink-0" />} aria-label={t('settings.idle.label', { duration: idleLabel })} disabled={busy}>{idleLabel}<CaretDown /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={String(settings.idleSeconds)} onValueChange={value => saveSettings({ ...settings, idleSeconds: Number(value) })}>{IDLE_OPTIONS.map(seconds => <DropdownMenuRadioItem closeOnClick key={seconds} value={String(seconds)}>{t('settings.idle.option', { count: seconds / 60 })}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div></div><Button variant="outline" className="action-button mt-3" onClick={openHow}>{t('howItWorks.open')}</Button></div></div>
            <div className="setting-row"><div className="min-w-0 flex-1"><h2 id="site-merge">{t('settings.siteMerge.title')}</h2><p>{t('settings.siteMerge.description')}</p></div><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="action-button shrink-0" />} aria-label={t('settings.siteMerge.label', { mode: mergeLabel })} disabled={busy}>{mergeLabel}<CaretDown /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={settings.siteMerge} onValueChange={value => { setSite(''); setSearch(''); setFilterSite(''); saveSettings({ ...settings, siteMerge: value }); }}>{MERGE_MODES.map(mode => <DropdownMenuRadioItem closeOnClick key={mode} value={mode}>{t(`settings.siteMerge.${mode}`)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
            <div className="setting-row"><div className="min-w-0 flex-1"><h2>{t('settings.deleteDay.title')}</h2><p>{t('settings.deleteDay.description')}</p><div className="mt-4 flex max-w-xs flex-col gap-2">
              <Input type="date" aria-label={t('settings.deleteDay.label')} min={minDay} max={maxDay} value={chosenDay} disabled={busy || minDay > maxDay} onChange={event => { setChosenDay(event.target.value); setDayDone(''); }} />
              {dayStats && <p>{duration(dayStats.ms)} · <Trans i18nKey="summary.sites" count={dayStats.sites} components={{ b: <strong /> }} /></p>}
              {dayDone === chosenDay && chosenDay && <p role="status">{t('settings.deleteDay.done', { date: formatDate(dateKeyStart(chosenDay)) })}</p>}
            </div></div><Button variant="destructive" className="action-button shrink-0" disabled={busy || !dayStats} onClick={() => setConfirmDay(true)}><Trash />{t('settings.deleteDay.button')}</Button></div>
            <div className="setting-row"><div><h2>{t('settings.clear.title')}</h2><p>{t('settings.clear.description')}</p></div><AlertDialogTrigger render={<Button variant="destructive" className="action-button" disabled={busy} />}><Trash />{t('settings.clear.button')}</AlertDialogTrigger></div>
          </section>}
        </main>
      </div>
    </SidebarProvider>
    <HowItWorksDialog open={howOpen} onOpenChange={setHowOpen} finalFocus={howTrigger} settings={settings} />
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.description')}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('clear')) setConfirmClear(false); }}>{busy ? t('confirm.clearing') : t('confirm.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t('detail.deleteConfirm.title')}</AlertDialogTitle><AlertDialogDescription>{t('detail.deleteConfirm.description', { domain: deleteTarget ?? '' })}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('deleteSite', { host: deleteTarget, hosts: removeHosts(deleteTarget) })) { setDeleteTarget(null); setSelected(null); } }}>{busy ? t('detail.deleteConfirm.deleting') : t('detail.deleteConfirm.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <AlertDialog open={confirmDay} onOpenChange={setConfirmDay}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t('settings.deleteDay.confirmTitle', { date: chosenDay && dateKeyStart(chosenDay) ? formatDate(dateKeyStart(chosenDay)) : '' })}</AlertDialogTitle><AlertDialogDescription>{t('settings.deleteDay.confirmDescription')}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('deleteDay', { date: chosenDay })) { setDayDone(chosenDay); setConfirmDay(false); } }}>{busy ? t('settings.deleteDay.deleting') : t('settings.deleteDay.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <AlertDialog open={Boolean(ignoreTarget)} onOpenChange={open => { if (!open) setIgnoreTarget(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t(`${confirmKey}.title`)}</AlertDialogTitle><AlertDialogDescription>{t(`${confirmKey}.description`, { domain: ignoreTarget ?? '' })}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={confirmListAdd}>{t(`${confirmKey}.confirm`)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  {/* Dismissing the drawer clears the open site and leaves the ranking filter in place. */}
  <SiteDetailSheet
    open={Boolean(selected)}
    onOpenChange={open => { if (!open) setSelected(null); }}
    finalFocus={detailTrigger}
    siteKey={selected ?? ''}
    range={range}
    ready={Boolean(stats)}
    row={selectedRow}
    detail={ledger.detailSite === selected ? ledger.detail : null}
    sessions={sessions}
    today={today}
    end={end}
    busy={busy}
    listField={listField}
    alreadyListed={alreadyListed}
    scopeHost={scopeHost}
    listLimit={listLimit}
    onListAdd={() => setIgnoreTarget(selected)}
    onViewVisits={() => { goRecords(selected); setSelected(null); }}
    onDelete={() => setDeleteTarget(selected)}
  />
  </TooltipProvider>;
}
