import React, { useEffect, useRef, useState } from 'react';
import { ChartBar, Clock, GearSix, ShieldCheck, Pause, Play, ArrowRight, MagnifyingGlass, X, Trash, CaretDown, Translate, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@app/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { Switch } from '@app/components/ui/switch';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@app/components/ui/sidebar';
import { TooltipProvider } from '@app/components/ui/tooltip';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@app/components/ui/input-group';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@app/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { midnight } from './model.mjs';
import { activeRange, dayCount, defaultChart, singleDayRange, timelineDay } from './range.mjs';
import { RangeControl } from './range-control.jsx';
import { VisitEmpty } from './visit-empty.jsx';
import { rangeChip, trendLabel as trendTitle } from './range-label.mjs';
import { DEFAULT_SETTINGS, IDLE_OPTIONS, IGNORED_LIMIT, RECORD_MODES, THEME_MODES, isAllowed, isIgnored, normalizeHost, validateSettings } from './settings.mjs';
import { hostsToDelete } from './site.mjs';
import { IgnoredSites } from './ignored-sites.jsx';
import { ExportData } from './export-data.jsx';
import { command, isExtension } from './data.js';
import { useLedger } from './use-ledger.js';
import { docLinks } from './docs-links.mjs';
import { VISIT_LIST_LIMIT } from './ledger-view.mjs';
import { SiteIcon } from './site-icon.jsx';
import { SiteDetailSheet } from './site-detail-panel.jsx';
import { Overview } from './overview.jsx';
import { DashboardSkeleton } from './dashboard-skeleton.jsx';
import { LedgerEmpty } from './empty-state.jsx';
import { dashboardStatus } from './dashboard-status.mjs';
import { siteFromLocationHash } from './popup-model.mjs';
import { toggleSiteFilter } from './site-filter.mjs';
import { formatDate, languages, timeLabel } from './i18n.js';
import { useDocumentTheme } from './use-theme.js';

export function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS), [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [page, setPage] = useState('overview'), [range, setRange] = useState({ preset: 'today', start: 0, end: 0 }), [search, setSearch] = useState(''), [site, setSite] = useState(''), [filterSite, setFilterSite] = useState(''), [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false), [ignoreTarget, setIgnoreTarget] = useState(null), [deleteTarget, setDeleteTarget] = useState(null);
  const detailTrigger = useRef(null);
  const headingRef = useRef(null);
  const [jumpSite] = useState(() => siteFromLocationHash(location.hash));
  const detailFocus = () => {
    const trigger = detailTrigger.current;
    if (trigger?.isConnected) return trigger;
    return headingRef.current;
  };
  const now = Date.now(), today = midnight(now);
  const active = activeRange(range, today);
  const start = active.start, end = active.end;
  const chip = rangeChip(t, active);
  const ledger = useLedger({ start, end, today, search: search.trim().toLowerCase(), site: site.trim(), detail: selected ?? '', focus: filterSite });
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
  useEffect(() => {
    let live = true;
    let timer = 0;
    const open = site => {
      if (!site) return;
      detailTrigger.current = null;
      if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
      setPage('overview');
      setConfirmClear(false);
      setDeleteTarget(null);
      setIgnoreTarget(null);
      setFilterSite('');
      setRange({ preset: 'today', start: 0, end: 0 });
      window.clearTimeout(timer);
      // Let a settings page or open dialog leave first, then open the drawer.
      timer = window.setTimeout(() => { if (live) setSelected(site); }, 0);
    };
    const onHash = () => open(siteFromLocationHash(location.hash));
    if (jumpSite) open(jumpSite);
    window.addEventListener('hashchange', onHash);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', onHash);
    };
  }, [jumpSite]);
  useEffect(() => {
    if (!isExtension) return undefined;
    let stop = () => {};
    let live = true;
    import('wxt/browser').then(({ browser }) => {
      if (!live) return;
      const onChange = (changes, area) => {
        if (area === 'local' && changes.settings) setSettings(validateSettings(changes.settings.newValue));
      };
      browser.storage.onChanged.addListener(onChange);
      stop = () => browser.storage.onChanged.removeListener(onChange);
    }).catch(loadError => console.error('PageTime could not watch settings', loadError));
    return () => { live = false; stop(); };
  }, []);
  const shown = ready && view;
  const enabled = view?.enabled ?? true;
  const goRecords = (domain = '') => { setSite(domain); setSearch(domain); setPage('records'); };
  const openSite = (domain, event) => { detailTrigger.current = event.currentTarget; setSelected(domain); };
  const onFilter = domain => setFilterSite(current => toggleSiteFilter(current, domain));
  const problem = error || ledger.error;
  const overviewStatus = problem && !view ? 'error' : dashboardStatus({ view, pending: !ready || ledger.pending });
  const errorText = t([`error.${problem}`, 'error.connect']);
  const languageName = languages.find(([code]) => code === i18n.resolvedLanguage)?.[1];
  const links = docLinks(i18n.resolvedLanguage);
  const idleLabel = t('settings.idle.option', { count: settings.idleSeconds / 60 });
  const themeLabel = t(`settings.theme.${settings.theme}`);
  const isDark = useDocumentTheme(settings.theme, ready);
  const saveSettings = next => act('settings', { settings: next });
  const selectedRow = stats?.rows.find(row => row.domain === selected);
  const sessions = view?.spans.filter(span => (span.site ?? span.domain) === selected) ?? [];
  const listField = settings.recordMode === 'whitelist' ? 'allowed' : 'ignored';
  const scopeHost = selected ? normalizeHost(selected) : null;
  const alreadyListed = selected ? (listField === 'allowed' ? isAllowed(selected, settings.allowed) : isIgnored(selected, settings.ignored)) : false;
  const listLimit = (settings[listField]?.length ?? 0) >= IGNORED_LIMIT;
  const confirmKey = listField === 'allowed' ? 'allowConfirm' : 'ignoreConfirm';
  async function confirmListAdd() {
    const host = normalizeHost(ignoreTarget);
    const current = settings[listField] ?? [];
    const covered = listField === 'allowed' ? isAllowed(host, current) : isIgnored(host, current);
    if (!host || covered) { setIgnoreTarget(null); return; }
    if (current.length >= IGNORED_LIMIT) return;
    if (await saveSettings({ ...settings, [listField]: [...current, host] })) setIgnoreTarget(null);
  }
  const rangeSince = ledger.rangeSince ?? now;
  const onSelectDay = at => {
    // `today` is from the last render. A dashboard left open across midnight would
    // otherwise treat yesterday's bar as the today preset and open the new day.
    const next = singleDayRange(at, midnight(Date.now()), rangeSince);
    if (next) setRange(next);
  };
  const removeHosts = target => hostsToDelete(target, view?.hosts ?? [], view?.openDomain);

  return <TooltipProvider><AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="sidebar">
        <SidebarHeader className="p-0"><div className="brand"><img src="/icon/48.png" alt="" aria-hidden="true" width="22" height="22" /><span>PageTime</span></div></SidebarHeader>
        <SidebarContent className="sidebar-navigation"><nav aria-label={t('nav.label')}><SidebarMenu className="navigation-menu">
          {[['overview', ChartBar], ['records', Clock], ['settings', GearSix]].map(([key, Icon]) =>
            <SidebarMenuItem key={key}><SidebarMenuButton className="nav-item" size="lg" isActive={page === key} aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}><Icon /><span>{t(`nav.${key}`)}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></nav></SidebarContent>
        <SidebarFooter className="local-note"><ShieldCheck size={21} className="shrink-0" /><span>{t('localNote')}</span></SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar-page">{t(`nav.${page}`)}</span>
          <div className="topbar-actions">
          <div className="record-status"><span className={`status-dot ${enabled ? '' : 'paused'}`} /><div><strong>{enabled ? t('status.recording') : t('status.paused')}</strong><small>{t('status.since', { date: formatDate(view?.since ?? now) })}</small></div></div>
          <Button variant="outline" className="action-button" disabled={busy || !shown} onClick={() => act('toggle')}>{enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{enabled ? t('actions.pause') : t('actions.resume')}</Button>
          </div>
        </header>
        <main className={page === 'overview' ? 'overview-page' : undefined}>
          <div className="page-header"><div><h1 ref={headingRef} tabIndex={-1}>{t(`pages.${page}.title`)}</h1></div>
            {page !== 'settings' && <RangeControl range={active} today={today} since={rangeSince} onChange={setRange} />}
          </div>
          {problem && <Alert variant="destructive" className="my-4"><AlertTitle>{t('error.title')}</AlertTitle><AlertDescription>{errorText}<Button variant="link" size="sm" onClick={() => { ledger.retry(); act(); }}>{t('error.retry')}</Button></AlertDescription></Alert>}
          {page === 'overview' ? (overviewStatus === 'loading' ? <DashboardSkeleton /> : overviewStatus === 'empty' ? <LedgerEmpty /> : overviewStatus === 'ready' ? <Overview compare={ledger.compare} preset={active.preset} todayStats={todayStats} stats={stats} trendDays={ledger.trendDays ?? []} spans={view.spans} hourRows={view.hourRows ?? []} since={view.since} start={start} end={end} today={today} now={now} rangeLabel={chip} chartMode={defaultChart(active)} trendLabel={trendTitle(t, active, today)} filterSite={filterSite} onFilter={onFilter} openSite={openSite} onSelectDay={onSelectDay} isDark={isDark} /> : null) : !shown ? (!problem && <p className="py-8 text-center text-muted-foreground">{t('loading')}</p>) : page === 'records' ? (ledger.pending ? (!problem && <p className="py-8 text-center text-muted-foreground">{t('loading')}</p>) : <section className="records">
            <InputGroup className="records-search h-9 max-w-[420px]"><InputGroupInput aria-label={t('records.search')} placeholder={t('records.placeholder')} value={search} onChange={e => { setSearch(e.target.value); setSite(''); }} /><InputGroupAddon><MagnifyingGlass /></InputGroupAddon>{search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label={t('records.clearSearch')} onClick={() => { setSearch(''); setSite(''); }}><X /></InputGroupButton></InputGroupAddon>}</InputGroup>
            <p className="muted">{t('records.count', { count: view.visitCount })}{view.visitCount > VISIT_LIST_LIMIT ? t('records.limited') : ''}</p>
            <Table><TableHeader><TableRow><TableHead>{t('ranking.site')}</TableHead><TableHead>{t('records.visitedAt')}</TableHead><TableHead>{t('records.details')}</TableHead></TableRow></TableHeader><TableBody>
              {view.visits.map((visit, i) => <TableRow key={`${visit.at}-${i}`}><TableCell><div className="site-link"><SiteIcon domain={visit.domain} site={visit.site} /><span>{visit.domain}</span></div></TableCell><TableCell>{formatDate(visit.at)} {timeLabel(visit.at)}</TableCell><TableCell><Button variant="link" className="px-0" onClick={event => openSite(visit.site ?? visit.domain, event)}>{t('records.view')}<ArrowRight /></Button></TableCell></TableRow>)}
            </TableBody></Table>
            {!view.visits.length && <VisitEmpty end={end} days={view.days} filtered={Boolean(search.trim() || site.trim())} now={now} />}
          </section>) : <section className="settings">
            <div className="setting-row"><h2>{t('settings.language.title')}</h2><DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="action-button" />} aria-label={t('settings.language.label', { language: languageName })}><Translate />{languageName}<CaretDown /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={value => i18n.changeLanguage(value)}>
                {languages.map(([code, name]) => <DropdownMenuRadioItem closeOnClick key={code} value={code} lang={code}>{name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu></div>
            <div className="setting-row"><h2>{t('settings.theme.title')}</h2><DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="action-button" />} aria-label={t('settings.theme.label', { mode: themeLabel })} disabled={busy}>{themeLabel}<CaretDown /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={settings.theme} onValueChange={value => saveSettings({ ...settings, theme: value })}>
                {THEME_MODES.map(mode => <DropdownMenuRadioItem closeOnClick key={mode} value={mode}>{t(`settings.theme.${mode}`)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu></div>
            <div className="setting-row"><h2 id="toolbar-badge">{t('settings.badge.title')}</h2><Switch className="shrink-0" checked={settings.badge} onCheckedChange={checked => saveSettings({ ...settings, badge: checked })} disabled={busy} aria-labelledby="toolbar-badge" /></div>
            <div className="setting-row setting-group"><div className="setting-group-head"><h2>{t('settings.recording.title')}</h2><Button variant="outline" className="action-button" disabled={busy} onClick={() => act('toggle')}>{enabled ? t('actions.pause') : t('actions.enable')}</Button></div>
              <div className="setting-fields">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="min-w-0 flex-1"><h3 id="count-audible">{t('settings.audible.title')}</h3></div><Switch checked={settings.countAudible} onCheckedChange={checked => saveSettings({ ...settings, countAudible: checked })} disabled={busy} aria-labelledby="count-audible" /></div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="min-w-0 flex-1"><h3 id="idle-threshold">{t('settings.idle.title')}</h3><p>{t('settings.idle.description')}</p></div><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="action-button shrink-0" />} aria-label={t('settings.idle.label', { duration: idleLabel })} disabled={busy}>{idleLabel}<CaretDown /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)"><DropdownMenuRadioGroup value={String(settings.idleSeconds)} onValueChange={value => saveSettings({ ...settings, idleSeconds: Number(value) })}>{IDLE_OPTIONS.map(seconds => <DropdownMenuRadioItem closeOnClick key={seconds} value={String(seconds)}>{t('settings.idle.option', { count: seconds / 60 })}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
              </div></div>
            <div className="setting-row setting-group"><div className="min-w-0 flex-1"><h2 id="record-mode">{t('settings.recordMode.title')}</h2>
              <RadioGroup className="mt-4 gap-3" aria-labelledby="record-mode" value={settings.recordMode} disabled={busy} onValueChange={value => { if (value !== settings.recordMode) saveSettings({ ...settings, recordMode: value }); }}>
                {RECORD_MODES.map(mode => <label key={mode} className="flex items-start gap-3"><RadioGroupItem value={mode} className="mt-1" /><span className="min-w-0"><strong>{t(`settings.recordMode.${mode}`)}</strong><p>{t(`settings.recordMode.${mode}Hint`)}</p></span></label>)}
              </RadioGroup>
              {listField === 'allowed' && !(settings.allowed?.length) && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.allowed.emptyWarning')}</AlertTitle></Alert>}
              <h3 className="mt-4">{t(`settings.${listField}.title`)}</h3><IgnoredSites key={listField} field={listField} settings={settings} busy={busy} onSave={saveSettings} />
            </div></div>
            <ExportData />
            <div className="setting-row"><h2>{t('settings.clear.title')}</h2><AlertDialogTrigger render={<Button variant="destructive" className="action-button" disabled={busy} />}><Trash />{t('settings.clear.button')}</AlertDialogTrigger></div>
            <p className="settings-links"><a href={links.timing} target="_blank" rel="noreferrer noopener">{t('settings.docs.timing')}</a><span aria-hidden="true">·</span><a href={links.privacy} target="_blank" rel="noreferrer noopener">{t('settings.docs.privacy')}</a></p>
          </section>}
        </main>
      </div>
    </SidebarProvider>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.description')}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('clear')) { setConfirmClear(false); setFilterSite(''); setSelected(null); } }}>{busy ? t('confirm.clearing') : t('confirm.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t('detail.deleteConfirm.title', { domain: deleteTarget ?? '' })}</AlertDialogTitle><AlertDialogDescription>{t('detail.deleteConfirm.description')}</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{errorText}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('deleteSite', { host: deleteTarget, hosts: removeHosts(deleteTarget) })) { setDeleteTarget(null); setSelected(null); } }}>{busy ? t('detail.deleteConfirm.deleting') : t('detail.deleteConfirm.confirm')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <AlertDialog open={Boolean(ignoreTarget)} onOpenChange={open => { if (!open) setIgnoreTarget(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t(`detail.${confirmKey}.title`)}</AlertDialogTitle><AlertDialogDescription>{t(`detail.${confirmKey}.description`, { domain: ignoreTarget ?? '' })}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('confirm.cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={confirmListAdd}>{t(`detail.${confirmKey}.confirm`)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  {/* Dismissing the drawer clears the open site and leaves the ranking filter in place. */}
  <SiteDetailSheet
    open={Boolean(selected)}
    onOpenChange={open => { if (!open) setSelected(null); }}
    finalFocus={detailFocus}
    siteKey={selected ?? ''}
    ready={Boolean(stats)}
    row={selectedRow}
    detail={ledger.detailSite === selected ? ledger.detail : null}
    sessions={sessions}
    isDark={isDark}
    day={timelineDay(active, today)}
    dayCount={dayCount(start, end)}
    now={now}
    busy={busy}
    listField={listField}
    alreadyListed={alreadyListed}
    scopeHost={scopeHost}
    listLimit={listLimit}
    onListAdd={() => setIgnoreTarget(selected)}
    onViewVisits={() => { goRecords(selected); setSelected(null); }}
    onDelete={() => setDeleteTarget(selected)}
    onSelectDay={onSelectDay}
  />
  </TooltipProvider>;
}
