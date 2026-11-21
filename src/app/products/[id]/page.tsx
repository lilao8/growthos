import { ProductDetailView } from '@/components/products/product-detail-view';
import { parseDemoDataMode } from '@/services/demo-data-source';
import {
  CHANNEL_PARAM,
  firstParam,
  parseChannelParam,
  parseRangeParam,
  RANGE_PARAM,
} from '@/domain/url-params';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const raw = query['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);
  // The catalogue's own default is the full 90-day window, all channels.
  const range = parseRangeParam(firstParam(query[RANGE_PARAM]), 90);
  const channel = parseChannelParam(firstParam(query[CHANNEL_PARAM]));

  return (
    <ProductDetailView
      productId={id}
      mode={mode}
      range={range}
      channel={channel}
    />
  );
}
