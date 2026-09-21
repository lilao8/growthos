'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatPercent, NOT_AVAILABLE } from '@/domain/format';
import { formatCents } from '@/domain/money';
import {
  loadListingAdvertising,
  type AmazonAdsDeps,
  type ListingAdvertisingState,
} from '@/services/amazon-ads-service';
import {
  resolveAmazonAdsRepository,
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/**
 * Advertising figures for a single ASIN, on its listing page.
 *
 * Kept as its own component with its own load so a failure in the report
 * source cannot take down the listing audit beside it — the two answer
 * different questions and either is useful without the other.
 */

function Figure({
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
    // A <dl> item may contain only <dt>/<dd> pairs, so the value lives in the
    // <dd> rather than beside it.
    <div className="flex justify-between gap-6 border-b border-[var(--color-line)] py-2 last:border-b-0">
      <dt className="min-w-0 text-sm text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          className="block text-sm font-medium tabular-nums"
          data-testid={testId}
        >
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
          {note}
        </span>
      </dd>
    </div>
  );
}

export function ListingAdvertisingPanel({
  listingId,
  mode,
}: {
  listingId: string;
  mode: DemoDataMode | null;
}) {
  const deps = useMemo<AmazonAdsDeps>(
    () => ({
      ads: resolveAmazonAdsRepository(mode),
      state: resolveStateRepository(mode),
    }),
    [mode],
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ListingAdvertisingState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadListingAdvertising(deps, listingId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, listingId, attempt]);

  if (state === null) {
    return (
      <Card>
        <CardHeader title="Advertising" />
        <CardBody>
          <p role="status" aria-live="polite" className="text-sm">
            Loading advertising figures…
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <CardHeader title="Advertising" />
        <CardBody>
          <p role="alert" className="text-sm" data-testid="listing-ads-error">
            {state.message} The listing audit above is unaffected.
          </p>
          <button
            type="button"
            onClick={() => {
              setState(null);
              setAttempt((value) => value + 1);
            }}
            data-testid="listing-ads-retry"
            className="mt-3 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Retry
          </button>
        </CardBody>
      </Card>
    );
  }

  if (state.status === 'none') {
    return (
      <Card>
        <CardHeader title="Advertising" />
        <CardBody>
          <p className="text-sm" data-testid="listing-ads-none">
            This ASIN is not advertised in the demo window, so there is nothing
            to report. That is not the same as performing badly.
          </p>
        </CardBody>
      </Card>
    );
  }

  const { row, config } = state;

  return (
    <Card>
      <CardHeader
        title="Advertising"
        description="Business Report and Search Term Report figures for this ASIN."
      >
        <Link
          href="/amazon/advertising"
          className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          data-testid="listing-ads-link"
        >
          Open advertising
        </Link>
      </CardHeader>
      <CardBody>
        <dl data-testid="listing-ads-panel">
          <Figure
            label="Total sales"
            value={formatCents(row.totalSalesCents)}
            note="Advertising and organic together."
            testId="listing-ads-total"
          />
          <Figure
            label="Ad sales"
            value={formatCents(row.adSalesCents)}
            note="Attributed to an advertising click."
            testId="listing-ads-sales"
          />
          <Figure
            label="ACOS"
            value={formatPercent(row.acos)}
            note="Spend ÷ attributed sales."
            testId="listing-ads-acos"
          />
          <Figure
            label="TACOS"
            value={formatPercent(row.tacos)}
            note="Spend ÷ total sales."
            testId="listing-ads-tacos"
          />
          <Figure
            label="Organic share"
            value={formatPercent(row.organicShare)}
            note="Share of sales no ad click was attributed to."
            testId="listing-ads-organic"
          />
          <Figure
            label="Unit session %"
            value={formatPercent(row.unitSessionPercentage)}
            note="Units ÷ Amazon sessions. Amazon's session definition, not the storefront's."
            testId="listing-ads-usp"
          />
        </dl>

        {row.lowOrganicShare && (
          <p className="mt-3 text-sm" data-testid="listing-ads-low-organic">
            <Badge tone="muted">carried by ads</Badge>{' '}
            {formatPercent(row.organicShare)} of sales came from outside
            advertising, below the {formatPercent(config.organicShareFloor, 0)}{' '}
            floor. If the campaigns pause, most of this revenue may pause too.
          </p>
        )}

        <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
          {row.unitSessionPercentage === null
            ? NOT_AVAILABLE
            : `Unit session percentage uses Amazon sessions for this ASIN. It is not comparable with the storefront's conversion rate, which counts storefront sessions.`}
        </p>
      </CardBody>
    </Card>
  );
}
