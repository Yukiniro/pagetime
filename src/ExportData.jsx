import React, { useRef, useState } from 'react';
import { CircleNotch, DownloadSimple, ShieldCheck, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { isExtension } from './data.js';
import { exportLedger } from './export-file.js';
import { restoreBackupFile } from './import-file.js';

const KINDS = ['json', 'csv'];
const RESTORE_ERRORS = {
  format: 'errorFormat',
  version: 'errorVersion',
  structure: 'errorStructure',
  read: 'errorRead',
  save: 'errorSave',
  preview: 'restorePreview',
};

export function ExportData() {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const busy = useRef(false);
  const [pending, setPending] = useState('');
  const [saved, setSaved] = useState('');
  const [restored, setRestored] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const chosen = useRef(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  function resetNotices() {
    setSaved('');
    setRestored(false);
    setFailed(false);
    setRestoreError('');
  }

  async function run(kind) {
    setPending(kind);
    resetNotices();
    try { setSaved(await exportLedger(kind)); }
    catch (error) { console.error('PageTime could not export the ledger', error); setFailed(true); }
    finally { setPending(''); }
  }

  function chooseFile(event) {
    const next = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!isExtension || !next) return;
    chosen.current = next;
    setRestoreError('');
    setRestored(false);
    setFailed(false);
    setConfirmRestore(true);
  }

  function closeRestore(open) {
    if (busy.current) return;
    setConfirmRestore(open);
    if (!open) chosen.current = null;
  }

  async function runRestore() {
    const file = chosen.current;
    if (!file || busy.current) return;
    busy.current = true;
    setPending('restore');
    resetNotices();
    try {
      await restoreBackupFile(file);
      setRestored(true);
      chosen.current = null;
      setConfirmRestore(false);
    } catch (error) {
      console.error('PageTime could not restore the ledger', error);
      setRestoreError(RESTORE_ERRORS[error?.code] ? error.code : 'save');
    } finally {
      busy.current = false;
      setPending('');
    }
  }

  const restoreKey = RESTORE_ERRORS[restoreError];
  return <div className="setting-row flex-wrap" aria-busy={Boolean(pending)}>
    <div className="min-w-64 flex-1"><h2>{t('settings.export.title')}</h2><p>{t('settings.export.description')}</p>
      <p className="flex items-start gap-2"><ShieldCheck size={18} className="privacy-icon mt-1" />{t('settings.export.note')}</p>
      {!isExtension && <p>{t('settings.export.restorePreview')}</p>}
      {pending && <p role="status">{pending === 'restore' ? t('settings.export.restoring') : t('settings.export.exporting')}</p>}
      {saved && <p role="status">{t('settings.export.done', { file: saved })}</p>}
      {restored && <p role="status">{t('settings.export.restored')}</p>}
      {failed && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.export.errorTitle')}</AlertTitle><AlertDescription>{t('settings.export.error')}</AlertDescription></Alert>}
      {restoreKey && !confirmRestore && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.export.restoreErrorTitle')}</AlertTitle><AlertDescription>{t(`settings.export.${restoreKey}`)}</AlertDescription></Alert>}
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      {KINDS.map(kind => <Button key={kind} variant="outline" className="action-button" disabled={Boolean(pending)} onClick={() => run(kind)}>
        {pending === kind ? <CircleNotch className="animate-spin" /> : <DownloadSimple />}{t(`settings.export.${kind}`)}
      </Button>)}
      <Button variant="outline" className="action-button" disabled={Boolean(pending) || !isExtension} onClick={() => fileRef.current?.click()}>
        {pending === 'restore' ? <CircleNotch className="animate-spin" /> : <UploadSimple />}{t('settings.export.restore')}
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={chooseFile} />
    </div>
    <AlertDialog open={confirmRestore} onOpenChange={closeRestore}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.export.restoreTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('settings.export.restoreDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        {restoreKey && <Alert variant="destructive"><WarningCircle /><AlertTitle>{t('settings.export.restoreErrorTitle')}</AlertTitle><AlertDescription>{t(`settings.export.${restoreKey}`)}</AlertDescription></Alert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(pending)}>{t('confirm.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={Boolean(pending)} onClick={() => { void runRestore(); }}>{pending === 'restore' ? t('settings.export.restoring') : t('settings.export.restoreConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
