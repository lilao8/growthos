import { SeoPageView } from '@/components/seo/seo-page-view';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface SeoDetailPageProps {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SeoDetailPage({
  params,
  searchParams,
}: SeoDetailPageProps) {
  const [{ pageId }, query] = await Promise.all([params, searchParams]);
  const raw = query['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return <SeoPageView pageId={pageId} mode={mode} />;
}
