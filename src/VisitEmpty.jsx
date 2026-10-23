import { Empty, EmptyHeader, EmptyTitle } from '@app/components/ui/empty';
import { useTranslation } from 'react-i18next';
import { DETAIL_DAYS } from './model.mjs';
import { visitEmptyKind } from './range.mjs';

export function VisitEmpty({ end, days, filtered, now }) {
  const { t } = useTranslation();
  const kind = visitEmptyKind({ end, days, filtered }, now);
  return <Empty data-empty={kind}><EmptyHeader><EmptyTitle>{kind === 'expired' ? t('records.expired', { count: DETAIL_DAYS }) : t('records.empty')}</EmptyTitle></EmptyHeader></Empty>;
}
