import { X } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { timingCopy } from './model.mjs';
import { MERGE_MODES } from './settings.mjs';

const counted = ['focus', 'web', 'navigation'];
const notCounted = ['idle', 'locked', 'unfocused', 'internal', 'incognito', 'paused', 'gap', 'ignored'];

export function HowItWorksDialog({ open, onOpenChange, finalFocus, settings }) {
  const { t } = useTranslation();
  const copy = timingCopy(settings);
  const notCountedText = key => {
    if (key === 'idle') return t('howItWorks.notCounted.idle', { count: copy.idle });
    if (key === 'gap') return t('howItWorks.notCounted.gap', { count: copy.gap });
    if (key === 'ignored') return t('howItWorks.notCounted.ignored', { count: settings?.ignored?.length ?? 0 });
    return t(`howItWorks.notCounted.${key}`);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden break-words p-7 sm:max-w-[520px]" finalFocus={finalFocus} showCloseButton={false}>
      <DialogHeader className="pr-8">
        <DialogTitle className="text-xl">{t('howItWorks.title')}</DialogTitle>
        <DialogDescription>{t('howItWorks.intro')}</DialogDescription>
      </DialogHeader>
      <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" />} aria-label={t('howItWorks.close')}><X /></DialogClose>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.counted.title')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {counted.map(key => <li key={key}>{t(`howItWorks.counted.${key}`)}</li>)}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.notCounted.title')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {notCounted.map(key => <li key={key}>{notCountedText(key)}</li>)}
          {copy.countAudible && <li>{t('settings.method.audible')}</li>}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.limits.title')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>{t('howItWorks.limits.audible')}</li>
          <li>{t('howItWorks.limits.threshold')}</li>
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.visits.title')}</h3>
        <p>{t('howItWorks.visits.description')}</p>
      </section>
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.merge.title')}</h3>
        <p>{t('howItWorks.merge.storage')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {MERGE_MODES.map(mode => <li key={mode}>{t(`howItWorks.merge.${mode}`)}</li>)}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3>{t('howItWorks.privacy.title')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>{t('howItWorks.privacy.fields')}</li>
          <li>{t('howItWorks.privacy.local')}</li>
          <li>{t('howItWorks.privacy.delete')}</li>
          <li>{t('howItWorks.privacy.retention', { count: copy.days })}</li>
          <li>{t('howItWorks.privacy.save', { count: copy.checkpoint })}</li>
        </ul>
      </section>
      </div>
    </DialogContent>
  </Dialog>;
}
