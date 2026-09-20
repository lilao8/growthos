import { ProductDetailView } from '@/components/products/product-detail-view';
import { parseDemoDataMode } from '@/services/demo-data-source';

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

  return <ProductDetailView productId={id} mode={mode} />;
}
