import { Skeleton } from '@app/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

function RankSkeleton() {
  return <div className="rank-card ledger-card" aria-hidden="true">
    <div className="rank-card-head"><Skeleton className="skel-title" /></div>
    {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="skel-rank" />)}
  </div>;
}

export function DashboardSkeleton() {
  const { t } = useTranslation();
  return <div className="dashboard-skeleton" data-status="loading" aria-busy="true" aria-live="polite" aria-label={t('loading')}>
    <section className="kpi ledger-card" aria-hidden="true">
      <div className="kpi-item primary"><Skeleton className="skel-label" /><Skeleton className="skel-kpi" /><Skeleton className="skel-compare" /></div>
      <div className="kpi-item"><Skeleton className="skel-label" /><Skeleton className="skel-kpi" /><Skeleton className="skel-compare" /></div>
      <div className="kpi-item"><Skeleton className="skel-label" /><Skeleton className="skel-kpi" /><Skeleton className="skel-compare" /></div>
    </section>
    <section className="chart-card ledger-card" aria-hidden="true">
      <div className="chart-head"><Skeleton className="skel-tabs" /></div>
      <Skeleton className="skel-chart" />
    </section>
    <section className="rank-section" aria-hidden="true">
      <div className="rank-grid"><RankSkeleton /><RankSkeleton /></div>
    </section>
    <Skeleton className="skel-heatmap ledger-card" aria-hidden="true" />
  </div>;
}
