import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@app/components/ui/empty';
import { InputGroup, InputGroupInput } from '@app/components/ui/input-group';
import { IGNORED_LIMIT, normalizeHost } from './settings.mjs';

export function IgnoredSites({ settings, busy, onSave }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const ignored = settings.ignored ?? [];
  function add(event) {
    event.preventDefault();
    const host = normalizeHost(draft);
    if (!host) { setProblem('error'); return; }
    if (!ignored.includes(host) && ignored.length >= IGNORED_LIMIT) { setProblem('limit'); return; }
    setProblem('');
    setDraft('');
    if (!ignored.includes(host)) onSave({ ...settings, ignored: [...ignored, host] });
  }
  return <div className="mt-4 flex min-w-0 flex-col gap-3">
    <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
      <InputGroup className="h-11 min-w-48 flex-1">
        <InputGroupInput aria-label={t('settings.ignored.input')} placeholder={t('settings.ignored.placeholder')} value={draft} aria-invalid={problem === 'error' || undefined} onChange={event => { setDraft(event.target.value); setProblem(''); }} />
      </InputGroup>
      <Button type="submit" variant="outline" className="action-button" disabled={busy}>{t('settings.ignored.add')}</Button>
    </form>
    {problem && <p className="text-sm text-destructive" role="alert">{problem === 'limit' ? t('settings.ignored.limit', { count: IGNORED_LIMIT }) : t('settings.ignored.error')}</p>}
    {ignored.length ? <ul className="flex flex-col gap-2">
      {ignored.map(host => <li key={host} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5">
        <span className="min-w-0 break-all text-sm">{host}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('settings.ignored.remove', { domain: host })} disabled={busy} onClick={() => onSave({ ...settings, ignored: ignored.filter(item => item !== host) })}><X /></Button>
      </li>)}
    </ul> : <Empty className="flex-none border border-dashed py-6"><EmptyHeader><EmptyTitle>{t('settings.ignored.emptyTitle')}</EmptyTitle><EmptyDescription>{t('settings.ignored.emptyDescription')}</EmptyDescription></EmptyHeader></Empty>}
  </div>;
}
