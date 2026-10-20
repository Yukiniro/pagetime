import { GlobeHemisphereWest } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@app/components/ui/empty';
import { useTranslation } from 'react-i18next';

export function EmptyState({ title, description, action, className = '', status = 'empty' }) {
  return <Empty className={className} data-status={status} role="status">
    <EmptyHeader>
      <EmptyMedia variant="icon"><GlobeHemisphereWest /></EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>;
}

export function LedgerEmpty() {
  const { t } = useTranslation();
  return <EmptyState className="ledger-empty" title={t('empty.title')} description={t('empty.description')} />;
}

export function FilterEmpty({ domain, onClear, className = 'chart-empty', title, description }) {
  const { t } = useTranslation();
  return <EmptyState
    className={className}
    status="filter-empty"
    title={title || t('filter.emptyTitle')}
    description={description || t('filter.emptyDescription', { domain })}
    action={<Button variant="link" onClick={onClear}>{t('filter.clear')}</Button>}
  />;
}
