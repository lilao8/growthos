'use client';

import { useEffect, useMemo, useState } from 'react';
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
import {
  formatDateRange,
  formatInteger,
  formatPercent,
} from '@/domain/format';
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from '@/services/analytics-service';
import {
  loadFunnel,
  type FunnelDeps,
  type FunnelState,
} from '@/services/funnel-service';
import {
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/** The funnel: one population of sessions, where they are lost, and what to check. */

export function FunnelView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<FunnelDeps>(
    () => ({ traffic: resolveTrafficRepository(mode) }),
    [mode],
  );

  const [range, setRange] = useState<AnalyticsRange>(90);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FunnelState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFunnel(deps, range).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, range, attempt]);

  const rangePicker = (
    <div role="group" aria-label="Reporting range" className="flex flex-wrap gap-2">
      {ANALYTICS_RANGES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={range === option}
          onClick={() => setRange(option)}
          data-testid={`funnel-range-${option}`}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
            range === option
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
              : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
          }`}
        >
          {option} days
        </button>
      ))}
    </div>
  );

  if (state === null) {
    return (
      <div className="flex flex-col gap-6">
        {rangePicker}
        <LoadingBlock label="Walking sessions through the funnel." />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {rangePicker}
        <ErrorBlock
          title="Could not load the funnel"
          message={state.message}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </div>
    );
  }

  const { report, recommendations } = state.view;

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col gap-6">
        {rangePicker}
        <EmptyBlock
          title="No sessions in this range"
          description={`There were no sessions between ${report.window.start} and ${report.window.end}, so there is no funnel to describe. Rates are left out rather than shown as zero.`}
        />
      </div>
    );
  }

  const maxSessions = report.stages[0]?.sessions ?? 1;

  return (
    <div className="flex flex-col gap-6" data-testid="funnel-ready">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rangePicker}
        <p
          className="text-xs text-[var(--color-ink-muted)]"
          data-testid="funnel-window"
        >
          {formatDateRange(report.window.start, report.window.end)} ·{' '}
          {report.window.days} days · UTC
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Sessions"
          value={formatInteger(report.totalSessions)}
          definition="The population this funnel describes. Sessions, not people."
          testId="funnel-sessions"
        />
        <MetricCard
          label="Purchasing sessions"
          value={formatInteger(report.purchaseSessions)}
          definition="Sessions that reached the purchase stage."
          testId="funnel-purchases"
        />
        <MetricCard
          label="Overall conversion"
          value={formatPercent(report.overallConversion)}
          definition="Purchasing sessions ÷ sessions, across the whole funnel."
          testId="funnel-overall"
        />
      </dl>

      {report.largestDropOff !== null ? (
        <p
          role="status"
          data-testid="largest-drop-banner"
          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
        >
          <strong>Largest drop-off: {report.largestDropOff.label}.</strong>{' '}
          {formatPercent(report.largestDropOff.dropOffRate)} of{' '}
          {formatInteger(report.largestDropOff.fromSessions)} sessions are lost
          here — {formatInteger(report.largestDropOff.dropOffSessions)} sessions.
          Chosen by share lost, not by headcount; ties go to the earlier stage.
        </p>
      ) : (
        <p
          role="status"
          data-testid="no-drop-banner"
          className="rounded-md border border-[var(--color-line)] px-4 py-3 text-sm"
        >
          No stage loses any sessions, so there is no largest drop-off to report.
        </p>
      )}

      {report.invalidSessions.length > 0 && (
        <p
          role="alert"
          data-testid="invalid-sessions"
          className="rounded-md border border-[var(--color-line)] px-4 py-3 text-sm"
        >
          {formatInteger(report.invalidSessions.length)} session(s) recorded
          stages in an impossible order and were excluded from every layer.
          They are reported rather than trimmed to fit, because repairing them
          silently would inflate the stages above.
        </p>
      )}

      <Card>
        <CardHeader
          title="Funnel"
          description="Every layer counts de-duplicated sessions from the same population — not page views, and not people."
        />
        <CardBody className="flex flex-col gap-3">
          {report.stages.map((row) => (
            <div key={row.stage} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-[var(--color-ink-muted)]">
                {row.label}
              </span>
              <span className="h-5 min-w-0 flex-1 rounded-sm bg-[var(--color-surface-muted)]">
                <span
                  className="block h-5 rounded-sm bg-[var(--color-accent)]"
                  style={{
                    width: `${Math.max(1, (row.sessions / maxSessions) * 100)}%`,
                  }}
                />
              </span>
              <span
                className="w-32 shrink-0 text-right tabular-nums"
                data-testid={`stage-${row.stage}`}
              >
                {formatInteger(row.sessions)} ({formatPercent(row.shareOfSessions, 1)})
              </span>
            </div>
          ))}
        </CardBody>
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Stage conversion and drop-off between adjacent layers">
              <THead>
                <TR>
                  <TH>Step</TH>
                  <TH>Sessions in</TH>
                  <TH>Sessions out</TH>
                  <TH>Stage conversion</TH>
                  <TH>Drop-off rate</TH>
                  <TH>Sessions lost</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {report.transitions.map((transition) => {
                  const isLargest =
                    report.largestDropOff !== null &&
                    report.largestDropOff.from === transition.from &&
                    report.largestDropOff.to === transition.to;
                  return (
                    <TR key={`${transition.from}-${transition.to}`}>
                      <TH scope="row">
                        <span
                          data-testid={`transition-${transition.from}-${transition.to}`}
                        >
                          {transition.label}
                        </span>
                      </TH>
                      <TD numeric>{formatInteger(transition.fromSessions)}</TD>
                      <TD numeric>{formatInteger(transition.toSessions)}</TD>
                      <TD numeric>
                        <span
                          data-testid={`conversion-${transition.from}-${transition.to}`}
                        >
                          {formatPercent(transition.conversion)}
                        </span>
                      </TD>
                      <TD numeric>{formatPercent(transition.dropOffRate)}</TD>
                      <TD numeric>{formatInteger(transition.dropOffSessions)}</TD>
                      <TD>
                        {!transition.comparable ? (
                          <span className="text-[var(--color-ink-muted)]">
                            No sessions to compare
                          </span>
                        ) : isLargest ? (
                          <span data-testid="largest-drop-badge">
                            <Badge tone="accent">Largest drop-off</Badge>
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What to check"
          description="Raised for a step performing below this project's threshold, or for the step losing the largest share — and only ever advice belonging to that step."
        >
          <span
            className="text-xs text-[var(--color-ink-muted)]"
            data-testid="recommendation-count"
          >
            {recommendations.length} item(s)
          </span>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
            data-testid="hypothesis-disclaimer"
          >
            <strong>These are hypotheses to test, not diagnoses.</strong> The
            funnel shows where sessions are lost. It cannot show why — a drop at
            checkout is equally consistent with surprise shipping cost, a clumsy
            form or a missing payment method. Treating any of these as the proven
            cause would be reading correlation as causation.
          </p>

          {recommendations.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Every step is at or above its threshold, so nothing is raised here.
            </p>
          ) : (
            recommendations.map((item) => (
              <article
                key={item.id}
                data-testid={`funnel-rec-${item.id}`}
                className="rounded-md border border-[var(--color-line)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{item.hypothesis}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="muted">{item.transitionLabel}</Badge>
                    {item.isLargestDropOff && (
                      <Badge tone="accent">Largest drop-off</Badge>
                    )}
                    {item.raisedBecause === 'below-threshold' && (
                      <Badge tone="muted">Below threshold</Badge>
                    )}
                    {item.confidence === 'low' && (
                      <span data-testid={`low-confidence-${item.id}`}>
                        <Badge tone="muted">Low confidence</Badge>
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  <span className="font-medium">How to check: </span>
                  {item.howToCheck}
                </p>
                <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                  {item.raisedBecause === 'below-threshold' ? (
                    <>
                      Raised because this step converts at{' '}
                      {formatPercent(item.conversion)} against a{' '}
                      {formatPercent(item.threshold)} threshold, on{' '}
                      {formatInteger(item.sampleSessions)} sessions.
                    </>
                  ) : (
                    <>
                      Raised because this step loses the largest share in the
                      funnel — {formatPercent(item.dropOffRate)} of{' '}
                      {formatInteger(item.sampleSessions)} sessions. Its{' '}
                      {formatPercent(item.conversion)} conversion is at or above
                      the {formatPercent(item.threshold)} threshold, so this is
                      about where the volume goes, not about underperformance.
                    </>
                  )}
                  {item.confidence === 'low' &&
                    ' That sample is small enough that the rate may move substantially on a few more sessions — treat this as a prompt to look, not as a conclusion.'}
                </p>
              </article>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How to read this funnel" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              Every layer is <strong>de-duplicated sessions</strong>. A session
              appears at most once per stage. These are not page views and not
              unique people — {formatInteger(report.totalSessions)} sessions came
              from fewer visitors than that.
            </li>
            <li>
              All layers describe one population over one window, and stages must
              occur in order, so the counts can only fall as you go down.
            </li>
            <li>
              The largest drop-off is chosen by <strong>share lost</strong>, not
              headcount: a step losing 60% of a small group leaks worse than one
              losing 20% of a large one. Both numbers are shown.
            </li>
            <li>
              A step earns advice for one of two reasons: it is{' '}
              <strong>below threshold</strong>, or it is the{' '}
              <strong>largest drop-off</strong>. They answer different questions
              — a step can lose most of its group and still be normal for its
              kind, which product page to cart does in every store.
            </li>
            <li>
              Thresholds are this project&apos;s rough expectations for a DTC
              store, not an industry standard — no published benchmark applies
              across categories. They are configurable.
            </li>
            <li>
              Rates built on small samples are flagged. Seeded demo data over a
              fixed window; not live results.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
