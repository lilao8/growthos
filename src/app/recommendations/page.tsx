import { RecommendationsView } from '@/components/recommendations/recommendations-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface RecommendationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RecommendationsPage({
  searchParams,
}: RecommendationsPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Recommendations"
        description="Everything the rule engines currently report, in one list — with the evidence behind each item and somewhere to go and act on it."
      />
      <RecommendationsView mode={mode} />
    </>
  );
}
