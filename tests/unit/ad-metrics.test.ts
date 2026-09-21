import { describe, expect, it } from 'vitest';
import {
  acos,
  adDaily,
  adTotals,
  asinRows,
  campaignRows,
  clickConversionRate,
  clickThroughRate,
  costPerClick,
  organicShare,
  searchTermRows,
  tacos,
  unitSessionPercentage,
  type AdMetricsInput,
} from '@/domain/amazon/ad-metrics';
import { buildWindow } from '@/domain/demo-window';
import type {
  AdCampaign,
  AdTarget,
  AsinDailyReport,
  SearchTermRow,
} from '@/domain/types';

/**
 * Advertising metric arithmetic.
 *
 * The rules that earn their own tests here are the ones that are easy to get
 * wrong and expensive when wrong: conversion rate takes clicks (not sessions),
 * every rate aggregates by summing numerators and denominators, and an empty
 * denominator is N/A rather than zero or infinity.
 */

const WINDOW = buildWindow(3, '2026-08-31');

const CAMPAIGNS: AdCampaign[] = [
  {
    id: 'cmp_a',
    name: 'Campaign A',
    type: 'SP',
    targetingType: 'manual',
    listingId: 'lst_a',
    dailyBudgetCents: 5000,
    status: 'enabled',
  },
  {
    id: 'cmp_b',
    name: 'Campaign B',
    type: 'SP',
    targetingType: 'auto',
    listingId: 'lst_b',
    dailyBudgetCents: 4000,
    status: 'enabled',
  },
];

const TARGETS: AdTarget[] = [
  {
    id: 'tgt_a_exact',
    campaignId: 'cmp_a',
    expression: 'camp stove',
    matchType: 'exact',
    bidCents: 100,
  },
  {
    id: 'tgt_b_auto',
    campaignId: 'cmp_b',
    expression: 'close match',
    matchType: 'auto',
    bidCents: 80,
  },
];

function term(overrides: Partial<SearchTermRow> = {}): SearchTermRow {
  return {
    date: '2026-08-31',
    targetId: 'tgt_a_exact',
    customerSearchTerm: 'camp stove',
    impressions: 1000,
    clicks: 100,
    spendCents: 10000,
    adSalesCents: 40000,
    adOrders: 10,
    ...overrides,
  };
}

function report(overrides: Partial<AsinDailyReport> = {}): AsinDailyReport {
  return {
    date: '2026-08-31',
    listingId: 'lst_a',
    sessions: 200,
    pageViews: 260,
    unitsOrdered: 20,
    totalSalesCents: 80000,
    buyBoxPercentage: 0.95,
    ...overrides,
  };
}

function input(overrides: Partial<AdMetricsInput> = {}): AdMetricsInput {
  return {
    campaigns: CAMPAIGNS,
    targets: TARGETS,
    searchTerms: [term()],
    reports: [report()],
    window: WINDOW,
    ...overrides,
  };
}

describe('metric primitives', () => {
  it('computes ACOS as spend over attributed sales', () => {
    expect(acos(10000, 40000)).toBe(0.25);
  });

  it('computes TACOS against total sales, not attributed sales', () => {
    expect(tacos(10000, 80000)).toBe(0.125);
    // Total sales include organic, so TACOS is always <= ACOS for the same spend.
    expect(tacos(10000, 80000)).toBeLessThan(acos(10000, 40000) ?? 0);
  });

  it('takes clicks as the conversion denominator, not sessions', () => {
    expect(clickConversionRate(10, 100)).toBe(0.1);
    // The same 10 orders against 200 sessions would be 5%. Different number,
    // different question — this function must never be handed sessions.
    expect(clickConversionRate(10, 100)).not.toBe(10 / 200);
  });

  it('returns null rather than zero or infinity for empty denominators', () => {
    expect(acos(1000, 0)).toBeNull();
    expect(tacos(1000, 0)).toBeNull();
    expect(clickThroughRate(5, 0)).toBeNull();
    expect(clickConversionRate(1, 0)).toBeNull();
    expect(costPerClick(1000, 0)).toBeNull();
    expect(unitSessionPercentage(3, 0)).toBeNull();
  });

  it('reports a real zero when the numerator is zero and the denominator is not', () => {
    expect(clickConversionRate(0, 100)).toBe(0);
    expect(clickThroughRate(0, 1000)).toBe(0);
  });

  it('computes organic share as the part no click was attributed to', () => {
    expect(organicShare(80000, 40000)).toBe(0.5);
    expect(organicShare(80000, 0)).toBe(1);
  });

  it('refuses to report organic share when attribution exceeds total sales', () => {
    // Amazon credits a click to the day of the click, not the day of the
    // order, so attributed sales can exceed same-day totals. A negative share
    // would be nonsense and a clamped zero would be a lie.
    expect(organicShare(40000, 50000)).toBeNull();
    expect(organicShare(0, 0)).toBeNull();
  });
});

describe('adTotals', () => {
  it('aggregates by summing numerators and denominators, not averaging rates', () => {
    const totals = adTotals(
      input({
        searchTerms: [
          // 50% ACOS on a tiny day...
          term({ date: '2026-08-30', clicks: 10, spendCents: 1000, adSalesCents: 2000, adOrders: 1 }),
          // ...and 20% on a large one.
          term({ date: '2026-08-31', clicks: 100, spendCents: 10000, adSalesCents: 50000, adOrders: 10 }),
        ],
        reports: [],
      }),
    );

    // Summed: 11000 / 52000 = 21.2%. Averaging the two days would give 35%,
    // weighting a ten-click day the same as a hundred-click one.
    expect(totals.acos).toBeCloseTo(11000 / 52000);
    expect(totals.acos).not.toBeCloseTo((0.5 + 0.2) / 2);
  });

  it('excludes rows outside the window', () => {
    const totals = adTotals(
      input({
        searchTerms: [term({ date: '2026-08-31' }), term({ date: '2026-01-01' })],
        reports: [],
      }),
    );
    expect(totals.clicks).toBe(100);
  });

  it('keeps Amazon sessions separate from any storefront figure', () => {
    const totals = adTotals(input());
    expect(totals.sessions).toBe(200);
    expect(totals.unitSessionPercentage).toBe(0.1);
  });

  it('returns nulls throughout for an empty input rather than zeros', () => {
    const totals = adTotals(input({ searchTerms: [], reports: [] }));
    expect(totals.acos).toBeNull();
    expect(totals.tacos).toBeNull();
    expect(totals.ctr).toBeNull();
    expect(totals.cvr).toBeNull();
    expect(totals.cpcCents).toBeNull();
    expect(totals.organicShare).toBeNull();
    expect(totals.unitSessionPercentage).toBeNull();
    expect(totals.clicks).toBe(0);
  });
});

describe('campaignRows', () => {
  it('attributes each row to its campaign through its target', () => {
    const rows = campaignRows(
      input({
        searchTerms: [
          term({ targetId: 'tgt_a_exact', spendCents: 10000 }),
          term({ targetId: 'tgt_b_auto', spendCents: 3000, customerSearchTerm: 'stove' }),
        ],
      }),
    );
    expect(rows[0]?.campaign.id).toBe('cmp_a');
    expect(rows[0]?.spendCents).toBe(10000);
    expect(rows[1]?.campaign.id).toBe('cmp_b');
    expect(rows[1]?.spendCents).toBe(3000);
  });

  it('includes a campaign with no rows rather than dropping it', () => {
    const rows = campaignRows(input({ searchTerms: [term()] }));
    expect(rows).toHaveLength(2);
    const empty = rows.find((row) => row.campaign.id === 'cmp_b');
    expect(empty?.clicks).toBe(0);
    expect(empty?.acos).toBeNull();
  });

  it('flags a campaign with too few clicks to judge', () => {
    const rows = campaignRows(
      input({ searchTerms: [term({ clicks: 3, adOrders: 0, adSalesCents: 0 })] }),
    );
    expect(rows.find((row) => row.campaign.id === 'cmp_a')?.lowVolume).toBe(true);
  });

  it('ignores a row whose target does not exist', () => {
    const rows = campaignRows(
      input({ searchTerms: [term({ targetId: 'tgt_missing' })] }),
    );
    expect(rows.every((row) => row.clicks === 0)).toBe(true);
  });
});

describe('searchTermRows', () => {
  it('keeps the search term and the target that matched it as separate fields', () => {
    const rows = searchTermRows(
      input({
        searchTerms: [
          term({ customerSearchTerm: 'two burner camp stove' }),
        ],
      }),
    );
    expect(rows[0]?.customerSearchTerm).toBe('two burner camp stove');
    expect(rows[0]?.targetExpression).toBe('camp stove');
    expect(rows[0]?.matchType).toBe('exact');
  });

  it('groups by term AND target, not by term alone', () => {
    const rows = searchTermRows(
      input({
        searchTerms: [
          term({ targetId: 'tgt_a_exact', customerSearchTerm: 'camp stove' }),
          term({ targetId: 'tgt_b_auto', customerSearchTerm: 'camp stove' }),
        ],
      }),
    );
    // The same query served by two targets is two rows with two bids behind
    // them. Collapsing them would hide the duplication harvesting resolves.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.targetId)).size).toBe(2);
  });

  it('sums the days of one pairing into a single row', () => {
    const rows = searchTermRows(
      input({
        searchTerms: [
          term({ date: '2026-08-30', clicks: 10 }),
          term({ date: '2026-08-31', clicks: 20 }),
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.clicks).toBe(30);
  });
});

describe('asinRows', () => {
  it('joins advertising to the Business Report through the campaign', () => {
    const rows = asinRows(
      input({
        searchTerms: [term({ targetId: 'tgt_a_exact', adSalesCents: 40000 })],
        reports: [report({ listingId: 'lst_a', totalSalesCents: 80000 })],
      }),
    );
    const row = rows.find((item) => item.listingId === 'lst_a');
    expect(row?.adSalesCents).toBe(40000);
    expect(row?.totalSalesCents).toBe(80000);
    expect(row?.organicShare).toBe(0.5);
  });

  it('includes an ASIN that has reports but no advertising', () => {
    const rows = asinRows(
      input({ searchTerms: [], reports: [report({ listingId: 'lst_c' })] }),
    );
    const row = rows.find((item) => item.listingId === 'lst_c');
    expect(row?.spendCents).toBe(0);
    expect(row?.acos).toBeNull();
    // Nothing was spent, so all of it is organic.
    expect(row?.organicShare).toBe(1);
  });

  it('averages buy box share across reported days', () => {
    const rows = asinRows(
      input({
        searchTerms: [],
        reports: [
          report({ date: '2026-08-30', buyBoxPercentage: 0.8 }),
          report({ date: '2026-08-31', buyBoxPercentage: 1 }),
        ],
      }),
    );
    expect(rows[0]?.buyBoxPercentage).toBeCloseTo(0.9);
  });
});

describe('adDaily', () => {
  it('returns one point per day, in date order', () => {
    const points = adDaily(
      input({
        searchTerms: [
          term({ date: '2026-08-31', spendCents: 200 }),
          term({ date: '2026-08-29', spendCents: 100 }),
          term({ date: '2026-08-29', spendCents: 50, targetId: 'tgt_b_auto' }),
        ],
      }),
    );
    expect(points.map((point) => point.date)).toEqual([
      '2026-08-29',
      '2026-08-31',
    ]);
    expect(points[0]?.spendCents).toBe(150);
  });
});
