'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatInteger, NOT_AVAILABLE } from '@/domain/format';
import {
  loadSeoOverview,
  type SeoAuditDeps,
  type SeoOverviewState,
} from '@/services/seo-audit-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/**
 * SEO health on the dashboard.
 *
 * It calls the same service the SEO module uses, so the four figures here and
 * the ones on /seo cannot drift apart — there is one computation, not two.
 */

function HealthStat({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--color-line)] px-4 py-3"
      data-seo-card=""
      data-testid={testId}
    >
      <dt className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
        {label}
      </dt>
      {/* Note inside the <dd>: a <dl> item takes only <dt>/<dd> pairs. */}
      <dd>
        <span
          className="mt-2 block text-2xl font-semibold tabular-nums"
          data-testid={`${testId}-value`}
        >
          {value}
        </span>
        <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
          {note}
        </span>
      </dd>
    </div>
  );
}

export function SeoHealthView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<SeoAuditDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );
  const [state, setState] = useState<SeoOverviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSeoOverview(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  if (state === null || state.status === 'error') {
    // The dashboard's own metrics are unaffected by an SEO load problem, so this
    // section stays quiet rather than taking the whole page down.
    return null;
  }

  const { portfolio } = state;
  const none = portfolio.pagesAudited === 0;

  return (
    <Card>
      <CardHeader
        title="SEO health"
        description={
          none
            ? 'No page has been audited yet. Run an audit to populate these figures.'
            : `From the same audit results as the SEO module, covering ${portfolio.pagesAudited} of ${portfolio.pagesTotal} pages.`
        }
      >
        <Link
          href="/seo"
          className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          data-testid="dashboard-seo-link"
        >
          Open SEO audit
        </Link>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HealthStat
            label="SEO score"
            value={
              portfolio.averageScore === null
                ? NOT_AVAILABLE
                : String(portfolio.averageScore)
            }
            note={
              portfolio.averageScore === null
                ? 'No audited page has a score.'
                : `Mean across ${portfolio.pagesCounted} audited page(s).`
            }
            testId="seo-health-score"
          />
          <HealthStat
            label="Critical issues"
            value={formatInteger(portfolio.tally.critical)}
            note="Failed checks on audited pages."
            testId="seo-health-critical"
          />
          <HealthStat
            label="Warnings"
            value={formatInteger(portfolio.tally.warnings)}
            note="Checks outside project guidance."
            testId="seo-health-warnings"
          />
          <HealthStat
            label="Passed checks"
            value={formatInteger(portfolio.tally.passed)}
            note="Checks satisfied on audited pages."
            testId="seo-health-passed"
          />
        </dl>
        {portfolio.pagesStale > 0 && (
          <p className="mt-4 text-xs text-[var(--color-ink-muted)]">
            {portfolio.pagesStale} audited page(s) have changed since they were
            checked; their scores are stale.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
