import { AnalyticsView } from '@/components/analytics/analytics-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Traffic, revenue and acquisition cost by channel, on one shared set of definitions."
      />
      <AnalyticsView mode={mode} />
    </>
  );
}
