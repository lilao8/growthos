import { describe, expect, it } from 'vitest';
import { seoRecommendations, type AuditedPage } from '@/domain/recommendations/aggregate';
import {
  SEO_WEIGHTS,
  TRAFFIC_BAND_MINIMUM_PRODUCTS,
  trafficBands,
  type TrafficBand,
} from '@/domain/recommendations/config';
import { sortRecommendations } from '@/domain/recommendations/sorting';
import type { AuditCheck, AuditResult, ProductStatus } from '@/domain/types';

/**
 * Weighting a finding by how busy its page is.
 *
 * Two things are load-bearing here and both are easy to get wrong:
 *
 * 1. The adjustment is ±1, not a multiplier. Traffic decides which of two
 *    comparable findings to do first; it must not turn a busy page's cosmetic
 *    warning into something that outranks another page's outright failure.
 * 2. An unpublished product has no traffic *because* it is unpublished.
 *    Charging it both the status penalty and the quiet-page penalty would
 *    count one fact twice.
 */

function check(overrides: Partial<AuditCheck> = {}): AuditCheck {
  return {
    ruleId: 'meta-title-present',
    status: 'error',
    severity: 'critical',
    message: 'This page has no meta title.',
    explanation: 'The title is the page headline in search results.',
    recommendation: 'Write one.',
    evidence: 'metaTitle: absent',
    points: null,
    ...overrides,
  };
}

function audit(checks: AuditCheck[]): AuditResult {
  return {
    id: 'audit_seo_snap_a',
    pageId: 'snap_a',
    kind: 'seo',
    ruleVersion: 'seo-1.0.0',
    checks,
    score: 40,
    coverage: 1,
    auditedAt: '2026-08-31T00:00:00.000Z',
    inputFingerprint: 'abc',
    stale: false,
  };
}

function page(
  band: TrafficBand,
  viewSessions: number | null = 100,
  productStatus: ProductStatus | null = 'active',
  overrides: Partial<AuditedPage> = {},
): AuditedPage {
  return {
    pageId: 'snap_a',
    productId: 'prd_a',
    productTitle: 'Ridgeline 2P Tent',
    productStatus,
    trafficBand: band,
    viewSessions,
    audit: audit([midCheck()]),
    ...overrides,
  };
}

/**
 * A mid-impact rule for the directional tests.
 *
 * `meta-title-present` is already impact 5, so a "busy page raises it" test
 * against that rule would be testing the clamp rather than the adjustment.
 * `image-alt` sits at 3 and can move in both directions.
 */
const MID_RULE = 'image-alt';
const BASE = SEO_WEIGHTS[MID_RULE]?.impact ?? 0;

function midCheck(overrides: Partial<AuditCheck> = {}): AuditCheck {
  return check({ ruleId: MID_RULE, status: 'error', severity: 'high', ...overrides });
}

describe('trafficBands', () => {
  function bandsOf(values: Record<string, number>): Map<string, TrafficBand> {
    return trafficBands(new Map(Object.entries(values)));
  }

  it('splits a catalogue into thirds by session volume', () => {
    const bands = bandsOf({
      a: 900, b: 800, c: 500, d: 400, e: 300, f: 200, g: 100, h: 50, i: 10,
    });
    expect(bands.get('a')).toBe('high');
    expect(bands.get('b')).toBe('high');
    expect(bands.get('e')).toBe('typical');
    expect(bands.get('h')).toBe('low');
    expect(bands.get('i')).toBe('low');
  });

  it('distinguishes "quiet" from "nobody looked at it"', () => {
    const bands = bandsOf({
      a: 900, b: 800, c: 500, d: 400, e: 300, f: 200, g: 10, dead: 0,
    });
    // Zero is its own band: "fewer people than most" and "nobody at all" are
    // different statements and get different wording.
    expect(bands.get('dead')).toBe('none');
    expect(bands.get('g')).toBe('low');
  });

  it('refuses to band a catalogue too small to have thirds', () => {
    const bands = bandsOf({ a: 900, b: 100 });
    // "Top third of two" is a claim the data cannot support.
    expect(bands.get('a')).toBe('typical');
    expect(bands.get('b')).toBe('typical');
  });

  it('bands at exactly the minimum catalogue size', () => {
    const values: Record<string, number> = {};
    for (let i = 0; i < TRAFFIC_BAND_MINIMUM_PRODUCTS; i += 1) {
      values[`p${i}`] = (TRAFFIC_BAND_MINIMUM_PRODUCTS - i) * 100;
    }
    const bands = bandsOf(values);
    expect(bands.get('p0')).toBe('high');
    expect(bands.get(`p${TRAFFIC_BAND_MINIMUM_PRODUCTS - 1}`)).toBe('low');
  });

  it('bands zero-session products even below the minimum', () => {
    // The minimum guards the *relative* claim; "nobody viewed this" is
    // absolute and always true.
    const bands = bandsOf({ a: 100, dead: 0 });
    expect(bands.get('dead')).toBe('none');
  });

  it('returns nothing for an empty catalogue', () => {
    expect(trafficBands(new Map()).size).toBe(0);
  });

  it('gives every product exactly one band', () => {
    const values = { a: 900, b: 800, c: 500, d: 400, e: 300, f: 200, g: 0 };
    const bands = bandsOf(values);
    expect(bands.size).toBe(Object.keys(values).length);
  });
});

describe('traffic adjusts impact by one step, in the right direction', () => {
  it('raises a finding on a busy page', () => {
    const [item] = seoRecommendations([page('high', 900)]);
    expect(item?.impact).toBe(BASE + 1);
  });

  it('lowers a finding on a quiet page', () => {
    const [item] = seoRecommendations([page('low', 12)]);
    expect(item?.impact).toBe(BASE - 1);
  });

  it('lowers a finding on a page nobody viewed', () => {
    const [item] = seoRecommendations([page('none', 0)]);
    expect(item?.impact).toBe(BASE - 1);
  });

  it('leaves a typical page alone', () => {
    const [item] = seoRecommendations([page('typical', 120)]);
    expect(item?.impact).toBe(BASE);
  });

  it('leaves a page with no traffic record alone rather than guessing', () => {
    const [item] = seoRecommendations([page('unknown', null)]);
    expect(item?.impact).toBe(BASE);
    expect(item?.reason).not.toMatch(/third of the catalogue/);
  });

  it('never pushes impact above 5 or below 1', () => {
    // meta-title-present is already impact 5, so a busy page must not make it 6.
    const maxed = page('high', 900, 'active', {
      audit: audit([check({ ruleId: 'meta-title-present' })]),
    });
    expect(seoRecommendations([maxed])[0]?.impact).toBe(5);

    // meta-title-length is impact 2, so two steps down must still stop at 1.
    const trivial = page('none', 0, 'active', {
      audit: audit([check({ ruleId: 'meta-title-length', status: 'warning' })]),
    });
    expect(seoRecommendations([trivial])[0]?.impact).toBeGreaterThanOrEqual(1);
  });

  it('says why it moved, with the session count as evidence', () => {
    const [busy] = seoRecommendations([page('high', 912)]);
    expect(busy?.reason).toContain('busiest third');
    expect(busy?.reason).toContain('912 sessions');

    const [quiet] = seoRecommendations([page('low', 7)]);
    expect(quiet?.reason).toContain('quietest third');
    expect(quiet?.reason).toContain('7 sessions');

    const [dead] = seoRecommendations([page('none', 0)]);
    expect(dead?.reason).toContain('No session viewed this page');
  });
});

describe('an unpublished product is not charged twice for one fact', () => {
  const UNPUBLISHED_PENALTY = 2;

  it('applies the status penalty and skips the traffic one', () => {
    // A draft has zero sessions *because* it is a draft. Banding it as quiet
    // and penalising that too would deduct 3 for a single circumstance.
    const [item] = seoRecommendations([page('none', 0, 'draft')]);
    expect(item?.impact).toBe(BASE - UNPUBLISHED_PENALTY);
  });

  it('gives the publication reason, not the traffic one', () => {
    const [item] = seoRecommendations([page('none', 0, 'draft')]);
    expect(item?.reason).toContain('draft');
    expect(item?.reason).not.toContain('No session viewed this page');
  });

  it('does not let a busy archived page cancel its own penalty', () => {
    // Traffic is skipped entirely for unpublished products, so a stale high
    // band cannot add +1 back.
    const [item] = seoRecommendations([page('high', 900, 'archived')]);
    expect(item?.impact).toBe(BASE - UNPUBLISHED_PENALTY);
  });
});

describe('the ordering an operator actually sees', () => {
  it('puts the same failure on a busy page above a quiet one', () => {
    const items = sortRecommendations(
      seoRecommendations([
        page('low', 8, 'active', { pageId: 'snap_quiet', productId: 'prd_quiet' }),
        page('high', 900, 'active', { pageId: 'snap_busy', productId: 'prd_busy' }),
      ]),
    );
    expect(items[0]?.sourceEntityId).toBe('snap_busy');
  });

  it('keeps a critical failure ahead of a busy page’s warning', () => {
    // This is the guarantee the ±1 step buys: one band of traffic cannot
    // promote a cosmetic warning past an outright failure. It is NOT a promise
    // that severity always wins — two findings of similar weight can and do
    // reorder on traffic, which is the whole point of the feature.
    const busyWarning = page('high', 900, 'active', {
      pageId: 'snap_busy',
      productId: 'prd_busy',
      audit: audit([
        check({ ruleId: 'meta-title-length', status: 'warning', severity: 'low' }),
      ]),
    });
    const quietCritical = page('low', 8, 'active', {
      pageId: 'snap_quiet',
      productId: 'prd_quiet',
      audit: audit([check({ ruleId: 'meta-title-present' })]),
    });

    const items = sortRecommendations(
      seoRecommendations([busyWarning, quietCritical]),
    );
    expect(items[0]?.sourceEntityId).toBe('snap_quiet');
    expect(items[0]?.priority).toBe('Critical');
  });

  it('still treats an error on a busy page as a severe failure', () => {
    // Regression guard: severity used to be inferred from whether any note had
    // been written, so the traffic note — even one that RAISED impact — would
    // silently downgrade every finding on a busy page.
    const [item] = seoRecommendations([
      page('high', 900, 'active', {
        audit: audit([check({ ruleId: 'meta-title-present' })]),
      }),
    ]);
    expect(item?.priority).toBe('Critical');
  });
});
