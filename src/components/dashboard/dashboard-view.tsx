'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { DashboardSummary } from '@/domain/dashboard-summary';
import {
  formatInteger,
  formatMoneyMetric,
  formatPercent,
} from '@/domain/format';
import { loadDashboard, type DashboardState } from '@/services/dashboard-service';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import {
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

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
] as const;

function MetricGrid({ summary }: { summary: DashboardSummary }) {
  const values: Record<string, string> = {
    sessions: formatInteger(summary.sessions),
    revenue: formatMoneyMetric(summary.revenueCents),
    orders: formatInteger(summary.orders),
    'conversion-rate': formatPercent(summary.conversionRate),
    aov: formatMoneyMetric(summary.averageOrderValueCents),
    'organic-traffic': formatInteger(summary.organicSessions),
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

  const { summary } = state;

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-ready">
      <MetricGrid summary={summary} />

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
        <CardHeader title="Scope and limitations" />
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
              Organic Revenue, CAC, ROAS, add-to-cart rate, checkout rate,
              traffic trend and channel breakdown arrive in Dispatch 6 and 7.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
