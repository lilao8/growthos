import { AdvertisingView } from '@/components/amazon/advertising-view';
import { PageHeader } from '@/components/ui/page-header';
import { DEMO_WINDOW } from '@/domain/demo-window';
import { formatDateRange } from '@/domain/format';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface AdvertisingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AmazonAdvertisingPage({
  searchParams,
}: AdvertisingPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Amazon Advertising"
        description="Search terms, campaign efficiency and what to harvest or negate. Amazon's own metric definitions — never mixed with the storefront's."
      >
        <p
          className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-muted)]"
          data-testid="advertising-window"
        >
          {formatDateRange(DEMO_WINDOW.start, DEMO_WINDOW.end)} ·{' '}
          {DEMO_WINDOW.days} days · UTC
        </p>
      </PageHeader>
      <AdvertisingView mode={mode} />
    </>
  );
}
