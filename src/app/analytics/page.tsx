import { AnalyticsView } from '@/components/analytics/analytics-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';
import { DEFAULT_ANALYTICS_RANGE } from '@/services/analytics-service';
import {
  END_PARAM,
  firstParam,
  parseEndParam,
  parseRangeParam,
  RANGE_PARAM,
} from '@/domain/url-params';

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);
  const range = parseRangeParam(firstParam(params[RANGE_PARAM]), DEFAULT_ANALYTICS_RANGE);
  const end = parseEndParam(firstParam(params[END_PARAM]), range);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Traffic, revenue and acquisition cost by channel, on one shared set of definitions."
      />
      <AnalyticsView mode={mode} initialRange={range} initialEnd={end} />
    </>
  );
}
