import { useState } from 'react';
import { CalendarBlank, CaretDown } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import { useTranslation } from 'react-i18next';
import { formatDate } from './i18n.js';
import { addDays, dateKey, dateKeyStart } from './model.mjs';
import { customRange, presetRange } from './range.mjs';
import { presetLabel } from './range-label.mjs';

const PRESETS = ['today', '7d', '30d', 'custom'];

export function RangeControl({ range, today, onChange }) {
  const { t } = useTranslation();
  const [drafting, setDrafting] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const title = presetLabel(t, range.preset);
  const last = addDays(range.end, -1);
  const dates = `${formatDate(range.start, { month: '2-digit', day: '2-digit' })}–${formatDate(last, { month: '2-digit', day: '2-digit' })}`;
  const showDates = range.preset !== 'today';
  const spoken = showDates ? `${title} ${dates}` : title;
  const parsedStart = dateKeyStart(draftStart);
  const parsedEnd = dateKeyStart(draftEnd);
  const invalid = parsedStart !== null && parsedEnd !== null && parsedEnd < parsedStart;
  const ordered = parsedStart !== null && parsedEnd !== null && parsedEnd >= parsedStart;

  function openCustom() {
    setDraftStart(dateKey(range.start));
    setDraftEnd(dateKey(last));
    setDrafting(true);
  }

  function applyPreset(preset) {
    setDrafting(false);
    onChange(presetRange(preset, today));
  }

  function applyCustom() {
    const next = customRange(draftStart, draftEnd);
    if (!next) return;
    setDrafting(false);
    onChange(next);
  }

  return <div className="range-control">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="range" />} aria-label={t('range.label', { range: spoken })}>
        <CalendarBlank /><span>{title}</span>{showDates && <span className="range-dates">{dates}</span>}<CaretDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuRadioGroup value={range.preset} onValueChange={value => { if (value === 'custom') openCustom(); else applyPreset(value); }}>
          {PRESETS.map(preset => <DropdownMenuRadioItem closeOnClick key={preset} value={preset} onClick={preset === 'custom' ? openCustom : undefined}>{presetLabel(t, preset)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {drafting && <form className="range-panel" aria-label={t('range.custom')} onSubmit={event => { event.preventDefault(); applyCustom(); }} onKeyDown={event => { if (event.key === 'Escape') setDrafting(false); }}>
      <label className="range-field"><span>{t('range.start')}</span><Input type="date" autoFocus value={draftStart} max={dateKey(today)} aria-invalid={invalid || undefined} onChange={event => setDraftStart(event.target.value)} /></label>
      <label className="range-field"><span>{t('range.end')}</span><Input type="date" value={draftEnd} max={dateKey(today)} aria-invalid={invalid || undefined} onChange={event => setDraftEnd(event.target.value)} /></label>
      {invalid && <p className="range-invalid" role="alert">{t('range.invalid')}</p>}
      <div className="range-actions">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDrafting(false)}>{t('range.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!ordered}>{t('range.apply')}</Button>
      </div>
    </form>}
  </div>;
}
