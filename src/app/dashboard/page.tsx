import { DashboardView } from '@/components/dashboard/dashboard-view';
import { PageHeader } from '@/components/ui/page-header';
import { DEMO_WINDOW } from '@/domain/demo-window';
import { formatDateRange } from '@/domain/format';
import { parseDemoDataMode } from '@/services/demo-data-source';
import { DEMO_BRAND, DEMO_MARKET } from '@/fixtures/demo-seed';

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  // `?demo=` is a QA seam for exercising loading / empty / error states.
  // Unknown values fall back to the real fixture.
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Headline performance for ${DEMO_BRAND} (${DEMO_MARKET}, USD).`}
      >
        <p
          className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-muted)]"
          data-testid="dashboard-window"
        >
          {formatDateRange(DEMO_WINDOW.start, DEMO_WINDOW.end)} ·{' '}
          {DEMO_WINDOW.days} days · UTC
        </p>
      </PageHeader>
      <DashboardView mode={mode} />
    </>
  );
}
