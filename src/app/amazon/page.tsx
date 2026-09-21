import { AmazonOverviewView } from '@/components/amazon/amazon-overview-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface AmazonPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AmazonOverviewPage({
  searchParams,
}: AmazonPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Amazon Listings"
        description="Rule-based checks over stored listing records: what is missing, why it matters on a marketplace, and what to change."
      />
      <AmazonOverviewView mode={mode} />
    </>
  );
}
