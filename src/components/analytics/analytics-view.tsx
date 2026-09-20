'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarChart, TrendChart } from '@/components/charts/trend-chart';
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
import { LOW_VOLUME_ORDER_THRESHOLD } from '@/domain/analytics/channel-metrics';
import {
  formatDateRange,
  formatInteger,
  formatMoneyMetric,
  formatMultiple,
  formatPercent,
  NOT_AVAILABLE,
} from '@/domain/format';
import { formatCents } from '@/domain/money';
import {
  ANALYTICS_RANGES,
  loadAnalytics,
  type AnalyticsDeps,
  type AnalyticsRange,
  type AnalyticsState,
} from '@/services/analytics-service';
import {
  resolveStateRepository,
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/** Channel analytics: one window, six sections, every chart mirrored as a table. */

function Summary({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-2 text-xs text-[var(--color-ink-muted)]">
      {children}
    </p>
  );
}

export function AnalyticsView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<AnalyticsDeps>(
    () => ({
      traffic: resolveTrafficRepository(mode),
      state: resolveStateRepository(mode),
    }),
    [mode],
  );

  const [range, setRange] = useState<AnalyticsRange>(90);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AnalyticsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAnalytics(deps, range).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, range, attempt]);

  const rangePicker = (
    <div
      role="group"
      aria-label="Reporting range"
      className="flex flex-wrap gap-2"
    >
      {ANALYTICS_RANGES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={range === option}
          onClick={() => setRange(option)}
          data-testid={`range-${option}`}
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
        <LoadingBlock label="Aggregating sessions, orders and spend." />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {rangePicker}
        <ErrorBlock
          title="Could not load analytics"
          message={state.message}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </div>
    );
  }

  const { view } = state;
  const { totals, channels, daily, aiSources, landingPages, topProducts } = view;

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col gap-6">
        {rangePicker}
        <EmptyBlock
          title="No sessions in this range"
          description={`The demo data source returned no sessions between ${view.window.start} and ${view.window.end}, so there is nothing to report. Metrics are left out rather than shown as zero.`}
        />
      </div>
    );
  }

  const peak = daily.reduce(
    (best, point) => (point.sessions > best.sessions ? point : best),
    daily[0] ?? { date: '', sessions: 0, orders: 0, revenueCents: 0 },
  );
  const rankedChannels = [...channels].sort((a, b) => b.sessions - a.sessions);
  const aiChannel = channels.find((row) => row.channel === 'AI Referral');
  const aiSourceSessions = aiSources.reduce(
    (sum, row) => sum + row.sessions,
    0,
  );

  return (
    <div className="flex flex-col gap-6" data-testid="analytics-ready">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rangePicker}
        <p
          className="text-xs text-[var(--color-ink-muted)]"
          data-testid="analytics-window"
        >
          {formatDateRange(view.window.start, view.window.end)} ·{' '}
          {view.window.days} days · UTC
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sessions"
          value={formatInteger(totals.sessions)}
          definition="Visits in the range, de-duplicated by session ID."
          testId="analytics-sessions"
        />
        <MetricCard
          label="Users"
          value={formatInteger(totals.users)}
          definition="Distinct people across the whole range. Channel rows overlap, so they do not add up to this."
          testId="analytics-users"
        />
        <MetricCard
          label="Revenue"
          value={formatMoneyMetric(totals.revenueCents)}
          definition="Paid item value minus discounts. Excludes tax, shipping and refunds."
          testId="analytics-revenue"
        />
        <MetricCard
          label="Orders"
          value={formatInteger(totals.orders)}
          definition="Completed orders in the range."
          testId="analytics-orders"
        />
        <MetricCard
          label="Conversion rate"
          value={formatPercent(totals.conversionRate)}
          definition="Purchasing sessions ÷ sessions, aggregated before dividing."
          testId="analytics-cvr"
        />
        <MetricCard
          label="Average order value"
          value={formatMoneyMetric(totals.averageOrderValueCents)}
          definition="Revenue ÷ orders."
          testId="analytics-aov"
        />
        <MetricCard
          label="CAC"
          value={formatMoneyMetric(totals.cacCents)}
          definition="Acquisition spend ÷ new customers. Independent of order count."
          testId="analytics-cac"
        />
        <MetricCard
          label="ROAS"
          value={formatMultiple(totals.roas)}
          definition="Revenue attributed to paid channels ÷ ad spend. Earned channels take no part."
          testId="analytics-roas"
        />
      </dl>

      <Card>
        <CardHeader
          title="Traffic trend"
          description="Sessions per day across the selected range."
        />
        <CardBody>
          <TrendChart
            points={daily.map((point) => ({
              label: point.date,
              value: point.sessions,
            }))}
            ariaId="trend-summary"
          />
          <Summary id="trend-summary">
            <span data-testid="trend-summary">
              {formatInteger(totals.sessions)} sessions across{' '}
              {view.window.days} days, from {view.window.start} to{' '}
              {view.window.end}. Busiest day {peak.date} with{' '}
              {formatInteger(peak.sessions)} sessions. The full daily figures are
              in the table below.
            </span>
          </Summary>
        </CardBody>
        <CardBody className="px-0 py-0">
          {/*
            The chart's data in full. Collapsed by default because 90 rows
            would bury everything below it, but present rather than replaced by
            a picture — the summary above carries the headline either way.
          */}
          <details className="border-t border-[var(--color-line)]">
            <summary
              className="cursor-pointer px-5 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              data-testid="daily-table-toggle"
            >
              Show the daily figures ({view.window.days} days)
            </summary>
            <TableWrapper>
              <Table caption="Sessions, orders and revenue by day">
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Sessions</TH>
                    <TH>Orders</TH>
                    <TH>Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {daily.map((point) => (
                    <TR key={point.date}>
                      <TH scope="row">{point.date}</TH>
                      <TD numeric>{formatInteger(point.sessions)}</TD>
                      <TD numeric>{formatInteger(point.orders)}</TD>
                      <TD numeric>{formatCents(point.revenueCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Channel breakdown"
          description="Every channel on one shared definition. Sessions, orders and revenue reconcile to the site totals; users do not, because one person can use several channels."
        />
        <CardBody>
          <BarChart
            data={rankedChannels.map((row) => ({
              label: row.channel,
              value: row.sessions,
            }))}
            ariaId="channel-summary"
          />
          <Summary id="channel-summary">
            <span data-testid="channel-summary">
              {rankedChannels[0]?.channel} leads with{' '}
              {formatInteger(rankedChannels[0]?.sessions ?? 0)} sessions;{' '}
              {rankedChannels[rankedChannels.length - 1]?.channel} is smallest
              with{' '}
              {formatInteger(
                rankedChannels[rankedChannels.length - 1]?.sessions ?? 0,
              )}
              . Exact figures follow in the table.
            </span>
          </Summary>
        </CardBody>
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Channel performance for the selected range">
              <THead>
                <TR>
                  <TH>Channel</TH>
                  <TH>Sessions</TH>
                  <TH>Users</TH>
                  <TH>Orders</TH>
                  <TH>Revenue</TH>
                  <TH>Conv. rate</TH>
                  <TH>AOV</TH>
                  <TH>Ad spend</TH>
                  <TH>CAC</TH>
                  <TH>ROAS</TH>
                  <TH>Confidence</TH>
                </TR>
              </THead>
              <TBody>
                {rankedChannels.map((row) => (
                  <TR key={row.channel}>
                    <TH scope="row">{row.channel}</TH>
                    <TD numeric>
                      <span data-testid={`sessions-${row.channel}`}>
                        {formatInteger(row.sessions)}
                      </span>
                    </TD>
                    <TD numeric>{formatInteger(row.users)}</TD>
                    <TD numeric>
                      <span data-testid={`orders-${row.channel}`}>
                        {formatInteger(row.orders)}
                      </span>
                    </TD>
                    <TD numeric>
                      <span data-testid={`revenue-${row.channel}`}>
                        {formatCents(row.revenueCents)}
                      </span>
                    </TD>
                    <TD numeric>{formatPercent(row.conversionRate)}</TD>
                    <TD numeric>
                      {formatMoneyMetric(row.averageOrderValueCents)}
                    </TD>
                    <TD numeric>{formatCents(row.adSpendCents)}</TD>
                    <TD numeric>
                      <span data-testid={`cac-${row.channel}`}>
                        {formatMoneyMetric(row.cacCents)}
                      </span>
                    </TD>
                    <TD numeric>
                      <span data-testid={`roas-${row.channel}`}>
                        {formatMultiple(row.roas)}
                      </span>
                    </TD>
                    <TD>
                      {row.lowVolume ? (
                        <span data-testid={`low-volume-${row.channel}`}>
                          <Badge tone="muted">Low volume</Badge>
                        </span>
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
                <TR>
                  <TH scope="row">Site total</TH>
                  <TD numeric>
                    <span data-testid="total-sessions">
                      {formatInteger(totals.sessions)}
                    </span>
                  </TD>
                  <TD numeric>
                    <span data-testid="total-users">
                      {formatInteger(totals.users)}
                    </span>
                  </TD>
                  <TD numeric>
                    <span data-testid="total-orders">
                      {formatInteger(totals.orders)}
                    </span>
                  </TD>
                  <TD numeric>
                    <span data-testid="total-revenue">
                      {formatCents(totals.revenueCents)}
                    </span>
                  </TD>
                  <TD numeric>{formatPercent(totals.conversionRate)}</TD>
                  <TD numeric>
                    {formatMoneyMetric(totals.averageOrderValueCents)}
                  </TD>
                  <TD numeric>{formatCents(totals.adSpendCents)}</TD>
                  <TD numeric>{formatMoneyMetric(totals.cacCents)}</TD>
                  <TD numeric>{formatMultiple(totals.roas)}</TD>
                  <TD>
                    <span className="text-[var(--color-ink-muted)]">—</span>
                  </TD>
                </TR>
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="AI Referral"
          description="Visits labelled as coming from an assistant."
        />
        <CardBody className="flex flex-col gap-4">
          <p
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
            data-testid="ai-limitation"
          >
            These source labels are demo values. In reality a large share of
            assistant-driven visits arrive with no referrer and land in Direct,
            so any figure here <strong>undercounts</strong>. This is referral
            traffic, not a count of how often an AI system mentioned the brand —
            nothing here measures that.
          </p>
          <TableWrapper>
            <Table caption="AI referral sessions by source">
              <THead>
                <TR>
                  <TH>Source</TH>
                  <TH>Sessions</TH>
                  <TH>Orders</TH>
                  <TH>Revenue</TH>
                  <TH>Conv. rate</TH>
                </TR>
              </THead>
              <TBody>
                {aiSources.map((row) => (
                  <TR key={row.source}>
                    <TH scope="row">{row.source}</TH>
                    <TD numeric>{formatInteger(row.sessions)}</TD>
                    <TD numeric>{formatInteger(row.orders)}</TD>
                    <TD numeric>{formatCents(row.revenueCents)}</TD>
                    <TD numeric>{formatPercent(row.conversionRate)}</TD>
                  </TR>
                ))}
                <TR>
                  <TH scope="row">AI Referral total</TH>
                  <TD numeric>
                    <span data-testid="ai-source-total">
                      {formatInteger(aiSourceSessions)}
                    </span>
                  </TD>
                  <TD numeric>{formatInteger(aiChannel?.orders ?? 0)}</TD>
                  <TD numeric>{formatCents(aiChannel?.revenueCents ?? 0)}</TD>
                  <TD numeric>
                    {formatPercent(aiChannel?.conversionRate ?? null)}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top landing pages"
            description="Where sessions entered the site."
          />
          <CardBody className="px-0 py-0">
            <TableWrapper>
              <Table caption="Top landing pages by sessions">
                <THead>
                  <TR>
                    <TH>Landing page</TH>
                    <TH>Sessions</TH>
                    <TH>Orders</TH>
                    <TH>Conv. rate</TH>
                  </TR>
                </THead>
                <TBody>
                  {landingPages.map((row) => (
                    <TR key={row.landingPageId}>
                      <TH scope="row">
                        {row.productId === null ? (
                          row.landingPageId
                        ) : (
                          <Link
                            href={`/products/${row.productId}`}
                            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                          >
                            {row.productTitle}
                          </Link>
                        )}
                      </TH>
                      <TD numeric>{formatInteger(row.sessions)}</TD>
                      <TD numeric>{formatInteger(row.orders)}</TD>
                      <TD numeric>{formatPercent(row.conversionRate)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top products"
            description="By revenue in the selected range."
          />
          <CardBody className="px-0 py-0">
            <TableWrapper>
              <Table caption="Top products by revenue">
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH>Revenue</TH>
                    <TH>Units</TH>
                    <TH>Conv. rate</TH>
                  </TR>
                </THead>
                <TBody>
                  {topProducts.map((row) => (
                    <TR key={row.product.id}>
                      <TH scope="row">
                        <Link
                          href={`/products/${row.product.id}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        >
                          {row.product.title}
                        </Link>
                      </TH>
                      <TD numeric>{formatCents(row.metrics.revenueCents)}</TD>
                      <TD numeric>{formatInteger(row.metrics.unitsSold)}</TD>
                      <TD numeric>
                        {row.metrics.conversionRate === null
                          ? NOT_AVAILABLE
                          : formatPercent(row.metrics.conversionRate)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="How to read these numbers" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              <strong>Users do not add up across channels.</strong> One person
              can arrive from search one day and email the next, so they appear
              in both rows. The site total is a distinct count, which is why it
              is smaller than the sum of the rows.
            </li>
            <li>
              <strong>Rates are aggregated, not averaged.</strong> Numerators
              and denominators are summed across the range before dividing.
            </li>
            <li>
              <strong>CAC and ROAS are different questions.</strong> CAC is
              acquisition spend ÷ new customers, so a channel with a platform
              fee but no media buy still has one. ROAS is revenue ÷ ad spend, so
              a channel that bought no media shows N/A — not zero, and not an
              infinite return.
            </li>
            <li>
              <strong>A CAC of $0.00 does not mean free.</strong> Earned channels
              record no spend here, so the arithmetic gives zero. This demo does
              not model the content, SEO or brand work that produces that
              traffic; a real CAC for organic would allocate those costs and
              would not be zero.
            </li>
            <li>
              <strong>Low-volume channels are marked.</strong> A rate built on a
              handful of orders moves several points on one extra sale, so those
              rows carry a flag rather than being presented as settled. Fewer
              than {LOW_VOLUME_ORDER_THRESHOLD} orders in the range earns it.
            </li>
            <li>
              Attribution here is last-touch and single-channel by construction:
              each session carries one channel. Real multi-touch attribution is
              out of scope and would give different numbers.
            </li>
            <li>
              Seeded demo data over a fixed window. Not live results, and no
              analytics or ad platform is connected.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
