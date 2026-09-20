import { SeoOverviewView } from '@/components/seo/seo-overview-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface SeoPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SeoOverviewPage({ searchParams }: SeoPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="SEO Audit"
        description="Rule-based checks over stored page snapshots: what is missing, why it matters, and what to change."
      />
      <SeoOverviewView mode={mode} />
    </>
  );
}
