import React, { useState } from 'react';
import { CircleNotch, DownloadSimple, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { exportLedger } from './export-file.js';

const KINDS = ['json', 'csv'];

export function ExportData() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(''), [saved, setSaved] = useState(''), [failed, setFailed] = useState(false);
  async function run(kind) {
    setPending(kind); setSaved(''); setFailed(false);
    try { setSaved(await exportLedger(kind)); }
    catch (error) { console.error('PageTime could not export the ledger', error); setFailed(true); }
    finally { setPending(''); }
  }
  return <div className="setting-row flex-wrap" aria-busy={Boolean(pending)}>
    <div className="min-w-64 flex-1"><h2>{t('settings.export.title')}</h2><p>{t('settings.export.description')}</p>
      <p className="flex items-start gap-2"><ShieldCheck size={18} className="privacy-icon mt-1" />{t('settings.export.note')}</p>
      {pending && <p role="status">{t('settings.export.exporting')}</p>}
      {saved && <p role="status">{t('settings.export.done', { file: saved })}</p>}
      {failed && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.export.errorTitle')}</AlertTitle><AlertDescription>{t('settings.export.error')}</AlertDescription></Alert>}
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      {KINDS.map(kind => <Button key={kind} variant="outline" className="action-button" disabled={Boolean(pending)} onClick={() => run(kind)}>
        {pending === kind ? <CircleNotch className="animate-spin" /> : <DownloadSimple />}{t(`settings.export.${kind}`)}
      </Button>)}
    </div>
  </div>;
}
