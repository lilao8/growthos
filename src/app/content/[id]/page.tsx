import { ContentDetailView } from '@/components/content/content-detail-view';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface ContentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: ContentDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const raw = query['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return <ContentDetailView ideaId={id} mode={mode} />;
}
