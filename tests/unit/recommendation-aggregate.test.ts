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
