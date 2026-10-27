import React, { useRef, useState } from 'react';
import { CircleNotch, DownloadSimple, ShieldCheck, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { isExtension } from './data.js';
import { exportLedger } from './export-file.js';
import { ExportSummary } from './export-summary.jsx';
import { BackupSummary } from './backup-summary.jsx';
import { readBackupFile, restoreBackup } from './import-file.js';

const KINDS = ['json', 'csv'];
const RESTORE_ERRORS = {
  format: 'errorFormat',
  version: 'errorVersion',
  structure: 'errorStructure',
  read: 'errorRead',
  save: 'errorSave',
  preview: 'restorePreview',
};
const PENDING_STATUS = { check: 'settings.export.checking', restore: 'settings.export.restoring' };

export function ExportData() {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const busy = useRef(false);
  const [pending, setPending] = useState('');
  const [saved, setSaved] = useState('');
  const [summary, setSummary] = useState(null);
  const [restored, setRestored] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const chosen = useRef(null);
  const [backupFacts, setBackupFacts] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  function resetNotices() {
    setSaved('');
    setSummary(null);
    setRestored(false);
    setFailed(false);
    setRestoreError('');
  }

  async function run(kind) {
    setPending(kind);
    resetNotices();
    try {
      const result = await exportLedger(kind);
      setSaved(result.name);
      setSummary(result.summary);
    } catch (error) {
      console.error('PageTime could not export the ledger', error);
      setFailed(true);
    } finally { setPending(''); }
  }

  // Only a file that passes every check reaches the confirm. A bad file shows its error and nothing is sent.
  async function chooseFile(event) {
    const next = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!isExtension || !next || busy.current) return;
    busy.current = true;
    chosen.current = null;
    setPending('check');
    resetNotices();
    try {
      const { backup, summary: facts } = await readBackupFile(next);
      chosen.current = backup;
      setBackupFacts(facts);
      setConfirmRestore(true);
    } catch (error) {
      console.error('PageTime could not read the backup', error);
      setRestoreError(RESTORE_ERRORS[error?.code] ? error.code : 'read');
    } finally {
      busy.current = false;
      setPending('');
    }
  }

  function closeRestore(open) {
    if (busy.current) return;
    setConfirmRestore(open);
    if (!open) chosen.current = null;
  }

  async function runRestore() {
    const backup = chosen.current;
    if (!backup || busy.current) return;
    busy.current = true;
    setPending('restore');
    resetNotices();
    try {
      await restoreBackup(backup);
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
  return <div className="setting-row setting-group" aria-busy={Boolean(pending)}>
    <div className="min-w-0"><h2>{t('settings.export.title')}</h2><p>{t('settings.export.description')}</p>
      <p className="flex items-start gap-2"><ShieldCheck size={18} className="privacy-icon mt-1" />{t('settings.export.note')}</p>
      {!isExtension && <p>{t('settings.export.restorePreview')}</p>}
      {pending && <p role="status">{t(PENDING_STATUS[pending] ?? 'settings.export.exporting')}</p>}
      {saved && <div className="export-saved">
        <p role="status" aria-describedby={summary ? 'export-summary' : undefined}>{t('settings.export.done', { file: saved })}</p>
        <ExportSummary summary={summary} />
      </div>}
      {restored && <p role="status">{t('settings.export.restored')}</p>}
      {failed && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.export.errorTitle')}</AlertTitle><AlertDescription>{t('settings.export.error')}</AlertDescription></Alert>}
      {restoreKey && !confirmRestore && <Alert variant="destructive" className="mt-4"><WarningCircle /><AlertTitle>{t('settings.export.restoreErrorTitle')}</AlertTitle><AlertDescription>{t(`settings.export.${restoreKey}`)}</AlertDescription></Alert>}
    </div>
    <div className="setting-actions">
      {KINDS.map(kind => <Button key={kind} variant="outline" className="action-button" disabled={Boolean(pending)} onClick={() => run(kind)}>
        {pending === kind ? <CircleNotch className="animate-spin" /> : <DownloadSimple />}{t(`settings.export.${kind}`)}
      </Button>)}
      <Button variant="outline" className="action-button" disabled={Boolean(pending) || !isExtension} onClick={() => fileRef.current?.click()}>
        {pending === 'check' || pending === 'restore' ? <CircleNotch className="animate-spin" /> : <UploadSimple />}{t('settings.export.restore')}
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={chooseFile} />
    </div>
    <AlertDialog open={confirmRestore} onOpenChange={closeRestore}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.export.restoreTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('settings.export.restoreDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <BackupSummary summary={backupFacts} />
        {restoreKey && <Alert variant="destructive"><WarningCircle /><AlertTitle>{t('settings.export.restoreErrorTitle')}</AlertTitle><AlertDescription>{t(`settings.export.${restoreKey}`)}</AlertDescription></Alert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(pending)}>{t('confirm.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={Boolean(pending)} onClick={() => { void runRestore(); }}>{pending === 'restore' ? t('settings.export.restoring') : t('settings.export.restoreConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
