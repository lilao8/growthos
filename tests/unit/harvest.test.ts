import { describe, expect, it } from 'vitest';
import {
  harvestCandidates,
  inconclusiveTerms,
  negationCandidates,
} from '@/domain/amazon/harvest';
import { DEFAULT_AD_CONFIG } from '@/domain/amazon/ad-config';
import type { SearchTermAggregate } from '@/domain/amazon/ad-metrics';
import type { AdTarget } from '@/domain/types';

/**
 * Harvest and negation rules.
 *
 * These decide where money goes, so the boundaries get tested from both sides.
 * The load-bearing behaviours: nothing concludes below the click threshold, a
 * term that already has an exact target is never harvested, and every output
 * is phrased as something to test rather than something to do.
 */

const CONFIG = DEFAULT_AD_CONFIG;

function row(overrides: Partial<SearchTermAggregate> = {}): SearchTermAggregate {
  const base: SearchTermAggregate = {
    customerSearchTerm: 'freestanding 2 person tent',
    targetId: 'tgt_broad',
    targetExpression: 'backpacking tent',
    matchType: 'broad',
    campaignId: 'cmp_1',
    campaignName: 'Broad discovery',
    listingId: 'lst_1',
    impressions: 5000,
    clicks: 100,
    spendCents: 20000,
    adSalesCents: 200000,
    adOrders: 6,
    acos: 0.1,
    ctr: 0.02,
    cvr: 0.06,
    cpcCents: 200,
    lowVolume: false,
    ...overrides,
  };
  return base;
}

const EXACT_TARGET: AdTarget = {
  id: 'tgt_exact',
  campaignId: 'cmp_2',
  expression: 'freestanding 2 person tent',
  matchType: 'exact',
  bidCents: 120,
};

describe('harvestCandidates', () => {
  it('promotes a well-converting term with no exact target', () => {
    const items = harvestCandidates([row()], [], CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0]?.customerSearchTerm).toBe('freestanding 2 person tent');
    expect(items[0]?.sourceMatchType).toBe('broad');
  });

  it('refuses a term that already has an exact target', () => {
    // Promoting it would mean bidding against an existing bid on the same
    // phrase, which is the opposite of the point.
    expect(harvestCandidates([row()], [EXACT_TARGET], CONFIG)).toEqual([]);
  });

  it('matches existing exact targets regardless of case and spacing', () => {
    const messy: AdTarget = {
      ...EXACT_TARGET,
      expression: '  Freestanding   2 Person TENT ',
    };
    expect(harvestCandidates([row()], [messy], CONFIG)).toEqual([]);
  });

  it('checks exact targets across the whole account, not just this campaign', () => {
    // EXACT_TARGET lives in cmp_2; the row came from cmp_1. A duplicate in
    // another campaign is still a duplicate.
    expect(EXACT_TARGET.campaignId).not.toBe(row().campaignId);
    expect(harvestCandidates([row()], [EXACT_TARGET], CONFIG)).toEqual([]);
  });

  it('never harvests a row that is already an exact match type', () => {
    expect(
      harvestCandidates([row({ matchType: 'exact' })], [], CONFIG),
    ).toEqual([]);
  });

  it('ignores a term below the click threshold however good its ACOS', () => {
    const items = harvestCandidates(
      [row({ clicks: CONFIG.minimumClicksForConclusion - 1, acos: 0.01 })],
      [],
      CONFIG,
    );
    expect(items).toEqual([]);
  });

  it('accepts a term exactly at the click threshold', () => {
    const items = harvestCandidates(
      [row({ clicks: CONFIG.minimumClicksForConclusion })],
      [],
      CONFIG,
    );
    expect(items).toHaveLength(1);
  });

  it('requires the ACOS to beat the target by the configured margin', () => {
    const ceiling = CONFIG.targetAcos - CONFIG.harvestAcosMargin;
    expect(harvestCandidates([row({ acos: ceiling })], [], CONFIG)).toHaveLength(1);
    expect(
      harvestCandidates([row({ acos: ceiling + 0.001 })], [], CONFIG),
    ).toEqual([]);
  });

  it('ignores a term with no orders even if its ACOS is somehow set', () => {
    expect(
      harvestCandidates([row({ adOrders: 0, acos: 0.05 })], [], CONFIG),
    ).toEqual([]);
  });

  it('ignores a term with a null ACOS', () => {
    expect(harvestCandidates([row({ acos: null })], [], CONFIG)).toEqual([]);
  });

  it('names the matching target, so the pairing is never implied', () => {
    const [item] = harvestCandidates([row()], [], CONFIG);
    expect(item?.sourceExpression).toBe('backpacking tent');
    expect(item?.reason).toContain('backpacking tent');
    expect(item?.evidence).toContain('broad target');
  });

  it('says this buys control rather than promising volume', () => {
    const [item] = harvestCandidates([row()], [], CONFIG);
    expect(item?.suggestedAction).toMatch(/may/i);
    expect(item?.suggestedAction).toContain('already being served');
  });

  it('orders by attributed sales, largest first', () => {
    const items = harvestCandidates(
      [
        row({ customerSearchTerm: 'small', adSalesCents: 50000 }),
        row({ customerSearchTerm: 'large', adSalesCents: 300000 }),
      ],
      [],
      CONFIG,
    );
    expect(items.map((item) => item.customerSearchTerm)).toEqual([
      'large',
      'small',
    ]);
  });
});

describe('negationCandidates', () => {
  const wasteful = row({
    customerSearchTerm: 'tent stove jack',
    adOrders: 0,
    adSalesCents: 0,
    acos: null,
    clicks: 120,
    spendCents: 28000,
  });

  it('raises a term with real clicks, real spend and no orders', () => {
    const items = negationCandidates([wasteful], CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0]?.customerSearchTerm).toBe('tent stove jack');
  });

  it('ignores a term that converted, however badly', () => {
    expect(
      negationCandidates([{ ...wasteful, adOrders: 1 }], CONFIG),
    ).toEqual([]);
  });

  it('requires both thresholds, not either', () => {
    // Enough spend, too few clicks.
    expect(
      negationCandidates(
        [{ ...wasteful, clicks: CONFIG.minimumClicksForConclusion - 1 }],
        CONFIG,
      ),
    ).toEqual([]);
    // Enough clicks, too little spend.
    expect(
      negationCandidates(
        [{ ...wasteful, spendCents: CONFIG.minimumSpendForNegationCents - 1 }],
        CONFIG,
      ),
    ).toEqual([]);
  });

  it('accepts a term exactly at both thresholds', () => {
    const items = negationCandidates(
      [
        {
          ...wasteful,
          clicks: CONFIG.minimumClicksForConclusion,
          spendCents: CONFIG.minimumSpendForNegationCents,
        },
      ],
      CONFIG,
    );
    expect(items).toHaveLength(1);
  });

  it('warns that negating may hide a listing problem rather than fix waste', () => {
    const [item] = negationCandidates([wasteful], CONFIG);
    // The dangerous version of this feature is one that says "negate this".
    expect(item?.suggestedAction).toContain('Read the term before acting');
    expect(item?.suggestedAction).toContain('listing copy may be the problem');
  });

  it('orders by spend, largest first', () => {
    const items = negationCandidates(
      [
        { ...wasteful, customerSearchTerm: 'cheap', spendCents: 26000 },
        { ...wasteful, customerSearchTerm: 'costly', spendCents: 90000 },
      ],
      CONFIG,
    );
    expect(items.map((item) => item.customerSearchTerm)).toEqual([
      'costly',
      'cheap',
    ]);
  });
});

describe('inconclusiveTerms', () => {
  it('lists zero-order terms that have not earned a verdict', () => {
    const items = inconclusiveTerms(
      [row({ adOrders: 0, adSalesCents: 0, acos: null, clicks: 4 })],
      CONFIG,
    );
    expect(items).toHaveLength(1);
  });

  it('excludes terms with no clicks at all', () => {
    expect(
      inconclusiveTerms(
        [row({ adOrders: 0, adSalesCents: 0, acos: null, clicks: 0 })],
        CONFIG,
      ),
    ).toEqual([]);
  });

  it('excludes terms that have enough clicks to judge', () => {
    expect(
      inconclusiveTerms(
        [
          row({
            adOrders: 0,
            adSalesCents: 0,
            acos: null,
            clicks: CONFIG.minimumClicksForConclusion,
          }),
        ],
        CONFIG,
      ),
    ).toEqual([]);
  });

  it('does not overlap with the negation list', () => {
    const rows = [
      row({ customerSearchTerm: 'thin', adOrders: 0, acos: null, clicks: 4, spendCents: 900 }),
      row({ customerSearchTerm: 'fat', adOrders: 0, acos: null, clicks: 120, spendCents: 30000 }),
    ];
    const negated = new Set(
      negationCandidates(rows, CONFIG).map((item) => item.customerSearchTerm),
    );
    const held = new Set(
      inconclusiveTerms(rows, CONFIG).map((item) => item.customerSearchTerm),
    );
    expect([...negated]).toEqual(['fat']);
    expect([...held]).toEqual(['thin']);
  });
});
