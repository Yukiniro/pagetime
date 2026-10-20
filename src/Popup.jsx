import { useEffect, useState } from 'react';
import { ArrowRight, Pause, Play } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Switch } from '@app/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Skeleton } from '@app/components/ui/skeleton';
import { command, isExtension } from './data.js';
import { duration } from './i18n.js';
import { DEFAULT_SETTINGS, IGNORED_LIMIT } from './settings.mjs';
import { activeRecordableHost, listAction, openDashboardPage, toggleListedHost } from './popup-model.mjs';
import { usePopupQuery } from './use-popup.js';
import { useDocumentTheme } from './use-theme.js';

async function readActiveHost() {
  const { browser } = await import('wxt/browser');
  return activeRecordableHost(query => browser.tabs.query(query));
}

function PopupSkeleton() {
  const { t } = useTranslation();
  return <main className="popup popup-skeleton" data-status="loading" aria-busy="true" aria-live="polite" aria-label={t('loading')}>
    <Skeleton className="popup-skel-status" />
    <Skeleton className="popup-skel-figure" />
    <Skeleton className="popup-skel-line" />
    <Skeleton className="popup-skel-button" />
    <Skeleton className="popup-skel-button" />
    <Skeleton className="popup-skel-line" />
  </main>;
}

export function Popup() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [host, setHost] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const query = usePopupQuery(host, settings.siteMerge);
  const isDark = useDocumentTheme(settings.theme, ready);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await command('snapshot');
        const next = await command('settings');
        const current = isExtension ? await readActiveHost() : null;
        if (!live) return;
        setSettings(next);
        setHost(current);
        setError('');
        setReady(true);
      } catch (cause) {
        if (live) setError(cause instanceof Error && cause.message ? cause.message : 'connect');
      }
    })();
    return () => { live = false; };
  }, [attempt]);

  const figures = query.figures;
  const settled = Boolean(ready && figures && !figures.error && figures.hostKey === (host ?? '') && figures.merge === settings.siteMerge);
  const problem = error || query.error || figures?.error || '';
  const action = settled && host ? listAction(settings, host) : null;
  async function run(task) {
    setBusy(true);
    try {
      await task();
      setError('');
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'save');
    } finally {
      setBusy(false);
    }
  }
  const onList = () => run(async () => {
    if (!action || action.disabled) return;
    const current = await command('settings');
    const list = toggleListedHost(current[action.field], action.host);
    if (list === current[action.field]) return;
    setSettings(await command('settings', { settings: { ...current, [action.field]: list } }));
  });
  const onBadge = checked => run(async () => {
    const current = await command('settings');
    setSettings(await command('settings', { settings: { ...current, badge: checked } }));
  });
  const onPause = () => run(() => command('toggle'));
  const onOpen = () => run(async () => {
    const { browser } = await import('wxt/browser');
    await openDashboardPage(browser);
  });

  if (!settled) {
    if (!problem) return <PopupSkeleton />;
    return <main className="popup" data-status="error">
      <Alert variant="destructive">
        <AlertTitle>{t('error.title')}</AlertTitle>
        <AlertDescription>{t([`error.${problem}`, 'error.connect'])}<Button variant="link" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('error.retry')}</Button></AlertDescription>
      </Alert>
    </main>;
  }

  const enabled = figures.enabled !== false;
  const primary = duration(figures.site ? figures.siteMs : figures.total);
  const total = duration(figures.total);
  return <main className="popup" data-status="ready" data-paused={enabled ? 'false' : 'true'} data-theme={isDark ? 'dark' : 'light'} data-total-ms={figures.total}>
    <p className="popup-status"><span className={`status-dot ${enabled ? '' : 'paused'}`} /><strong>{enabled ? t('status.recording') : t('status.paused')}</strong></p>
    <div className="popup-figures">
      <h1 className="popup-host">{figures.site ?? t('popup.totalOnly')}</h1>
      <p className="popup-figure" data-figure={figures.site ? 'site' : 'total'} data-site-ms={figures.site ? figures.siteMs : undefined} aria-label={t('popup.siteToday', { duration: primary })}>{primary}</p>
      {figures.site && <p className="popup-total">{t('popup.total', { duration: total })}</p>}
    </div>
    {problem && <Alert variant="destructive"><AlertTitle>{t('error.title')}</AlertTitle><AlertDescription>{t([`error.${problem}`, 'error.connect'])}</AlertDescription></Alert>}
    <div className="popup-actions">
      {action && <Button variant="outline" className="action-button" disabled={busy || action.disabled} title={action.disabled ? t(`settings.${action.field}.limit`, { count: IGNORED_LIMIT }) : undefined} onClick={onList}>{t(`popup.${action.label}`)}</Button>}
      <Button variant="outline" className="action-button" disabled={busy} onClick={onPause}>{enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{enabled ? t('popup.pause') : t('popup.resume')}</Button>
    </div>
    <div className="popup-badge">
      <span id="popup-badge">{t('settings.badge.title')}</span>
      <Switch checked={settings.badge} onCheckedChange={onBadge} disabled={busy} aria-labelledby="popup-badge" />
    </div>
    <Button variant="link" className="popup-open" disabled={busy} onClick={onOpen}>{t('popup.open')}<ArrowRight /></Button>
  </main>;
}
