import { ChartBar, Clock, GearSix, Pause, Play, ShieldCheck } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { useTranslation } from 'react-i18next';
import { formatDate } from './i18n.js';

const PAGES = [['overview', ChartBar], ['records', Clock], ['settings', GearSix]];

export function DashboardChrome({ page, onPage, headingRef, enabled, recordingSince, busy, shown, onToggle, children }) {
  const { t } = useTranslation();
  return <div className="app-shell">
    <header className="masthead">
      <div className="masthead-lead">
        <div className="brand"><img src="/icon/48.png" alt="" aria-hidden="true" width="22" height="22" /><span>PageTime</span></div>
        <nav aria-label={t('nav.label')}>
          {PAGES.map(([key, Icon]) => <Button key={key} type="button" variant="ghost" className="nav-item" aria-current={page === key ? 'page' : undefined} onClick={() => onPage(key)}><Icon aria-hidden="true" /><span>{t(`nav.${key}`)}</span></Button>)}
        </nav>
        <h1 ref={headingRef} tabIndex={-1} className="masthead-title">{t(`pages.${page}.title`)}</h1>
      </div>
      <p className="local-note"><ShieldCheck size={16} aria-hidden="true" /><span>{t('localNote')}</span></p>
      <div className="masthead-actions">
        <div className="record-status"><span className={`status-dot ${enabled ? '' : 'paused'}`} /><div><strong>{enabled ? t('status.recording') : t('status.paused')}</strong><small>{t('status.since', { date: formatDate(recordingSince) })}</small></div></div>
        <Button type="button" variant="outline" className="action-button" disabled={busy || !shown} onClick={onToggle}>{enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{enabled ? t('actions.pause') : t('actions.resume')}</Button>
      </div>
    </header>
    <div className="workspace">{children}</div>
  </div>;
}
