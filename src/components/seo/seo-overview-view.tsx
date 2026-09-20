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
import { SEO_RULE_META, type SeoRuleId } from '@/domain/seo-audit/config';
import {
  loadSeoOverview,
  runSeoAuditForAllPages,
  type SeoAuditDeps,
  type SeoOverviewState,
} from '@/services/seo-audit-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { SeverityText, StatusBadge } from './check-status';
import { SeoDisclaimer } from './seo-disclaimer';

/** SEO Overview plus the cross-page issue list. */

function ruleTitle(ruleId: string): string {
  return SEO_RULE_META[ruleId as SeoRuleId]?.title ?? ruleId;
}

export function SeoOverviewView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<SeoAuditDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SeoOverviewState | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadSeoOverview(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, attempt]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    const result = await runSeoAuditForAllPages(deps);
    setRunning(false);
    if (result.status === 'error') {
      setRunMessage(`${result.message} Nothing was changed.`);
      return;
    }
    setRunMessage(`Audited ${result.audited} pages.`);
    setAttempt((value) => value + 1);
  }, [deps]);

  if (state === null) {
    return <LoadingBlock label="Loading page audits." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load SEO audits"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyBlock
        title="No pages to audit"
        description="There are no page snapshots in the demo catalogue, so there is nothing to check."
      />
    );
  }

  const { portfolio, rows, issues } = state;
  const neverAudited = portfolio.pagesAudited === 0;

  return (
    <div className="flex flex-col gap-6" data-testid="seo-overview">
      <Card>
        <CardHeader
          title="Audit status"
          description={
            neverAudited
              ? 'No audit has been run yet. Scores appear only after you run one.'
              : `Scores cover the ${portfolio.pagesCounted} of ${portfolio.pagesTotal} pages that have been audited.`
          }
        >
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running}
              data-testid="run-all-audits"
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
            >
              {running ? 'Running…' : 'Run audit on all pages'}
            </button>
            {runMessage !== '' && (
              <p
                role="status"
                data-testid="run-all-message"
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
              label="Average SEO score"
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
              testId="seo-metric-score"
            />
            <MetricCard
              label="Critical issues"
              value={formatInteger(portfolio.tally.critical)}
              definition="Checks that failed outright, across audited pages."
              testId="seo-metric-critical"
            />
            <MetricCard
              label="Warnings"
              value={formatInteger(portfolio.tally.warnings)}
              definition="Checks outside this project's guidance but not broken."
              testId="seo-metric-warnings"
            />
            <MetricCard
              label="Passed checks"
              value={formatInteger(portfolio.tally.passed)}
              definition="Checks satisfied, across audited pages."
              testId="seo-metric-passed"
            />
          </dl>

          {portfolio.pagesStale > 0 && (
            <p
              role="status"
              data-testid="stale-banner"
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
            >
              {portfolio.pagesStale} audited page(s) changed after they were
              checked. Their scores describe the old content — re-run the audit
              to refresh them.
            </p>
          )}

          <SeoDisclaimer ruleVersion={portfolio.ruleVersion} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pages"
          description="Every page snapshot in the catalogue, audited or not."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Page-level SEO audit status">
              <THead>
                <TR>
                  <TH>Page</TH>
                  <TH>Score</TH>
                  <TH>Errors</TH>
                  <TH>Warnings</TH>
                  <TH>Passed</TH>
                  <TH>Not assessed</TH>
                  <TH>State</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.snapshot.id}>
                    <TH scope="row">
                      <Link
                        href={`/seo/${row.snapshot.id}`}
                        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        data-testid={`seo-page-link-${row.snapshot.id}`}
                      >
                        {row.product?.title ?? row.snapshot.url}
                      </Link>
                    </TH>
                    <TD numeric>
                      {row.audit === null
                        ? 'Not audited'
                        : (row.audit.score ?? NOT_AVAILABLE)}
                    </TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.critical}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.warnings}</TD>
                    <TD numeric>{row.audit === null ? '—' : row.tally.passed}</TD>
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
          title="Issues"
          description="Every error and warning from the audited pages, most severe first. Each one names the page, the rule and the evidence behind it."
        >
          <span
            className="text-xs text-[var(--color-ink-muted)]"
            data-testid="issue-count"
          >
            {issues.length} issue(s)
          </span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          {issues.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--color-ink-muted)]">
              {neverAudited
                ? 'Run an audit to see issues.'
                : 'No errors or warnings on the audited pages.'}
            </p>
          ) : (
            <TableWrapper>
              <Table caption="SEO issues across audited pages">
                <THead>
                  <TR>
                    <TH>Page</TH>
                    <TH>Rule</TH>
                    <TH>Status</TH>
                    <TH>Severity</TH>
                    <TH>Finding</TH>
                    <TH>Evidence</TH>
                  </TR>
                </THead>
                <TBody>
                  {issues.map((issue) => (
                    <TR key={`${issue.pageId}-${issue.check.ruleId}`}>
                      <TH scope="row">
                        <Link
                          href={`/seo/${issue.pageId}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        >
                          {issue.productTitle}
                        </Link>
                      </TH>
                      <TD>{ruleTitle(issue.check.ruleId)}</TD>
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
                      <TD>
                        <span className="font-mono text-xs break-all">
                          {issue.check.evidence ?? '—'}
                        </span>
                      </TD>
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
