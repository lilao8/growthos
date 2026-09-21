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
import { AMAZON_RULE_META, type AmazonRuleId } from '@/domain/amazon/config';
import {
  loadAmazonOverview,
  runAuditForAllListings,
  type AmazonDeps,
  type AmazonOverviewState,
} from '@/services/amazon-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { SeverityText, StatusBadge } from '@/components/seo/check-status';
import { AmazonDisclaimer, ChannelSeparationNote } from './amazon-disclaimer';

/** Amazon listing overview plus the cross-listing issue list. */

function ruleTitle(ruleId: string): string {
  return AMAZON_RULE_META[ruleId as AmazonRuleId]?.title ?? ruleId;
}

export function AmazonOverviewView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<AmazonDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AmazonOverviewState | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadAmazonOverview(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, attempt]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    const result = await runAuditForAllListings(deps);
    setRunning(false);
    if (result.status === 'error') {
      setRunMessage(`${result.message} Nothing was changed.`);
      return;
    }
    setRunMessage(`Audited ${result.audited} listings.`);
    setAttempt((value) => value + 1);
  }, [deps]);

  if (state === null) {
    return <LoadingBlock label="Loading Amazon listings." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load Amazon listings"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyBlock
        title="No Amazon listings"
        description="There are no listings in the demo catalogue, so there is nothing to audit."
      />
    );
  }

  const { rows, issues, portfolio } = state;

  return (
    <div className="flex flex-col gap-6" data-testid="amazon-overview">
      <Card>
        <CardHeader
          title="Audit status"
          description={
            portfolio.listingsAudited === 0
              ? 'No audit has been run yet. Scores appear only after you run one.'
              : `${portfolio.listingsAudited} of ${portfolio.listingsTotal} listings audited · rules ${portfolio.ruleVersion}`
          }
        >
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={running}
            data-testid="run-all-listing-audits"
            className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
          >
            {running ? 'Auditing…' : 'Run audit on all listings'}
          </button>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {runMessage !== '' && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm"
              data-testid="run-all-listing-message"
            >
              {runMessage}
            </p>
          )}
          {portfolio.listingsStale > 0 && (
            <p className="text-sm" data-testid="listing-stale-banner">
              {portfolio.listingsStale} audited listing(s) changed after being
              audited. Their scores describe the previous copy — re-run to
              refresh them.
            </p>
          )}
          <AmazonDisclaimer />
          <ChannelSeparationNote />
        </CardBody>
      </Card>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Average listing score"
          value={
            portfolio.averageScore === null
              ? NOT_AVAILABLE
              : String(portfolio.averageScore)
          }
          definition={
            portfolio.averageScore === null
              ? 'No listing has a score yet.'
              : `Mean across the ${portfolio.pagesCounted} audited listing(s). Not a rank or sales prediction.`
          }
          testId="amazon-metric-score"
        />
        <MetricCard
          label="Suppressed"
          value={formatInteger(portfolio.suppressed)}
          definition="Hidden from search and the buy box. Counted from the listing record, so this is known before any audit runs."
          testId="amazon-metric-suppressed"
        />
        <MetricCard
          label="Critical issues"
          value={formatInteger(portfolio.tally.critical)}
          definition="Checks that failed outright, across audited listings."
          testId="amazon-metric-critical"
        />
        <MetricCard
          label="Warnings"
          value={formatInteger(portfolio.tally.warnings)}
          definition="Outside this project's guidance but not broken."
          testId="amazon-metric-warnings"
        />
      </dl>

      <Card>
        <CardHeader
          title="Listings"
          description="Every ASIN in the demo catalogue, worst score first."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Amazon listings with status, score and issue counts">
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>ASIN</TH>
                  <TH>Status</TH>
                  <TH>Score</TH>
                  <TH>Critical</TH>
                  <TH>Warnings</TH>
                  <TH>Not assessed</TH>
                </TR>
              </THead>
              <TBody>
                {[...rows]
                  .sort((a, b) => {
                    const left = a.audit?.score ?? Number.POSITIVE_INFINITY;
                    const right = b.audit?.score ?? Number.POSITIVE_INFINITY;
                    return left - right;
                  })
                  .map((row) => (
                    <TR key={row.listing.id}>
                      <TH scope="row">
                        <Link
                          href={`/amazon/${row.listing.id}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                          data-testid={`listing-link-${row.listing.id}`}
                        >
                          {row.product?.title ?? row.listing.asin}
                        </Link>
                      </TH>
                      <TD>
                        {/* An ASIN is always 10 characters; breaking it mid-token helps nobody. */}
                        <span className="font-mono text-xs whitespace-nowrap">
                          {row.listing.asin}
                        </span>
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            row.listing.status === 'active' ? 'neutral' : 'muted'
                          }
                        >
                          {row.listing.status}
                        </Badge>
                      </TD>
                      <TD numeric>
                        <span data-testid={`listing-score-${row.listing.id}`}>
                          {row.audit === null
                            ? 'Not audited'
                            : `${row.audit.score ?? NOT_AVAILABLE}${row.audit.stale ? ' (stale)' : ''}`}
                        </span>
                      </TD>
                      <TD numeric>{formatInteger(row.tally.critical)}</TD>
                      <TD numeric>{formatInteger(row.tally.warnings)}</TD>
                      <TD numeric>{formatInteger(row.tally.unknown)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Issues across all listings"
          description="Most severe first. A suppressed listing's problems come first because it is selling nothing at all."
        />
        <CardBody className="px-0 py-0">
          {issues.length === 0 ? (
            <div className="px-5 py-4">
              <p className="text-sm" data-testid="amazon-no-issues">
                {portfolio.listingsAudited === 0
                  ? 'No audit has been run, so there are no findings yet. That is not the same as a clean catalogue.'
                  : 'No failing or warning checks across the audited listings.'}
              </p>
            </div>
          ) : (
            <TableWrapper>
              <Table caption="Every failing and warning check across audited listings">
                <THead>
                  <TR>
                    <TH>Check</TH>
                    <TH>Product</TH>
                    <TH>Status</TH>
                    <TH>Severity</TH>
                    <TH>What was found</TH>
                  </TR>
                </THead>
                <TBody>
                  {issues.map((issue) => (
                    <TR key={`${issue.listingId}-${issue.check.ruleId}`}>
                      <TH scope="row">{ruleTitle(issue.check.ruleId)}</TH>
                      <TD>
                        <Link
                          href={`/amazon/${issue.listingId}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        >
                          {issue.productTitle}
                        </Link>
                        {issue.listingStatus !== 'active' && (
                          <span className="ml-2">
                            <Badge tone="muted">{issue.listingStatus}</Badge>
                          </span>
                        )}
                        {issue.stale && (
                          <span className="ml-2">
                            <Badge tone="muted">stale</Badge>
                          </span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={issue.check.status} />
                      </TD>
                      <TD>
                        <SeverityText
                          severity={issue.check.severity}
                          status={issue.check.status}
                        />
                      </TD>
                      <TD>{issue.check.message}</TD>
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
