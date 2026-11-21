import { FunnelView } from '@/components/funnel/funnel-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';
import { DEFAULT_ANALYTICS_RANGE } from '@/services/analytics-service';
import {
  CHANNEL_PARAM,
  END_PARAM,
  firstParam,
  parseChannelParam,
  parseEndParam,
  parseRangeParam,
  RANGE_PARAM,
} from '@/domain/url-params';

interface FunnelPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FunnelPage({ searchParams }: FunnelPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);
  const range = parseRangeParam(firstParam(params[RANGE_PARAM]), DEFAULT_ANALYTICS_RANGE);
  const channel = parseChannelParam(firstParam(params[CHANNEL_PARAM]));
  const end = parseEndParam(firstParam(params[END_PARAM]), range);

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Where one population of sessions is lost on the way to a purchase, and what to check at each step."
      />
      <FunnelView
        mode={mode}
        initialRange={range}
        initialChannel={channel}
        initialEnd={end}
      />
    </>
  );
}
