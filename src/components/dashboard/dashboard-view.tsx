'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, TrendChart } from '@/components/charts/trend-chart';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { NAV_ITEMS } from '@/components/layout/nav-items';
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
import type { DashboardHeadline } from '@/services/dashboard-service';
import {
  formatInteger,
  formatMoneyMetric,
  formatMultiple,
  formatPercent,
} from '@/domain/format';
import { loadDashboard, type DashboardState } from '@/services/dashboard-service';
import {
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import type { TrafficRepository } from '@/repositories/traffic-repository';

/**
 * Dashboard presentation. It renders what the service returns and formats with
 * domain helpers; it performs no aggregation of its own.
 */

const METRIC_DEFINITIONS = [
  {
    key: 'sessions',
    label: 'Sessions',
    definition: 'Visits in the window, de-duplicated by session ID.',
    formula: 'count(distinct sessionId)',
    denominator: 'Not a ratio',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    definition: 'Paid item value minus discounts. Excludes tax and shipping.',
    formula: 'sum(order revenue)',
    denominator: 'Not a ratio',
  },
  {
    key: 'orders',
    label: 'Orders',
    definition: 'Completed orders. The demo allows one order per session.',
    formula: 'count(distinct orderId)',
    denominator: 'Not a ratio',
  },
  {
    key: 'conversion-rate',
    label: 'Conversion Rate',
    definition: 'Share of sessions that reached the purchase stage.',
    formula: 'purchase sessions ÷ sessions',
    denominator: 'N/A when sessions = 0',
  },
  {
    key: 'aov',
    label: 'Average Order Value',
    definition: 'Average revenue per completed order.',
    formula: 'revenue ÷ orders',
    denominator: 'N/A when orders = 0',
  },
  {
    key: 'organic-traffic',
    label: 'Organic Traffic',
    definition: 'Sessions attributed to the Organic Search channel.',
    formula: 'count(sessions where channel = Organic Search)',
    denominator: 'Not a ratio',
  },
  {
    key: 'organic-revenue',
    label: 'Organic Revenue',
    definition: 'Revenue from orders attributed to Organic Search.',
    formula: 'sum(revenue where channel = Organic Search)',
    denominator: 'Not a ratio',
  },
  {
    key: 'add-to-cart-rate',
    label: 'Add-to-cart Rate',
    definition: 'Sessions that reached add-to-cart, as a share of all sessions.',
    formula: 'add-to-cart sessions ÷ sessions',
    denominator: 'N/A when sessions = 0',
  },
  {
    key: 'checkout-rate',
    label: 'Checkout Rate',
    definition: 'Sessions that reached checkout, as a share of all sessions.',
    formula: 'checkout sessions ÷ sessions',
    denominator: 'N/A when sessions = 0',
  },
  {
    key: 'cac',
    label: 'CAC',
    definition: 'Acquisition spend ÷ new customers. Independent of order count.',
    formula: 'acquisition spend ÷ new customers',
    denominator: 'N/A when no new customers',
  },
  {
    key: 'roas',
    label: 'ROAS',
    definition:
      'Revenue attributed to paid channels ÷ ad spend. Earned channels take no part.',
    formula: 'paid-attributed revenue ÷ ad spend',
    denominator: 'N/A when ad spend = 0',
  },
] as const;

function MetricGrid({ summary }: { summary: DashboardHeadline }) {
  const values: Record<string, string> = {
    sessions: formatInteger(summary.sessions),
    revenue: formatMoneyMetric(summary.revenueCents),
    orders: formatInteger(summary.orders),
    'conversion-rate': formatPercent(summary.conversionRate),
    aov: formatMoneyMetric(summary.averageOrderValueCents),
    'organic-traffic': formatInteger(summary.organicSessions),
    'organic-revenue': formatMoneyMetric(summary.organicRevenueCents),
    'add-to-cart-rate': formatPercent(summary.addToCartRate),
    'checkout-rate': formatPercent(summary.checkoutRate),
    cac: formatMoneyMetric(summary.cacCents),
    roas: formatMultiple(summary.roas),
  };

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {METRIC_DEFINITIONS.map((metric) => (
        <MetricCard
          key={metric.key}
          label={metric.label}
          value={values[metric.key] ?? 'N/A'}
          definition={metric.definition}
          testId={`metric-${metric.key}`}
        />
      ))}
    </dl>
  );
}

export function DashboardView({ mode }: { mode: DemoDataMode | null }) {
  // Created once per mode so a flaky source keeps its state across retries —
  // otherwise "retry" would silently start from a fresh adapter every time.
  const repository = useMemo(() => resolveTrafficRepository(mode), [mode]);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Remounting on retry resets the loader to its loading state without an
  // effect writing state synchronously.
  return (
    <DashboardLoader key={attempt} repository={repository} onRetry={retry} />
  );
}

function DashboardLoader({
  repository,
  onRetry,
}: {
  repository: TrafficRepository;
  onRetry: () => void;
}) {
  const [state, setState] = useState<DashboardState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDashboard(repository).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  if (state === null) {
    return <LoadingBlock label="Aggregating sessions and orders." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load dashboard data"
        message={state.message}
        onRetry={onRetry}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyBlock
        title="No sessions in this window"
        description="The demo data source returned no sessions for the selected dates, so there is nothing to report. Metrics are left out rather than shown as zero."
      />
    );
  }

  const { summary, daily, channels, funnel, alerts } = state;
  // One card per step, not one per hypothesis — the dashboard is a signal, and
  // the funnel page carries the detail.
  const alertSteps = [...new Map(alerts.map((item) => [item.transitionLabel, item])).values()];
  const rankedChannels = [...channels].sort((a, b) => b.sessions - a.sessions);
  const peak = daily.reduce(
    (best, point) => (point.sessions > best.sessions ? point : best),
    daily[0] ?? { date: '', sessions: 0, orders: 0, revenueCents: 0 },
  );

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-ready">
      <MetricGrid summary={summary} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Traffic trend"
            description="Sessions per day over the demo window."
          >
            <Link
              href="/analytics"
              className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              data-testid="dashboard-analytics-link"
            >
              Open analytics
            </Link>
          </CardHeader>
          <CardBody>
            <TrendChart
              points={daily.map((point) => ({
                label: point.date,
                value: point.sessions,
              }))}
              ariaId="dashboard-trend-summary"
            />
            <p
              id="dashboard-trend-summary"
              className="mt-2 text-xs text-[var(--color-ink-muted)]"
              data-testid="dashboard-trend-summary"
            >
              {formatInteger(summary.sessions)} sessions from{' '}
              {summary.window.start} to {summary.window.end}. Busiest day{' '}
              {peak.date} with {formatInteger(peak.sessions)} sessions. Daily
              figures are listed in Analytics.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Channel mix"
            description="Sessions by channel, from the same calculation Analytics uses."
          />
          <CardBody>
            <BarChart
              data={rankedChannels.map((row) => ({
                label: row.channel,
                value: row.sessions,
              }))}
              ariaId="dashboard-channel-summary"
            />
            <p
              id="dashboard-channel-summary"
              className="mt-2 text-xs text-[var(--color-ink-muted)]"
              data-testid="dashboard-channel-summary"
            >
              {rankedChannels[0]?.channel} is the largest channel with{' '}
              {formatInteger(rankedChannels[0]?.sessions ?? 0)} sessions of{' '}
              {formatInteger(summary.sessions)}.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Conversion alerts"
          description="Funnel steps performing below this project's threshold. Each is a prompt to look, not a finding."
        >
          <Link
            href="/funnel"
            className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            data-testid="dashboard-funnel-link"
          >
            Open the funnel
          </Link>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {funnel.largestDropOff !== null && (
            <p className="text-sm" data-testid="dashboard-largest-drop">
              <strong>Largest drop-off: {funnel.largestDropOff.label}.</strong>{' '}
              {formatPercent(funnel.largestDropOff.dropOffRate)} of{' '}
              {formatInteger(funnel.largestDropOff.fromSessions)} sessions are
              lost there.
            </p>
          )}

          {alertSteps.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Every funnel step is at or above its threshold.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="dashboard-alerts">
              {alertSteps.map((alert) => (
                <li
                  key={alert.transitionLabel}
                  className="rounded-md border border-[var(--color-line)] px-4 py-3 text-sm"
                  data-testid={`dashboard-alert-${alert.from}-${alert.to}`}
                >
                  <span className="font-medium">{alert.transitionLabel}</span>{' '}
                  {alert.raisedBecause === 'below-threshold' ? (
                    <>
                      converts at {formatPercent(alert.conversion)}, below the{' '}
                      {formatPercent(alert.threshold)} threshold, on{' '}
                      {formatInteger(alert.sampleSessions)} sessions.
                    </>
                  ) : (
                    <>
                      loses the largest share in the funnel —{' '}
                      {formatPercent(alert.dropOffRate)} of{' '}
                      {formatInteger(alert.sampleSessions)} sessions. Its{' '}
                      {formatPercent(alert.conversion)} conversion is within the{' '}
                      {formatPercent(alert.threshold)} threshold, so this is
                      about volume, not underperformance.
                    </>
                  )}
                  {alert.confidence === 'low' && ' Sample is small.'}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="How these numbers are defined"
          description="One shared definition per metric, used by every module in the project."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Metric definitions, formulas and denominator handling">
              <THead>
                <TR>
                  <TH>Metric</TH>
                  <TH>Formula</TH>
                  <TH>Empty denominator</TH>
                </TR>
              </THead>
              <TBody>
                {METRIC_DEFINITIONS.map((metric) => (
                  <TR key={metric.key}>
                    <TH scope="row">{metric.label}</TH>
                    <TD>{metric.formula}</TD>
                    <TD>{metric.denominator}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Where to go next"
          description="Every module in the project, and the question each one answers."
        />
        <CardBody>
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            data-testid="dashboard-module-links"
          >
            {NAV_ITEMS.filter((item) => item.href !== '/dashboard').map(
              (item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`dashboard-goto-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className="block h-full rounded-md border border-[var(--color-line)] px-4 py-3 hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    <span className="text-sm font-medium underline underline-offset-2">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
                      {item.question}
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Scope and limitations">
          <Link
            href="/about-project"
            className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            data-testid="dashboard-about-link"
          >
            About this project
          </Link>
        </CardHeader>
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              Seeded demo data for a fictional brand. The window ends on a fixed
              date and is identical on every reload — these are not live results.
            </li>
            <li>
              Revenue excludes tax, shipping and refunds. The MVP does not model
              refunds at all.
            </li>
            <li>
              Attribution is last-touch and single-channel: each session carries
              one channel. Real multi-touch attribution would give other numbers.
            </li>
            <li>
              Conversion alerts below are hypotheses to test, not diagnoses. The
              funnel shows where sessions are lost, never why.
            </li>
          </ul>
        </CardBody>
      </Card>

      <p className="sr-only" data-testid="dashboard-user-note">
        {formatInteger(summary.users)} distinct users in this window. Channel
        user counts overlap and must not be added together.
      </p>
    </div>
  );
}
