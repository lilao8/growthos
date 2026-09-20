'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatInteger, NOT_AVAILABLE } from '@/domain/format';
import { GEO_DISCLAIMER } from '@/domain/geo-audit/config';
import {
  loadGeoOverview,
  type GeoAuditDeps,
  type GeoOverviewState,
} from '@/services/geo-audit-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/**
 * GEO readiness on the dashboard, from the same service the GEO module uses.
 *
 * Kept as its own component and its own load, so a failure in the GEO engine
 * cannot surface as part of the SEO section, or vice versa.
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
      data-geo-card=""
      data-testid={testId}
    >
      <dt className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
        {label}
      </dt>
      <dd
        className="mt-2 text-2xl font-semibold tabular-nums"
        data-testid={`${testId}-value`}
      >
        {value}
      </dd>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{note}</p>
    </div>
  );
}

export function GeoHealthView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<GeoAuditDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );
  const [state, setState] = useState<GeoOverviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGeoOverview(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  if (state === null || state.status === 'error') return null;

  const { portfolio } = state;
  const none = portfolio.pagesAudited === 0;

  return (
    <Card>
      <CardHeader
        title="GEO readiness"
        description={
          none
            ? 'No page has been assessed yet. Run a GEO audit to populate these figures.'
            : `From the same audit results as the GEO module, covering ${portfolio.pagesAudited} of ${portfolio.pagesTotal} pages.`
        }
      >
        <Link
          href="/geo"
          className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          data-testid="dashboard-geo-link"
        >
          Open GEO audit
        </Link>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HealthStat
            label="GEO score"
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
            testId="geo-health-score"
          />
          <HealthStat
            label="AI readiness"
            value={portfolio.readiness.label}
            note={portfolio.readiness.note}
            testId="geo-health-readiness"
          />
          <HealthStat
            label="Rules not yet met"
            value={formatInteger(
              portfolio.tally.critical + portfolio.tally.warnings,
            )}
            note="Rules below full marks on audited pages."
            testId="geo-health-gaps"
          />
          <HealthStat
            label="Rules fully met"
            value={formatInteger(portfolio.tally.passed)}
            note="Rules scoring the full 10 points."
            testId="geo-health-met"
          />
        </dl>
        <p className="mt-4 text-xs text-[var(--color-ink-muted)]">
          {GEO_DISCLAIMER} It does not predict whether an AI system will cite
          these pages.
        </p>
      </CardBody>
    </Card>
  );
}
