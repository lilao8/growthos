import { GeoPageView } from '@/components/geo/geo-page-view';
import { parseDemoDataMode } from '@/services/demo-data-source';
import { firstParam, parsePreviewParam, PREVIEW_PARAM } from '@/domain/url-params';

interface GeoDetailPageProps {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GeoDetailPage({
  params,
  searchParams,
}: GeoDetailPageProps) {
  const [{ pageId }, query] = await Promise.all([params, searchParams]);
  const raw = query['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  const preview = parsePreviewParam(firstParam(query[PREVIEW_PARAM]));

  return <GeoPageView pageId={pageId} mode={mode} preview={preview} />;
}
