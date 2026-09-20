'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '@/components/ui/status-block';
import {
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { formatInteger, NOT_AVAILABLE } from '@/domain/format';
import { GEO_RULE_META, type GeoRuleId } from '@/domain/geo-audit/config';
import {
  loadGeoOverview,
  runGeoAuditForAllPages,
  type GeoAuditDeps,
  type GeoOverviewState,
} from '@/services/geo-audit-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { StatusBadge } from '@/components/seo/check-status';
import { GeoDisclaimer } from './geo-disclaimer';

function ruleTitle(ruleId: string): string {
  return GEO_RULE_META[ruleId as GeoRuleId]?.title ?? ruleId;
}

export function GeoOverviewView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<GeoAuditDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GeoOverviewState | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadGeoOverview(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, attempt]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    const result = await runGeoAuditForAllPages(deps);
    setRunning(false);
    if (result.status === 'error') {
      setRunMessage(`${result.message} Nothing was changed.`);
      return;
    }
    setRunMessage(`Audited ${result.audited} pages.`);
    setAttempt((value) => value + 1);
  }, [deps]);

  if (state === null) return <LoadingBlock label="Loading GEO audits." />;

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load GEO audits"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyBlock
        title="No pages to audit"
        description="There are no page snapshots in the demo catalogue, so there is nothing to assess."
      />
    );
  }

  const { portfolio, rows, recommendations } = state;
  const neverAudited = portfolio.pagesAudited === 0;

  return (
    <div className="flex flex-col gap-6" data-testid="geo-overview">
      <Card>
        <CardHeader
          title="Content readiness"
          description={
            neverAudited
              ? 'No GEO audit has been run yet. Scores appear only after you run one.'
              : `Covering the ${portfolio.pagesCounted} of ${portfolio.pagesTotal} pages that have been audited.`
          }
        >
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running}
              data-testid="run-all-geo-audits"
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
            >
              {running ? 'Running…' : 'Run GEO audit on all pages'}
            </button>
            {runMessage !== '' && (
              <p
                role="status"
                data-testid="run-all-geo-message"
                className="text-xs text-[var(--color-ink-muted)]"
              >
                {runMessage}
              </p>
            )}
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="GEO score"
              value={
                portfolio.averageScore === null
                  ? NOT_AVAILABLE
                  : String(portfolio.averageScore)
              }
              definition={
                portfolio.averageScore === null
                  ? 'No page has a score yet.'
                  : `Mean of ${portfolio.pagesCounted} audited page score(s). Unaudited pages are excluded, not counted as zero.`
              }
              testId="geo-metric-score"
            />
            <MetricCard
              label="AI readiness"
              value={portfolio.readiness.label}
              definition={`${portfolio.readiness.note} Describes the content, not the likelihood of being cited.`}
              testId="geo-metric-readiness"
            />
            <MetricCard
              label="Rules not yet met"
              value={formatInteger(
                portfolio.tally.critical + portfolio.tally.warnings,
              )}
              definition="Rules scoring below full marks on audited pages."
              testId="geo-metric-gaps"
            />
            <MetricCard
              label="Rules fully met"
              value={formatInteger(portfolio.tally.passed)}
              definition="Rules scoring the full 10 points on audited pages."
              testId="geo-metric-met"
            />
          </dl>

          {portfolio.pagesStale > 0 && (
            <p
              role="status"
              data-testid="geo-stale-banner"
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
            >
              {portfolio.pagesStale} audited page(s) changed after they were
              checked. Re-run the audit to refresh them.
            </p>
          )}

          <GeoDisclaimer ruleVersion={portfolio.ruleVersion} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pages"
          description="Every page snapshot in the catalogue, audited or not."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Page-level GEO readiness">
              <THead>
                <TR>
                  <TH>Page</TH>
                  <TH>GEO score</TH>
                  <TH>Readiness</TH>
                  <TH>Rules met</TH>
                  <TH>Partial</TH>
                  <TH>Not met</TH>
                  <TH>Not assessed</TH>
                  <TH>State</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.snapshot.id}>
                    <TH scope="row">
                      <Link
                        href={`/geo/${row.snapshot.id}`}
                        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        data-testid={`geo-page-link-${row.snapshot.id}`}
                      >
                        {row.product?.title ?? row.snapshot.url}
                      </Link>
                    </TH>
                    <TD numeric>
                      {row.audit === null
                        ? 'Not audited'
                        : (row.audit.score ?? NOT_AVAILABLE)}
                    </TD>
                    <TD>{row.audit === null ? '—' : row.readiness.label}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.passed}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.warnings}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.critical}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.unknown}</TD>
                    <TD>
                      {row.audit === null ? (
                        <span className="text-[var(--color-ink-muted)]">
                          Never audited
                        </span>
                      ) : row.audit.stale ? (
                        <Badge tone="muted">Stale</Badge>
                      ) : (
                        <Badge tone="neutral">Current</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recommendations"
          description="Rules that did not score full marks, lowest scoring first. Each names the page, the signal that was missing and what to add."
        >
          <span
            className="text-xs text-[var(--color-ink-muted)]"
            data-testid="geo-recommendation-count"
          >
            {recommendations.length} recommendation(s)
          </span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          {recommendations.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--color-ink-muted)]">
              {neverAudited
                ? 'Run a GEO audit to see recommendations.'
                : 'Every rule scored full marks on the audited pages.'}
            </p>
          ) : (
            <TableWrapper>
              <Table caption="GEO recommendations across audited pages">
                <THead>
                  <TR>
                    <TH>Page</TH>
                    <TH>Rule</TH>
                    <TH>Points</TH>
                    <TH>Status</TH>
                    <TH>Finding</TH>
                    <TH>What to add</TH>
                  </TR>
                </THead>
                <TBody>
                  {recommendations.map((item) => (
                    <TR key={`${item.pageId}-${item.check.ruleId}`}>
                      <TH scope="row">
                        <Link
                          href={`/geo/${item.pageId}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        >
                          {item.productTitle}
                        </Link>
                      </TH>
                      <TD>{ruleTitle(item.check.ruleId)}</TD>
                      <TD numeric>{item.check.points ?? '—'} / 10</TD>
                      <TD>
                        <StatusBadge status={item.check.status} />
                      </TD>
                      <TD>{item.check.message}</TD>
                      <TD>{item.check.recommendation}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
