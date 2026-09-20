import { ProductsView } from '@/components/products/products-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Products"
        description="The NorthTrail Outdoor catalogue. Search and filter the SKUs, then open one to edit its SEO metadata."
      />
      <ProductsView mode={mode} />
    </>
  );
}
