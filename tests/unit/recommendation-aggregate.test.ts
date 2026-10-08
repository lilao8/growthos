import { describe, expect, it } from 'vitest';
import {
  analyticsRecommendations,
  contentRecommendations,
  funnelRecommendations,
  geoRecommendations,
  mergeWithStatuses,
  seoRecommendations,
  type AuditedPage,
} from '@/domain/recommendations/aggregate';
import {
  ANALYTICS_THRESHOLDS,
  CONTENT_THRESHOLDS,
  quadrantFor,
  priorityFrom,
  type TrafficBand,
} from '@/domain/recommendations/config';
import { recommendationId, stableHash } from '@/domain/stable-id';
import {
  EMPTY_RECOMMENDATION_QUERY,
  filterRecommendations,
  isRecommendationQueryActive,
  sortRecommendations,
  tallyRecommendations,
} from '@/domain/recommendations/sorting';
import type { ChannelRow } from '@/domain/analytics/channel-metrics';
import type { FunnelRecommendation } from '@/domain/funnel/recommendations';
import type {
  AuditCheck,
  AuditResult,
  ContentIdea,
  ProductStatus,
  Recommendation,
} from '@/domain/types';

function check(overrides: Partial<AuditCheck> = {}): AuditCheck {
  return {
    ruleId: 'meta-title-present',
    status: 'error',
    severity: 'critical',
    message: 'This page has no meta title.',
    explanation: 'The title is the headline in search results.',
    recommendation: 'Write a title naming the product and the brand.',
    evidence: 'metaTitle: absent',
    points: null,
    ...overrides,
  };
}

function audit(checks: AuditCheck[], kind: 'seo' | 'geo' = 'seo'): AuditResult {
  return {
    id: `audit_${kind}_snap_a`,
    pageId: 'snap_a',
    kind,
    ruleVersion: kind === 'seo' ? 'seo-1.0.0' : 'geo-1.0.0',
    checks,
    score: 50,
    coverage: 1,
    auditedAt: '2026-08-31T00:00:00.000Z',
    inputFingerprint: 'abc',
    stale: false,
  };
}

function page(
  checks: AuditCheck[],
  kind: 'seo' | 'geo' = 'seo',
  productStatus: ProductStatus | null = 'active',
  // `typical` by default so existing cases keep testing the rule weighting
  // itself rather than the traffic adjustment on top of it.
  trafficBand: TrafficBand = 'typical',
  viewSessions: number | null = 120,
): AuditedPage {
  return {
    pageId: 'snap_a',
    productId: 'prd_a',
    productTitle: 'Ridgeline 2P Tent',
    productStatus,
    trafficBand,
    viewSessions,
    audit: audit(checks, kind),
  };
}

function channel(overrides: Partial<ChannelRow> = {}): ChannelRow {
  return {
    channel: 'Meta',
    sessions: 1000,
    users: 900,
    orders: 30,
    revenueCents: 300_000,
    newCustomers: 25,
    acquisitionSpendCents: 100_000,
    adSpendCents: 100_000,
    conversionRate: 0.03,
    averageOrderValueCents: 10_000,
    cacCents: 4_000,
    roas: 3,
    lowVolume: false,
    ...overrides,
  };
}

function idea(overrides: Partial<ContentIdea> = {}): ContentIdea {
  return {
    id: 'idea_a',
    topic: 'Best two-person tents',
    primaryKeyword: 'best 2 person tent',
    secondaryKeywords: [],
    searchIntent: 'Commercial',
    funnelStage: 'MOFU',
    contentType: 'Buying Guide',
    status: 'Idea',
    targetProductId: 'prd_a',
    seoOpportunity: 80,
    geoOpportunity: 80,
    productRelevance: 90,
    ...overrides,
  };
}

function funnelAdvice(
  overrides: Partial<FunnelRecommendation> = {},
): FunnelRecommendation {
  return {
    id: 'checkout->purchase:shipping-cost',
    from: 'checkout',
    to: 'purchase',
    transitionLabel: 'Checkout → Purchase',
    hypothesis: 'Shipping cost at checkout may be higher than expected.',
    howToCheck: 'Compare shipping cost against the average order value.',
    conversion: 0.36,
    dropOffRate: 0.64,
    dropOffSessions: 390,
    sampleSessions: 613,
    threshold: 0.45,
    confidence: 'normal',
    isLargestDropOff: false,
    raisedBecause: 'below-threshold',
    ruleVersion: 'funnel-1.0.0',
    ...overrides,
  };
}

describe('stable identity', () => {
  it('produces the same id for the same rule and entity', () => {
    expect(recommendationId('seo', 'h1', 'snap_a')).toBe(
      recommendationId('seo', 'h1', 'snap_a'),
    );
  });

  it('separates the same rule on different pages', () => {
    expect(recommendationId('seo', 'h1', 'snap_a')).not.toBe(
      recommendationId('seo', 'h1', 'snap_b'),
    );
  });

  it('separates different rules on the same page', () => {
    expect(recommendationId('seo', 'h1', 'snap_a')).not.toBe(
      recommendationId('seo', 'canonical', 'snap_a'),
    );
  });

  it('separates the same rule id across sources', () => {
    expect(recommendationId('seo', 'x', 'y')).not.toBe(
      recommendationId('geo', 'x', 'y'),
    );
  });

  it('is order sensitive, so parts cannot be confused', () => {
    expect(stableHash('a', 'bc')).not.toBe(stableHash('ab', 'c'));
  });

  it('generating twice yields identical ids', () => {
    const first = seoRecommendations([page([check()])]);
    const second = seoRecommendations([page([check()])]);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
  });
});

describe('SEO source', () => {
  it('raises a task for an error and a warning, but not a pass', () => {
    const items = seoRecommendations([
      page([
        check({ ruleId: 'meta-title-present', status: 'error' }),
        check({ ruleId: 'meta-title-length', status: 'warning' }),
        check({ ruleId: 'h1', status: 'pass' }),
        check({ ruleId: 'indexability', status: 'unknown' }),
      ]),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.ruleId).sort()).toEqual([
      'meta-title-length',
      'meta-title-present',
    ]);
  });

  it('carries the evidence, action and rule version from the audit', () => {
    const [item] = seoRecommendations([page([check()])]);
    expect(item?.evidence).toBe('metaTitle: absent');
    expect(item?.suggestedAction).toContain('Write a title');
    expect(item?.ruleVersion).toBe('seo-1.0.0');
    expect(item?.link).toBe('/seo/snap_a');
    expect(item?.relatedProductId).toBe('prd_a');
  });

  it('makes a missing title critical and a length warning lower', () => {
    const [missing] = seoRecommendations([page([check()])]);
    const [tooLong] = seoRecommendations([
      page([check({ ruleId: 'meta-title-length', status: 'warning' })]),
    ]);
    expect(missing?.priority).toBe('Critical');
    expect(tooLong?.priority).toBe('Low');
  });

  it('produces nothing for a clean audit', () => {
    expect(seoRecommendations([page([check({ status: 'pass' })])])).toHaveLength(0);
  });
});

describe('GEO source', () => {
  it('raises a task for any rule below full marks', () => {
    const items = geoRecommendations([
      page(
        [
          check({ ruleId: 'direct-answer', status: 'error', points: 0 }),
          check({ ruleId: 'faq-coverage', status: 'warning', points: 5 }),
          check({ ruleId: 'topic-clarity', status: 'pass', points: 10 }),
          check({ ruleId: 'extractability', status: 'unknown', points: null }),
        ],
        'geo',
      ),
    ]);

    expect(items.map((item) => item.ruleId).sort()).toEqual([
      'direct-answer',
      'faq-coverage',
    ]);
    expect(items[0]?.link).toBe('/geo/snap_a');
  });

  it('treats zero points as the severe case', () => {
    const [zero] = geoRecommendations([
      page([check({ ruleId: 'direct-answer', points: 0 })], 'geo'),
    ]);
    const [partial] = geoRecommendations([
      page([check({ ruleId: 'direct-answer', points: 5 })], 'geo'),
    ]);
    expect(zero?.priority).toBe('Critical');
    expect(partial?.priority).toBe('High');
  });
});

describe('Content source', () => {
  it('raises only unstarted ideas above the opportunity threshold', () => {
    const items = contentRecommendations([
      { idea: idea(), opportunity: 82, product: null },
      { idea: idea({ id: 'idea_b' }), opportunity: 40, product: null },
      { idea: idea({ id: 'idea_c', status: 'Writing' }), opportunity: 90, product: null },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.sourceEntityId).toBe('idea_a');
    expect(items[0]?.link).toBe('/content/idea_a');
  });

  it('says plainly that the score is a judgement, not an audit result', () => {
    const [item] = contentRecommendations([
      { idea: idea(), opportunity: 82, product: null },
    ]);
    expect(item?.reason).toContain("editor's judgements");
    expect(item?.reason).toContain('not from audit results');
  });

  it('raises nothing at exactly one below the threshold', () => {
    expect(
      contentRecommendations([
        {
          idea: idea(),
          opportunity: CONTENT_THRESHOLDS.highOpportunity - 1,
          product: null,
        },
      ]),
    ).toHaveLength(0);
  });
});

describe('Analytics source', () => {
  it('stays silent below the minimum traffic, however bad the rate looks', () => {
    const items = analyticsRecommendations({
      channels: [
        channel({
          sessions: ANALYTICS_THRESHOLDS.minimumSessions - 1,
          conversionRate: 0.001,
          roas: 0.1,
          orders: 1,
        }),
      ],
      averageOrderValueCents: 10_000,
    });
    expect(items).toHaveLength(0);
  });

  it('raises high traffic with low conversion', () => {
    const items = analyticsRecommendations({
      channels: [channel({ sessions: 2000, conversionRate: 0.005, roas: 5 })],
      averageOrderValueCents: 10_000,
    });
    expect(items.map((item) => item.ruleId)).toContain(
      'high-traffic-low-conversion',
    );
  });

  it('raises ROAS below target and marks a losing channel as severe', () => {
    const losing = analyticsRecommendations({
      channels: [channel({ roas: 0.8, adSpendCents: 500_000 })],
      averageOrderValueCents: 10_000,
    }).find((item) => item.ruleId === 'roas-below-target');
    const weak = analyticsRecommendations({
      channels: [channel({ roas: 1.5, adSpendCents: 500_000 })],
      averageOrderValueCents: 10_000,
    }).find((item) => item.ruleId === 'roas-below-target');

    expect(losing?.priority).toBe('Critical');
    expect(weak?.priority).toBe('High');
  });

  it('never raises ROAS for a channel with no ad spend', () => {
    const items = analyticsRecommendations({
      channels: [channel({ adSpendCents: 0, roas: null })],
      averageOrderValueCents: 10_000,
    });
    expect(items.some((item) => item.ruleId === 'roas-below-target')).toBe(false);
  });

  it('raises CAC only when it is high against the order value', () => {
    const high = analyticsRecommendations({
      channels: [channel({ cacCents: 9_000 })],
      averageOrderValueCents: 10_000,
    });
    const fine = analyticsRecommendations({
      channels: [channel({ cacCents: 2_000 })],
      averageOrderValueCents: 10_000,
    });

    expect(high.some((item) => item.ruleId === 'cac-above-aov-share')).toBe(true);
    expect(fine.some((item) => item.ruleId === 'cac-above-aov-share')).toBe(false);
  });

  it('cannot judge CAC without an order value to compare against', () => {
    const items = analyticsRecommendations({
      channels: [channel({ cacCents: 90_000 })],
      averageOrderValueCents: null,
    });
    expect(items.some((item) => item.ruleId === 'cac-above-aov-share')).toBe(false);
  });

  it('softens the verdict when the order count is small', () => {
    const items = analyticsRecommendations({
      channels: [
        channel({
          sessions: 2000,
          orders: ANALYTICS_THRESHOLDS.minimumOrders - 1,
          conversionRate: 0.005,
        }),
      ],
      averageOrderValueCents: 10_000,
    });
    const item = items.find(
      (candidate) => candidate.ruleId === 'high-traffic-low-conversion',
    );
    expect(item?.reason).toContain('indicative rather than settled');
    expect(item?.priority).not.toBe('Critical');
  });
});

describe('Funnel source', () => {
  it('produces one task per step, not one per hypothesis', () => {
    const items = funnelRecommendations([
      funnelAdvice({ id: 'a' }),
      funnelAdvice({ id: 'b', hypothesis: 'Payment methods may not cover buyers.' }),
      funnelAdvice({
        id: 'c',
        from: 'product_view',
        to: 'add_to_cart',
        hypothesis: 'Price may be out of line.',
      }),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.ruleId).sort()).toEqual([
      'checkout->purchase',
      'product_view->add_to_cart',
    ]);
  });

  it('lists every hypothesis in the action and calls them hypotheses', () => {
    const [item] = funnelRecommendations([
      funnelAdvice({ id: 'a' }),
      funnelAdvice({ id: 'b', hypothesis: 'Payment methods may not cover buyers.' }),
    ]);
    expect(item?.suggestedAction).toContain('none of which is a diagnosis');
    expect(item?.suggestedAction).toContain('Shipping cost');
    expect(item?.suggestedAction).toContain('Payment methods');
  });

  it('distinguishes a below-threshold step from the largest drop-off', () => {
    const [below] = funnelRecommendations([funnelAdvice()]);
    const [largest] = funnelRecommendations([
      funnelAdvice({ raisedBecause: 'largest-drop-off', isLargestDropOff: true }),
    ]);

    expect(below?.reason).toContain('below the');
    expect(largest?.reason).toContain('largest share');
    expect(largest?.reason).toContain('rather than underperformance');
  });
});

describe('impact, effort and quadrants', () => {
  it('maps the four quadrants at their boundaries', () => {
    expect(quadrantFor(4, 2)).toBe('Quick Win');
    expect(quadrantFor(5, 1)).toBe('Quick Win');
    expect(quadrantFor(4, 3)).toBe('Strategic');
    expect(quadrantFor(3, 2)).toBe('Low Priority');
    expect(quadrantFor(3, 3)).toBe('Defer');
    expect(quadrantFor(1, 5)).toBe('Defer');
  });

  it('derives priority from impact and how badly the rule failed', () => {
    expect(priorityFrom(5, true)).toBe('Critical');
    expect(priorityFrom(5, false)).toBe('High');
    expect(priorityFrom(3, true)).toBe('High');
    expect(priorityFrom(3, false)).toBe('Medium');
    expect(priorityFrom(1, false)).toBe('Low');
  });

  it('gives a missing title the quick-win corner', () => {
    const [item] = seoRecommendations([page([check()])]);
    expect(item?.impact).toBe(5);
    expect(item?.effort).toBe(1);
    expect(item?.quadrant).toBe('Quick Win');
  });

  it('gives original research the strategic corner, not a quick win', () => {
    const [item] = geoRecommendations([
      page([check({ ruleId: 'original-information', points: 0 })], 'geo'),
    ]);
    expect(item?.quadrant).toBe('Strategic');
  });
});

describe('merging with stored decisions', () => {
  const generated = seoRecommendations([
    page([
      check({ ruleId: 'meta-title-present' }),
      check({ ruleId: 'canonical', status: 'warning' }),
    ]),
  ]);

  it('applies a stored Done to the regenerated task', () => {
    const target = generated[0];
    if (target === undefined) throw new Error('expected a task');

    const merged = mergeWithStatuses(generated, [
      {
        id: target.id,
        status: 'Done',
        updatedAt: '2026-08-31T00:00:00.000Z',
        reason: null,
        note: '',
        evidenceAtDecision: null,
      },
    ]);

    expect(merged.active.find((item) => item.id === target.id)?.status).toBe(
      'Done',
    );
    expect(merged.active.filter((item) => item.status === 'Open')).toHaveLength(1);
  });

  it('never duplicates a task when the same finding is generated twice', () => {
    const merged = mergeWithStatuses([...generated, ...generated], []);
    expect(merged.active).toHaveLength(generated.length);
  });

  it('keeps a completed task as history once its finding disappears', () => {
    const merged = mergeWithStatuses(
      [],
      [{ id: 'rec_seo_gone', status: 'Done', updatedAt: '2026-08-31', reason: null, note: '', evidenceAtDecision: null }],
    );

    expect(merged.active).toHaveLength(0);
    expect(merged.historical).toHaveLength(1);
    expect(merged.historical[0]?.active).toBe(false);
    expect(merged.historical[0]?.status).toBe('Done');
  });

  it('forgets an open decision whose finding disappeared, rather than inventing history', () => {
    const merged = mergeWithStatuses(
      [],
      [{ id: 'rec_seo_gone', status: 'Open', updatedAt: '2026-08-31', reason: null, note: '', evidenceAtDecision: null }],
    );
    expect(merged.historical).toHaveLength(0);
  });

  it('shows the newest evidence while keeping the old decision', () => {
    const target = generated[0];
    if (target === undefined) throw new Error('expected a task');

    const regenerated = seoRecommendations([
      page([
        check({ ruleId: 'meta-title-present', evidence: 'metaTitle: empty' }),
        check({ ruleId: 'canonical', status: 'warning' }),
      ]),
    ]);
    const merged = mergeWithStatuses(regenerated, [
      {
        id: target.id,
        status: 'Done',
        updatedAt: '2026-08-31',
        reason: null,
        note: '',
        evidenceAtDecision: null,
      },
    ]);

    const item = merged.active.find((candidate) => candidate.id === target.id);
    expect(item?.evidence).toBe('metaTitle: empty');
    expect(item?.status).toBe('Done');
  });
});

describe('ordering and counting', () => {
  function recommendation(overrides: Partial<Recommendation>): Recommendation {
    return {
      id: 'rec_x',
      source: 'seo',
      ruleId: 'r',
      sourceEntityId: 'e',
      title: 't',
      category: 'c',
      ignore: null,
      priority: 'Medium',
      impact: 3,
      effort: 3,
      reason: 'r',
      suggestedAction: 'a',
      relatedProductId: null,
      status: 'Open',
      evidence: null,
      ruleVersion: 'v',
      link: '/seo',
      quadrant: 'Defer',
      active: true,
      ...overrides,
    };
  }

  it('puts open before done, then priority, then quick wins, then least effort', () => {
    const sorted = sortRecommendations([
      recommendation({ id: 'a', priority: 'Low' }),
      recommendation({ id: 'b', priority: 'Critical', status: 'Done' }),
      recommendation({ id: 'c', priority: 'Critical', effort: 4 }),
      recommendation({
        id: 'd',
        priority: 'Critical',
        impact: 5,
        effort: 1,
        quadrant: 'Quick Win',
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  /**
   * One tie-breaker at a time.
   *
   * The test above names four rules but cannot isolate the last two: its
   * Quick Win item also has the lower effort, so switching either rule off
   * leaves the order unchanged. Mutation testing found exactly that — the
   * quadrant and effort comparisons could both be deleted and it still
   * passed. Each case below varies one field and holds the rest equal.
   */
  it('prefers a quick win at equal priority and equal effort', () => {
    const sorted = sortRecommendations([
      recommendation({ id: 'a', priority: 'High', quadrant: 'Defer', effort: 3 }),
      recommendation({ id: 'b', priority: 'High', quadrant: 'Quick Win', effort: 3 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('prefers less effort at equal priority and equal quadrant', () => {
    const sorted = sortRecommendations([
      recommendation({ id: 'a', priority: 'High', quadrant: 'Defer', effort: 4 }),
      recommendation({ id: 'b', priority: 'High', quadrant: 'Defer', effort: 1 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('prefers more impact when priority, quadrant and effort all match', () => {
    const sorted = sortRecommendations([
      recommendation({ id: 'a', priority: 'High', effort: 2, impact: 1 }),
      recommendation({ id: 'b', priority: 'High', effort: 2, impact: 5 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('prefers higher priority even when the lower one is a cheap quick win', () => {
    // Priority is checked before the quadrant, so a Critical chore outranks a
    // Low quick win. Swapping the two comparisons would reverse this.
    const sorted = sortRecommendations([
      recommendation({ id: 'a', priority: 'Low', quadrant: 'Quick Win', effort: 1 }),
      recommendation({ id: 'b', priority: 'Critical', quadrant: 'Defer', effort: 5 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('leaves the needsReview rule inside the ignored group', () => {
    // Both are Critical quick wins with equal effort, so only the review rule
    // could reorder them — and it must not, because only one is ignored.
    // Widening the guard to `||` would let an ignored finding jump an open
    // one; the id tie-break then decides, which is what this asserts.
    const open = recommendation({ id: 'b', priority: 'High' });
    const ignored = recommendation({
      id: 'a',
      priority: 'High',
      status: 'Ignored',
      ignore: {
        reason: 'deliberate',
        note: '',
        decidedAt: '2026-08-31T00:00:00.000Z',
        needsReview: true,
      },
    });
    expect(sortRecommendations([ignored, open]).map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('sorts an ignored finding that carries no decision record', () => {
    // `status: 'Ignored'` with `ignore: null` should not be reachable, but the
    // sort reads `ignore?.needsReview` and a stored record could be partial.
    // Dropping the optional chain throws here rather than sorting.
    const bare = recommendation({ id: 'a', status: 'Ignored', ignore: null });
    const flagged = recommendation({
      id: 'b',
      status: 'Ignored',
      ignore: {
        reason: 'deliberate',
        note: '',
        decidedAt: '2026-08-31T00:00:00.000Z',
        needsReview: true,
      },
    });
    expect(() => sortRecommendations([bare, flagged])).not.toThrow();
    expect(sortRecommendations([bare, flagged]).map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('is stable across runs for otherwise identical items', () => {
    const items = [
      recommendation({ id: 'z' }),
      recommendation({ id: 'a' }),
      recommendation({ id: 'm' }),
    ];
    expect(sortRecommendations(items).map((item) => item.id)).toEqual([
      'a',
      'm',
      'z',
    ]);
  });

  it('counts by priority, quadrant and status without double counting', () => {
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical', quadrant: 'Quick Win' }),
      recommendation({ id: 'b', priority: 'Low', status: 'Done' }),
    ]);

    expect(tally.total).toBe(2);
    expect(tally.open).toBe(1);
    expect(tally.done).toBe(1);
    expect(tally.byPriority.Critical).toBe(1);
    expect(tally.byQuadrant['Quick Win']).toBe(1);
  });

  /**
   * The priority and quadrant counts sit in the same row of cards as `open`,
   * so they have to describe the same population. Counting closed work there
   * produced a row that contradicted itself — "Open 0" beside "Critical 6".
   *
   * Every case below uses findings that are Critical or Quick Win *and*
   * closed, which is the only shape that tells the two rules apart. The
   * earlier test above cannot: its closed finding is Low priority, so it
   * counts 1 either way.
   */
  it('leaves Critical out once the finding is done', () => {
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical', status: 'Done' }),
    ]);

    expect(tally.done).toBe(1);
    expect(tally.byPriority.Critical).toBe(0);
  });

  it('leaves Critical out once the finding is ignored', () => {
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical', status: 'Ignored' }),
    ]);

    expect(tally.ignored).toBe(1);
    expect(tally.byPriority.Critical).toBe(0);
  });

  it('leaves a quick win out once it is closed', () => {
    const tally = tallyRecommendations([
      recommendation({ id: 'a', quadrant: 'Quick Win', status: 'Done' }),
      recommendation({ id: 'b', quadrant: 'Quick Win', status: 'Ignored' }),
      recommendation({ id: 'c', quadrant: 'Quick Win' }),
    ]);

    expect(tally.byQuadrant['Quick Win']).toBe(1);
  });

  it('never reports more in any band than are open', () => {
    // The invariant the row depends on: no card can exceed the Open count.
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical', quadrant: 'Quick Win' }),
      recommendation({ id: 'b', priority: 'Critical', status: 'Done' }),
      recommendation({ id: 'c', priority: 'High', status: 'Ignored' }),
      recommendation({ id: 'd', priority: 'Medium' }),
    ]);

    expect(tally.open).toBe(2);
    for (const [band, count] of Object.entries(tally.byPriority)) {
      expect(count, band).toBeLessThanOrEqual(tally.open);
    }
    for (const [band, count] of Object.entries(tally.byQuadrant)) {
      expect(count, band).toBeLessThanOrEqual(tally.open);
    }
  });

  it('adds up to exactly the open count across every priority', () => {
    // Each open finding lands in one band and one only, so the bands
    // partition the open set rather than merely fitting inside it.
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical' }),
      recommendation({ id: 'b', priority: 'High' }),
      recommendation({ id: 'c', priority: 'High' }),
      recommendation({ id: 'd', priority: 'Low', status: 'Done' }),
      recommendation({ id: 'e', priority: 'Medium', status: 'Ignored' }),
    ]);

    const summed = Object.values(tally.byPriority).reduce((a, b) => a + b, 0);
    expect(summed).toBe(tally.open);
    expect(summed).toBe(3);
    expect(Object.values(tally.byQuadrant).reduce((a, b) => a + b, 0)).toBe(
      tally.open,
    );
  });

  it('empties every band when all the work is closed', () => {
    // The case that gave the contradiction away in the first place.
    const tally = tallyRecommendations([
      recommendation({ id: 'a', priority: 'Critical', quadrant: 'Quick Win', status: 'Done' }),
      recommendation({ id: 'b', priority: 'Critical', quadrant: 'Quick Win', status: 'Ignored' }),
    ]);

    expect(tally.open).toBe(0);
    expect(tally.total).toBe(2);
    expect(tally.byPriority.Critical).toBe(0);
    expect(tally.byQuadrant['Quick Win']).toBe(0);
  });

  /**
   * Ignored findings sort by whether their grounds still hold.
   *
   * The service flags an ignore whose evidence has moved on, and that flag is
   * covered. The *order* was not: the whole point of flagging is that the one
   * worth revisiting is the one you see first, and nothing asserted that.
   */
  it('puts an ignore whose evidence changed above one that still holds', () => {
    const settled = recommendation({
      id: 'a',
      status: 'Ignored',
      ignore: {
        reason: 'deliberate',
        note: '',
        decidedAt: '2026-08-31T00:00:00.000Z',
        needsReview: false,
      },
    });
    const stale = recommendation({
      id: 'b',
      status: 'Ignored',
      ignore: {
        reason: 'deliberate',
        note: '',
        decidedAt: '2026-08-31T00:00:00.000Z',
        needsReview: true,
      },
    });

    // Given in the order that would be wrong, so a sort that does nothing
    // fails rather than passing on the input's own ordering.
    expect(sortRecommendations([settled, stale]).map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('still puts every ignored finding below every open one', () => {
    const stale = recommendation({
      id: 'a',
      status: 'Ignored',
      priority: 'Critical',
      ignore: {
        reason: 'deliberate',
        note: '',
        decidedAt: '2026-08-31T00:00:00.000Z',
        needsReview: true,
      },
    });
    const open = recommendation({ id: 'b', priority: 'Low' });

    // Needing review promotes within the ignored group, never out of it.
    expect(sortRecommendations([stale, open]).map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('counts only the ignores that need another look', () => {
    const withIgnore = (id: string, needsReview: boolean): Recommendation =>
      recommendation({
        id,
        status: 'Ignored',
        ignore: {
          reason: 'wont-fix',
          note: '',
          decidedAt: '2026-08-31T00:00:00.000Z',
          needsReview,
        },
      });

    const tally = tallyRecommendations([
      withIgnore('a', true),
      withIgnore('b', false),
      recommendation({ id: 'c' }),
    ]);

    expect(tally.ignored).toBe(2);
    expect(tally.ignoredNeedingReview).toBe(1);
  });
});

/**
 * Filtering the task list.
 *
 * Mutation testing found this whole module untested: every mutant of
 * `filterRecommendations` and `isRecommendationQueryActive` survived,
 * including replacing their bodies outright. They were exercised only
 * through the service and the browser, where a filter quietly matching
 * everything looks the same as a filter nobody applied.
 */
describe('filterRecommendations', () => {
  function item(overrides: Partial<Recommendation>): Recommendation {
    return {
      id: 'rec_x',
      source: 'seo',
      ruleId: 'r',
      sourceEntityId: 'e',
      title: 't',
      category: 'c',
      ignore: null,
      priority: 'Medium',
      impact: 3,
      effort: 3,
      reason: 'r',
      suggestedAction: 'a',
      relatedProductId: null,
      status: 'Open',
      evidence: null,
      ruleVersion: 'v',
      link: '/seo',
      quadrant: 'Defer',
      active: true,
      ...overrides,
    };
  }

  const all = [
    item({ id: 'a', priority: 'Critical', source: 'seo', quadrant: 'Quick Win' }),
    item({ id: 'b', priority: 'Low', source: 'geo', quadrant: 'Defer' }),
    item({
      id: 'c',
      priority: 'Critical',
      source: 'amazon',
      quadrant: 'Strategic',
      status: 'Done',
    }),
  ];

  const ids = (query: Parameters<typeof filterRecommendations>[1]): string[] =>
    filterRecommendations(all, query).map((i) => i.id);

  it('treats an empty selection as no constraint', () => {
    expect(ids(EMPTY_RECOMMENDATION_QUERY)).toEqual(['a', 'b', 'c']);
  });

  it('narrows by priority', () => {
    expect(ids({ ...EMPTY_RECOMMENDATION_QUERY, priorities: ['Critical'] })).toEqual([
      'a',
      'c',
    ]);
  });

  it('narrows by source', () => {
    expect(ids({ ...EMPTY_RECOMMENDATION_QUERY, sources: ['geo'] })).toEqual(['b']);
  });

  it('narrows by quadrant', () => {
    expect(
      ids({ ...EMPTY_RECOMMENDATION_QUERY, quadrants: ['Quick Win'] }),
    ).toEqual(['a']);
  });

  it('narrows by status', () => {
    expect(ids({ ...EMPTY_RECOMMENDATION_QUERY, statuses: ['Done'] })).toEqual(['c']);
  });

  it('combines dimensions as an intersection, not a union', () => {
    // 'a' and 'c' are both Critical and 'b' is the only geo item, so a union
    // would return three and an intersection returns none.
    expect(
      ids({
        ...EMPTY_RECOMMENDATION_QUERY,
        priorities: ['Critical'],
        sources: ['geo'],
      }),
    ).toEqual([]);
  });

  it('keeps several values within one dimension as alternatives', () => {
    expect(
      ids({ ...EMPTY_RECOMMENDATION_QUERY, sources: ['seo', 'amazon'] }),
    ).toEqual(['a', 'c']);
  });

  it('returns nothing when the selection matches nothing', () => {
    expect(ids({ ...EMPTY_RECOMMENDATION_QUERY, sources: ['content'] })).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    filterRecommendations(all, {
      ...EMPTY_RECOMMENDATION_QUERY,
      sources: ['geo'],
    });
    expect(all.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isRecommendationQueryActive', () => {
  it('is false for the empty query', () => {
    expect(isRecommendationQueryActive(EMPTY_RECOMMENDATION_QUERY)).toBe(false);
  });

  // One case per dimension: an OR written as an AND, or a dimension left out
  // of the check, would still pass a test that only ever set one of them.
  it('is true when any single dimension is set', () => {
    const cases: Array<[string, Parameters<typeof isRecommendationQueryActive>[0]]> = [
      ['priorities', { ...EMPTY_RECOMMENDATION_QUERY, priorities: ['Low'] }],
      ['sources', { ...EMPTY_RECOMMENDATION_QUERY, sources: ['seo'] }],
      ['quadrants', { ...EMPTY_RECOMMENDATION_QUERY, quadrants: ['Defer'] }],
      ['statuses', { ...EMPTY_RECOMMENDATION_QUERY, statuses: ['Open'] }],
    ];
    for (const [label, query] of cases) {
      expect(isRecommendationQueryActive(query), label).toBe(true);
    }
  });

  it('is true when several dimensions are set', () => {
    expect(
      isRecommendationQueryActive({
        ...EMPTY_RECOMMENDATION_QUERY,
        priorities: ['Low'],
        statuses: ['Open'],
      }),
    ).toBe(true);
  });
});

describe('EMPTY_RECOMMENDATION_QUERY', () => {
  it('carries every dimension, each empty', () => {
    // Spread onto a partial query at a dozen call sites, so a missing key
    // would make `query.<dimension>.length` throw rather than mean "no
    // constraint". Mutating the whole object to {} survived before this.
    expect(EMPTY_RECOMMENDATION_QUERY).toEqual({
      priorities: [],
      sources: [],
      quadrants: [],
      statuses: [],
    });
  });
});

describe('findings on unpublished products', () => {
  it('demotes a draft product below the same finding on a live one', () => {
    const [live] = seoRecommendations([page([check()], 'seo', 'active')]);
    const [draft] = seoRecommendations([page([check()], 'seo', 'draft')]);

    expect(live?.impact).toBe(5);
    expect(draft?.impact).toBe(3);
    expect(live?.priority).toBe('Critical');
    // Still worth fixing, just not the first thing anybody should do.
    expect(draft?.priority).toBe('Medium');
  });

  it('says why it was demoted rather than hiding the finding', () => {
    const [draft] = seoRecommendations([page([check()], 'seo', 'draft')]);
    expect(draft).toBeDefined();
    expect(draft?.reason).toContain('draft');
    expect(draft?.reason).toContain('cannot affect anything until it is published');
  });

  it('applies the same demotion to GEO findings', () => {
    const [archived] = geoRecommendations([
      page([check({ ruleId: 'direct-answer', points: 0 })], 'geo', 'archived'),
    ]);
    expect(archived?.impact).toBe(3);
    expect(archived?.reason).toContain('archived');
  });

  it('never drops impact below 1', () => {
    const [item] = seoRecommendations([
      page([check({ ruleId: 'url-slug', status: 'warning' })], 'seo', 'archived'),
    ]);
    expect(item?.impact).toBeGreaterThanOrEqual(1);
  });

  it('leaves a page with no product behind it alone', () => {
    const items = seoRecommendations([
      {
        pageId: 'snap_x',
        productId: null,
        productTitle: 'https://example.com/guide',
        productStatus: null,
        trafficBand: 'unknown',
        viewSessions: null,
        audit: audit([check()]),
      },
    ]);
    expect(items[0]?.impact).toBe(5);
  });
});
