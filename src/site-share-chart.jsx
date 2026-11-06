import { Button } from '@app/components/ui/button';
import { useTranslation } from 'react-i18next';
import { duration } from './i18n.js';
import { reducedMotion } from './retarget-motion.mjs';
import { siteShareParts } from './site-share.mjs';
import { timelineSwatchesFor } from './theme.mjs';

export function SiteShareChart({ rows, total, focusSite = '', rangeLabel = '', isDark = false, onOpenSite }) {
  const { t } = useTranslation();
  const model = siteShareParts(rows, total, { focus: focusSite, swatches: timelineSwatchesFor(isDark) });
  const filtered = Boolean(focusSite);
  function openLedger() {
    const ledger = document.getElementById('site-ledger');
    if (!ledger) return;
    ledger.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const field = ledger.querySelector('input') || ledger;
    field.focus?.();
  }
  function activate(part, event) {
    if (part.kind === 'site') onOpenSite?.(part.domain, event);
    else openLedger();
  }
  const nameOf = part => (part.kind === 'site' ? part.domain : part.kind === 'rest' ? t('share.rest') : t('timeline.other'));
  return <div className="site-share">
    <p className="chart-caption">{rangeLabel}{filtered && <><span>·</span>{t('share.ofAll')}</>}</p>
    {model.parts.length ? <>
      <div className="share-bar" aria-hidden="true">
        {model.parts.map(part => <button key={part.key} type="button" tabIndex={-1} className="share-segment" data-key={part.key} style={{ width: `${part.width}%`, background: part.color }} onClick={event => activate(part, event)} />)}
      </div>
      <ul className="share-list">
        {model.parts.map(part => {
          const name = nameOf(part);
          return <li key={part.key} data-kind={part.kind}>
            <Button variant="ghost" className="share-line" onClick={event => activate(part, event)}>
              <i className="share-swatch" style={{ background: part.color }} aria-hidden="true" />
              <span className="share-name">{name}</span>
              <span className="share-metrics"><span>{duration(part.ms)}</span><span className="share-percent">{part.label}</span></span>
              {part.kind !== 'site' && <span className="share-jump">{t('share.viewAllLabel')}</span>}
            </Button>
          </li>;
        })}
      </ul>
    </> : <p className="share-empty">{t('share.empty')}</p>}
  </div>;
}
