import { useEffect, useEffectEvent, useState } from 'react';
import { CalendarBlank, CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import { useTranslation } from 'react-i18next';
import { formatDate } from './i18n.js';
import { addDays, dateKey, dateKeyStart } from './model.mjs';
import { applyCustomRange, customRange, dayCount, presetRange, shiftRange } from './range.mjs';
import { presetLabel, singleDayLabel } from './range-label.mjs';

const PRESETS = ['today', '7d', '30d', 'custom'];
const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function shortcutBlocked(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true;
  const target = event.target;
  if (target instanceof Element && target.closest(FIELD)) return true;
  for (const node of document.querySelectorAll('[role="menu"], [role="dialog"], [role="alertdialog"]')) {
    if (node instanceof HTMLElement && (node.hidden || node.closest('[hidden]'))) continue;
    return true;
  }
  return false;
}

export function RangeControl({ range, today, since, onChange }) {
  const { t } = useTranslation();
  const [drafting, setDrafting] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const last = addDays(range.end, -1);
  const singleCustom = range.preset === 'custom' && dayCount(range.start, range.end) === 1;
  const title = singleCustom ? singleDayLabel(range.start) : presetLabel(t, range.preset);
  const dates = `${formatDate(range.start, { month: '2-digit', day: '2-digit' })}–${formatDate(last, { month: '2-digit', day: '2-digit' })}`;
  const showDates = range.preset !== 'today' && !singleCustom;
  const spoken = showDates ? `${title} ${dates}` : title;
  const earlier = shiftRange(range, -1, today, since);
  const later = shiftRange(range, 1, today, since);
  const parsedStart = dateKeyStart(draftStart);
  const parsedEnd = dateKeyStart(draftEnd);
  const invalid = parsedStart !== null && parsedEnd !== null && parsedEnd < parsedStart;
  const draftRange = customRange(draftStart, draftEnd, since);

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
    if (!applyCustomRange(draftStart, draftEnd, since, onChange)) return;
    setDrafting(false);
  }

  function step(next) {
    if (!next) return;
    setDrafting(false);
    onChange(next);
  }

  const onStep = useEffectEvent(step);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || shortcutBlocked(event)) return;
      const next = shiftRange(range, event.key === 'ArrowLeft' ? -1 : 1, today, since);
      if (!next) return;
      event.preventDefault();
      onStep(next);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [range, today, since]);

  return <div className="range-control">
    <Button type="button" variant="outline" size="icon" className="range-step" aria-label={t('range.previous')} disabled={!earlier} onClick={() => step(earlier)}><CaretLeft /></Button>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="range" />} aria-label={t('range.label', { range: spoken })}>
        <CalendarBlank /><span className="range-text"><span className="range-title">{title}</span>{showDates && <span className="range-dates">{dates}</span>}</span><CaretDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuRadioGroup value={range.preset} onValueChange={value => { if (value === 'custom') openCustom(); else applyPreset(value); }}>
          {PRESETS.map(preset => <DropdownMenuRadioItem closeOnClick key={preset} value={preset} onClick={preset === 'custom' ? openCustom : undefined}>{presetLabel(t, preset)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button type="button" variant="outline" size="icon" className="range-step" aria-label={t('range.next')} disabled={!later} onClick={() => step(later)}><CaretRight /></Button>
    {drafting && <form className="range-panel" aria-label={t('range.custom')} onSubmit={event => { event.preventDefault(); applyCustom(); }} onKeyDown={event => { if (event.key === 'Escape') setDrafting(false); }}>
      <label className="range-field"><span>{t('range.start')}</span><Input type="date" autoFocus value={draftStart} min={dateKey(since)} max={dateKey(today)} aria-invalid={invalid || undefined} onChange={event => setDraftStart(event.target.value)} /></label>
      <label className="range-field"><span>{t('range.end')}</span><Input type="date" value={draftEnd} min={dateKey(since)} max={dateKey(today)} aria-invalid={invalid || undefined} onChange={event => setDraftEnd(event.target.value)} /></label>
      {invalid && <p className="range-invalid" role="alert">{t('range.invalid')}</p>}
      <div className="range-actions">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDrafting(false)}>{t('range.cancel')}</Button>
        <Button type="submit" size="sm" disabled={!draftRange}>{t('range.apply')}</Button>
      </div>
    </form>}
  </div>;
}
