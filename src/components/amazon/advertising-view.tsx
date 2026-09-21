'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { Badge } from '@/components/ui/badge';
import { BarChart, TrendChart } from '@/components/charts/trend-chart';
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
  formatInteger,
  formatMoneyMetric,
  formatPercent,
  NOT_AVAILABLE,
} from '@/domain/format';
import { formatCents } from '@/domain/money';
import {
  ACOS_VS_ROAS_NOTE,
  AD_DISCLAIMER,
  CVR_DENOMINATOR_NOTE,
} from '@/domain/amazon/ad-config';
import {
  loadAdvertising,
  type AdvertisingState,
  type AmazonAdsDeps,
} from '@/services/amazon-ads-service';
import {
  resolveAmazonAdsRepository,
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { ChannelSeparationNote } from './amazon-disclaimer';

/**
 * Amazon advertising.
 *
 * Structurally this is the Analytics page's twin, and deliberately so — but it
 * never borrows a storefront definition. The two notes near the top exist
 * because a workbench that shows ACOS on one page and ROAS on another has to
 * say why they are not the same figure.
 */

const METRIC_DEFINITIONS = [
  {
    key: 'acos',
    label: 'ACOS',
    definition: 'Ad spend ÷ advertising-attributed sales.',
    formula: 'spend ÷ ad sales',
    denominator: 'N/A when no attributed sales',
  },
  {
    key: 'tacos',
    label: 'TACOS',
    definition: 'Ad spend ÷ all sales, advertising and organic together.',
    formula: 'spend ÷ total sales',
    denominator: 'N/A when no sales',
  },
  {
    key: 'ctr',
    label: 'CTR',
    definition: 'Share of impressions that became a click.',
    formula: 'clicks ÷ impressions',
    denominator: 'N/A when no impressions',
  },
  {
    key: 'cvr',
    label: 'Conversion rate',
    definition:
      'Orders per click. The storefront measures per session — different denominator, different unit.',
    formula: 'orders ÷ clicks',
    denominator: 'N/A when no clicks',
  },
  {
    key: 'cpc',
    label: 'CPC',
    definition: 'Average amount paid per click.',
    formula: 'spend ÷ clicks',
    denominator: 'N/A when no clicks',
  },
  {
    key: 'organic',
    label: 'Organic share',
    definition: 'Share of sales no advertising click was attributed to.',
    formula: '(total sales − ad sales) ÷ total sales',
    denominator: 'N/A when no sales',
  },
  {
    key: 'usp',
    label: 'Unit session %',
    definition:
      'Units ordered per Amazon session. Amazon sessions, never the storefront’s.',
    formula: 'units ordered ÷ sessions',
    denominator: 'N/A when no sessions',
  },
] as const;

export function AdvertisingView({ mode }: { mode: DemoDataMode | null }) {
  // Created once per mode so a flaky source keeps its state across retries.
  const deps = useMemo<AmazonAdsDeps>(
    () => ({
      ads: resolveAmazonAdsRepository(mode),
      state: resolveStateRepository(mode),
    }),
    [mode],
  );
  const [attempt, setAttempt] = useState(0);

  // Remounting on retry returns the loader to its loading state without an
  // effect writing state synchronously, which would cascade renders.
  return (
    <AdvertisingLoader
      key={attempt}
      deps={deps}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

function AdvertisingLoader({
  deps,
  onRetry,
}: {
  deps: AmazonAdsDeps;
  onRetry: () => void;
}) {
  const [state, setState] = useState<AdvertisingState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAdvertising(deps).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  if (state === null) {
    return <LoadingBlock label="Aggregating search term and report data." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load advertising data"
        message={state.message}
        onRetry={onRetry}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <EmptyBlock
        title="No advertising data in this window"
        description="The report source returned no impressions and no sessions, so there is nothing to report. Metrics are left out rather than shown as zero."
      />
    );
  }

  const {
    totals,
    campaigns,
    searchTerms,
    asins,
    daily,
    harvest,
    negations,
    inconclusive,
    overTargetCampaigns,
    config,
    ruleVersion,
  } = state.view;

  const values: Record<string, string> = {
    acos: formatPercent(totals.acos),
    tacos: formatPercent(totals.tacos),
    ctr: formatPercent(totals.ctr, 3),
    cvr: formatPercent(totals.cvr),
    cpc: formatMoneyMetric(totals.cpcCents),
    organic: formatPercent(totals.organicShare),
    usp: formatPercent(totals.unitSessionPercentage),
  };

  const peak = daily.reduce(
    (best, point) => (point.spendCents > best.spendCents ? point : best),
    daily[0] ?? { date: '', spendCents: 0, adSalesCents: 0, clicks: 0, acos: null },
  );

  return (
    <div className="flex flex-col gap-6" data-testid="advertising-ready">
      <Card>
        <CardHeader
          title="Scope and target"
          description={`Target ACOS ${formatPercent(config.targetAcos, 0)} · rules ${ruleVersion}`}
        />
        <CardBody className="flex flex-col gap-3">
          <p
            className="text-xs leading-relaxed text-[var(--color-ink-muted)]"
            data-testid="ad-disclaimer"
          >
            {AD_DISCLAIMER}
          </p>
          <p
            className="text-xs leading-relaxed text-[var(--color-ink-muted)]"
            data-testid="acos-vs-roas-note"
          >
            {ACOS_VS_ROAS_NOTE}
          </p>
          <p
            className="text-xs leading-relaxed text-[var(--color-ink-muted)]"
            data-testid="cvr-denominator-note"
          >
            {CVR_DENOMINATOR_NOTE}
          </p>
          <ChannelSeparationNote />
        </CardBody>
      </Card>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRIC_DEFINITIONS.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={values[metric.key] ?? NOT_AVAILABLE}
            definition={metric.definition}
            testId={`ad-metric-${metric.key}`}
          />
        ))}
        <MetricCard
          label="Ad spend"
          value={formatCents(totals.spendCents)}
          definition={`Across ${formatInteger(totals.clicks)} clicks and ${formatInteger(totals.impressions)} impressions.`}
          testId="ad-metric-spend"
        />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Daily spend"
            description="Advertising spend per day over the demo window."
          />
          <CardBody>
            <TrendChart
              points={daily.map((point) => ({
                label: point.date,
                value: point.spendCents,
              }))}
              ariaId="ad-spend-summary"
            />
            <p
              id="ad-spend-summary"
              className="mt-2 text-xs text-[var(--color-ink-muted)]"
              data-testid="ad-spend-summary"
            >
              {formatCents(totals.spendCents)} spent from {totals.window.start}{' '}
              to {totals.window.end}, returning{' '}
              {formatCents(totals.adSalesCents)} in attributed sales at an ACOS
              of {formatPercent(totals.acos)}. Busiest spending day {peak.date}{' '}
              at {formatCents(peak.spendCents)}.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Spend by campaign"
            description="From the same aggregation the table below uses."
          />
          <CardBody>
            <BarChart
              data={campaigns.map((row) => ({
                label: row.campaign.name,
                value: row.spendCents,
              }))}
              ariaId="ad-campaign-summary"
            />
            <p
              id="ad-campaign-summary"
              className="mt-2 text-xs text-[var(--color-ink-muted)]"
              data-testid="ad-campaign-summary"
            >
              {campaigns[0]?.campaign.name} is the largest spender at{' '}
              {formatCents(campaigns[0]?.spendCents ?? 0)} of{' '}
              {formatCents(totals.spendCents)}.{' '}
              {overTargetCampaigns.length === 0
                ? 'Every campaign is at or below the target ACOS.'
                : `${overTargetCampaigns.length} campaign(s) are above the ${formatPercent(config.targetAcos, 0)} target ACOS.`}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Campaigns"
          description="Highest spend first. Rates on fewer clicks than the threshold are marked."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Campaign spend, attributed sales and efficiency">
              <THead>
                <TR>
                  <TH>Campaign</TH>
                  <TH>Type</TH>
                  <TH>Clicks</TH>
                  <TH>Spend</TH>
                  <TH>Ad sales</TH>
                  <TH>ACOS</TH>
                  <TH>CVR (per click)</TH>
                  <TH>CPC</TH>
                </TR>
              </THead>
              <TBody>
                {campaigns.map((row) => (
                  <TR key={row.campaign.id}>
                    <TH scope="row">
                      <span data-testid={`campaign-${row.campaign.id}`}>
                        {row.campaign.name}
                      </span>
                      {row.acos !== null &&
                        row.acos > config.targetAcos &&
                        !row.lowVolume && (
                          <span className="ml-2">
                            <Badge tone="muted">over target</Badge>
                          </span>
                        )}
                      {row.lowVolume && (
                        <span className="ml-2">
                          <Badge tone="muted">low volume</Badge>
                        </span>
                      )}
                    </TH>
                    <TD>{row.campaign.targetingType}</TD>
                    <TD numeric>{formatInteger(row.clicks)}</TD>
                    <TD numeric>{formatCents(row.spendCents)}</TD>
                    <TD numeric>{formatCents(row.adSalesCents)}</TD>
                    <TD numeric>
                      <span data-testid={`campaign-acos-${row.campaign.id}`}>
                        {formatPercent(row.acos)}
                      </span>
                    </TD>
                    <TD numeric>{formatPercent(row.cvr)}</TD>
                    <TD numeric>{formatMoneyMetric(row.cpcCents)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Search terms"
          description="What shoppers actually typed, and which target matched it. A search term is not a target — the two columns are different things."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Customer search terms with the target that matched them and their efficiency">
              <THead>
                <TR>
                  <TH>Customer search term</TH>
                  <TH>Matched by target</TH>
                  <TH>Match type</TH>
                  <TH>Clicks</TH>
                  <TH>Spend</TH>
                  <TH>Orders</TH>
                  <TH>ACOS</TH>
                </TR>
              </THead>
              <TBody>
                {searchTerms.map((row) => (
                  <TR key={`${row.targetId}-${row.customerSearchTerm}`}>
                    <TH scope="row">
                      <span
                        data-testid={`term-${row.targetId}-${row.customerSearchTerm.replace(/\s+/g, '-')}`}
                      >
                        {row.customerSearchTerm}
                      </span>
                    </TH>
                    <TD>{row.targetExpression}</TD>
                    <TD>{row.matchType}</TD>
                    <TD numeric>{formatInteger(row.clicks)}</TD>
                    <TD numeric>{formatCents(row.spendCents)}</TD>
                    <TD numeric>{formatInteger(row.adOrders)}</TD>
                    <TD numeric>
                      {formatPercent(row.acos)}
                      {row.lowVolume && (
                        <span className="ml-2">
                          <Badge tone="muted">low volume</Badge>
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Harvest candidates"
            description={`Converting below ${formatPercent(config.targetAcos - config.harvestAcosMargin, 0)} ACOS on at least ${config.minimumClicksForConclusion} clicks, with no exact target of their own.`}
          />
          <CardBody className="flex flex-col gap-3">
            {harvest.length === 0 ? (
              <p className="text-sm" data-testid="no-harvest">
                No search term currently meets the harvest thresholds.
              </p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="harvest-list">
                {harvest.map((item) => (
                  <li
                    key={`${item.sourceTargetId}-${item.customerSearchTerm}`}
                    className="rounded-md border border-[var(--color-line)] px-4 py-3"
                    data-testid={`harvest-${item.customerSearchTerm.replace(/\s+/g, '-')}`}
                  >
                    <p className="text-sm font-medium">
                      {item.customerSearchTerm}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {item.reason}
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>Suggested action:</strong> {item.suggestedAction}
                    </p>
                    <p className="mt-1 font-mono text-xs break-words text-[var(--color-ink-muted)]">
                      {item.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Negation candidates"
            description={`Zero orders on at least ${config.minimumClicksForConclusion} clicks and ${formatCents(config.minimumSpendForNegationCents)} of spend.`}
          />
          <CardBody className="flex flex-col gap-3">
            {negations.length === 0 ? (
              <p className="text-sm" data-testid="no-negations">
                No search term currently meets the negation thresholds.
              </p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="negation-list">
                {negations.map((item) => (
                  <li
                    key={`${item.sourceTargetId}-${item.customerSearchTerm}`}
                    className="rounded-md border border-[var(--color-line)] px-4 py-3"
                    data-testid={`negate-${item.customerSearchTerm.replace(/\s+/g, '-')}`}
                  >
                    <p className="text-sm font-medium">
                      {item.customerSearchTerm}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {item.reason}
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>Suggested action:</strong> {item.suggestedAction}
                    </p>
                    <p className="mt-1 font-mono text-xs break-words text-[var(--color-ink-muted)]">
                      {item.evidence} · {formatCents(item.spendCents)} spent
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Looked at, no verdict"
          description="Zero-order terms with too few clicks to conclude anything. Listed so they are visibly set aside rather than silently dropped."
        />
        <CardBody className="px-0 py-0">
          {inconclusive.length === 0 ? (
            <div className="px-5 py-4">
              <p className="text-sm" data-testid="no-inconclusive">
                Every zero-order term has enough clicks to judge.
              </p>
            </div>
          ) : (
            <TableWrapper>
              <Table caption="Zero-order search terms below the click threshold">
                <THead>
                  <TR>
                    <TH>Customer search term</TH>
                    <TH>Clicks</TH>
                    <TH>Spend</TH>
                    <TH>Why no verdict</TH>
                  </TR>
                </THead>
                <TBody>
                  {inconclusive.map((row) => (
                    <TR key={`${row.targetId}-${row.customerSearchTerm}`}>
                      <TH scope="row">{row.customerSearchTerm}</TH>
                      <TD numeric>{formatInteger(row.clicks)}</TD>
                      <TD numeric>{formatCents(row.spendCents)}</TD>
                      <TD>
                        Below {config.minimumClicksForConclusion} clicks — zero
                        orders here is not yet evidence of anything.
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="By ASIN"
          description="Business Report figures alongside advertising. Amazon sessions, never the storefront’s."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Per-ASIN sales, advertising share and unit session percentage">
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Total sales</TH>
                  <TH>Ad sales</TH>
                  <TH>TACOS</TH>
                  <TH>Organic share</TH>
                  <TH>Unit session %</TH>
                  <TH>Buy box</TH>
                </TR>
              </THead>
              <TBody>
                {asins.map((row) => (
                  <TR key={row.listingId}>
                    <TH scope="row">
                      <Link
                        href={`/amazon/${row.listingId}` as Route}
                        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        data-testid={`ad-asin-${row.listingId}`}
                      >
                        {row.label?.title ?? row.listingId}
                      </Link>
                      {row.lowOrganicShare && (
                        <span className="ml-2">
                          <Badge tone="muted">carried by ads</Badge>
                        </span>
                      )}
                    </TH>
                    <TD numeric>{formatCents(row.totalSalesCents)}</TD>
                    <TD numeric>{formatCents(row.adSalesCents)}</TD>
                    <TD numeric>{formatPercent(row.tacos)}</TD>
                    <TD numeric>
                      <span data-testid={`ad-organic-${row.listingId}`}>
                        {formatPercent(row.organicShare)}
                      </span>
                    </TD>
                    <TD numeric>{formatPercent(row.unitSessionPercentage)}</TD>
                    <TD numeric>{formatPercent(row.buyBoxPercentage)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="How these numbers are defined"
          description="One shared definition per metric. None of them is interchangeable with a storefront metric of the same name."
        />
        <CardBody className="px-0 py-0">
          <TableWrapper>
            <Table caption="Advertising metric definitions, formulas and denominator handling">
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
              Seeded demo data shaped like a Search Term Report and a Business
              Report. No Advertising API call, no SP-API call, no crawling.
            </li>
            <li>
              The target ACOS of {formatPercent(config.targetAcos, 0)} is this
              project&apos;s chosen figure, not a benchmark. A brand buying
              market share runs a higher one deliberately.
            </li>
            <li>
              Harvest and negation are suggestions to test, never actions. This
              project changes no bid, no budget and no negative keyword list.
            </li>
            <li>
              Attributed sales are credited to the day of the click, not the day
              of the order, so a single day&apos;s organic share can be
              unreadable. Where that happens the figure is N/A rather than a
              guess.
            </li>
            <li>
              Only Sponsored Products is modelled, on the US marketplace. No
              DSP, no inventory, no restock forecasting.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
