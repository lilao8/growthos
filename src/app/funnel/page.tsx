import { FunnelView } from '@/components/funnel/funnel-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface FunnelPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FunnelPage({ searchParams }: FunnelPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Where one population of sessions is lost on the way to a purchase, and what to check at each step."
      />
      <FunnelView mode={mode} />
    </>
  );
}
