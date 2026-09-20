import { ContentListView } from '@/components/content/content-list-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface ContentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Content"
        description="What to write next, and why — driven by keyword, search intent, funnel stage and the product each piece is meant to sell."
      />
      <ContentListView mode={mode} />
    </>
  );
}
