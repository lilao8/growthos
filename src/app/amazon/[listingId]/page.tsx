import { ListingDetailView } from '@/components/amazon/listing-detail-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface ListingPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ListingPage({
  params,
  searchParams,
}: ListingPageProps) {
  const { listingId } = await params;
  const search = await searchParams;
  const raw = search['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Listing"
        description="One ASIN: its recorded facts, its audit checks with evidence, and the copy you can edit."
      />
      <ListingDetailView listingId={listingId} mode={mode} />
    </>
  );
}
