import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@app/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@app/components/ui/empty';
import { InputGroup, InputGroupInput } from '@app/components/ui/input-group';
import { IGNORED_LIMIT, normalizeHost } from './settings.mjs';

export function IgnoredSites({ settings, busy, onSave, field = 'ignored' }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const hosts = settings[field] ?? [];
  const text = (key, values) => t(`settings.${field}.${key}`, values);
  function add(event) {
    event.preventDefault();
    const host = normalizeHost(draft);
    if (!host) { setProblem('error'); return; }
    if (!hosts.includes(host) && hosts.length >= IGNORED_LIMIT) { setProblem('limit'); return; }
    setProblem('');
    setDraft('');
    if (!hosts.includes(host)) onSave({ ...settings, [field]: [...hosts, host] });
  }
  return <div className="mt-4 flex min-w-0 flex-col gap-3">
    <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
      <InputGroup className="h-11 min-w-48 flex-1">
        <InputGroupInput aria-label={text('input')} placeholder={text('placeholder')} value={draft} aria-invalid={problem === 'error' || undefined} onChange={event => { setDraft(event.target.value); setProblem(''); }} />
      </InputGroup>
      <Button type="submit" variant="outline" className="action-button" disabled={busy}>{text('add')}</Button>
    </form>
    {problem && <p className="text-sm text-destructive" role="alert">{problem === 'limit' ? text('limit', { count: IGNORED_LIMIT }) : text('error')}</p>}
    {hosts.length ? <ul className="flex flex-col gap-2">
      {hosts.map(host => <li key={host} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5">
        <span className="min-w-0 break-all text-sm">{host}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={text('remove', { domain: host })} disabled={busy} onClick={() => onSave({ ...settings, [field]: hosts.filter(item => item !== host) })}><X /></Button>
      </li>)}
    </ul> : <Empty className="flex-none border border-dashed py-6"><EmptyHeader><EmptyTitle>{text('emptyTitle')}</EmptyTitle><EmptyDescription>{text('emptyDescription')}</EmptyDescription></EmptyHeader></Empty>}
  </div>;
}
