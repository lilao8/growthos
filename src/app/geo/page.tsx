import { GeoOverviewView } from '@/components/geo/geo-overview-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface GeoPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GeoOverviewPage({ searchParams }: GeoPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="GEO Audit"
        description="How ready each page's content is to be understood and quoted by a generative search system — measured by observable structure, not by asking an AI."
      />
      <GeoOverviewView mode={mode} />
    </>
  );
}
