import { describe, expect, it } from 'vitest';
import {
  amazonRecommendations,
  seoRecommendations,
  type AuditedListing,
  type AuditedPage,
} from '@/domain/recommendations/aggregate';
import { AMAZON_WEIGHTS } from '@/domain/recommendations/config';
import { sortRecommendations } from '@/domain/recommendations/sorting';
import type { AuditCheck, ListingAudit, ListingStatus } from '@/domain/types';

/**
 * How Amazon findings become tasks.
 *
 * The load-bearing test here is the status asymmetry: a storefront draft is
 * demoted because nothing can reach it yet, while a suppressed listing is NOT
 * demoted because it was live and is losing sales right now. Getting that
 * backwards would bury the most urgent item in the catalogue.
 */

function check(overrides: Partial<AuditCheck> = {}): AuditCheck {
  return {
    ruleId: 'title-length',
    status: 'error',
    severity: 'high',
    message: 'The title is too long.',
    explanation: 'The title is the listing headline.',
    recommendation: 'Cut it down.',
    evidence: '240 characters',
    points: null,
    ...overrides,
  };
}

function audit(checks: AuditCheck[]): ListingAudit {
  return {
    id: 'audit_amazon_lst_1',
    listingId: 'lst_1',
    ruleVersion: 'amazon-listing-1.0.0',
    checks,
    score: 50,
    coverage: 1,
    auditedAt: '2026-08-31T00:00:00.000Z',
    inputFingerprint: 'abc123',
    stale: false,
  };
}

function entry(
  checks: AuditCheck[],
  status: ListingStatus = 'active',
  overrides: Partial<AuditedListing> = {},
): AuditedListing {
  return {
    listingId: 'lst_1',
    asin: 'B0TESTASIN',
    productId: 'prd_1',
    productTitle: 'Test Item',
    listingStatus: status,
    audit: audit(checks),
    ...overrides,
  };
}

describe('amazonRecommendations', () => {
  it('raises a task for each failing and warning check', () => {
    const items = amazonRecommendations([
      entry([
        check({ ruleId: 'title-length', status: 'error' }),
        check({ ruleId: 'image-count', status: 'warning' }),
      ]),
    ]);
    expect(items).toHaveLength(2);
  });

  it('raises nothing for passing or unassessed checks', () => {
    const items = amazonRecommendations([
      entry([
        check({ ruleId: 'title-length', status: 'pass' }),
        check({ ruleId: 'buy-box', status: 'unknown' }),
      ]),
    ]);
    expect(items).toEqual([]);
  });

  it('raises nothing at all for an empty input', () => {
    expect(amazonRecommendations([])).toEqual([]);
  });

  it('labels every task as an Amazon listing task and links to the listing', () => {
    const [item] = amazonRecommendations([entry([check()])]);
    expect(item?.source).toBe('amazon');
    expect(item?.category).toBe('Amazon listing');
    expect(item?.link).toBe('/amazon/lst_1');
    expect(item?.relatedProductId).toBe('prd_1');
    expect(item?.ruleVersion).toBe('amazon-listing-1.0.0');
  });

  it('puts the ASIN in the evidence so a listing is identifiable', () => {
    const [withEvidence] = amazonRecommendations([entry([check()])]);
    expect(withEvidence?.evidence).toContain('B0TESTASIN');
    expect(withEvidence?.evidence).toContain('240 characters');

    const [withoutEvidence] = amazonRecommendations([
      entry([check({ evidence: null })]),
    ]);
    expect(withoutEvidence?.evidence).toBe('ASIN B0TESTASIN');
  });

  it('gives the same rule on two listings two separate tasks', () => {
    const items = amazonRecommendations([
      entry([check()]),
      entry([check()], 'active', {
        listingId: 'lst_2',
        asin: 'B0OTHERASN',
        productTitle: 'Other Item',
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });

  it('gives the same listing and rule a stable id across runs', () => {
    const first = amazonRecommendations([entry([check()])]);
    const second = amazonRecommendations([entry([check()])]);
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('does not collide with a storefront task using the same rule id', () => {
    const page: AuditedPage = {
      pageId: 'lst_1',
      productId: 'prd_1',
      productTitle: 'Test Item',
      productStatus: 'active',
      audit: {
        id: 'audit_seo_lst_1',
        pageId: 'lst_1',
        kind: 'seo',
        ruleVersion: 'seo-1.0.0',
        checks: [check({ ruleId: 'meta-title-length' })],
        score: 50,
        coverage: 1,
        auditedAt: '2026-08-31T00:00:00.000Z',
        inputFingerprint: 'abc123',
        stale: false,
      },
    };
    const amazon = amazonRecommendations([entry([check()])]);
    const seo = seoRecommendations([page]);
    expect(amazon[0]?.id).not.toBe(seo[0]?.id);
  });
});

describe('listing status adjusts impact, and the direction matters', () => {
  const failing = [check({ ruleId: 'title-length', status: 'error' })];
  const baseImpact = AMAZON_WEIGHTS['title-length']?.impact ?? 0;

  it('does not demote a suppressed listing', () => {
    const [item] = amazonRecommendations([entry(failing, 'suppressed')]);
    expect(item?.impact).toBe(baseImpact);
  });

  it('says on a suppressed listing that it is losing sales now', () => {
    const [item] = amazonRecommendations([entry(failing, 'suppressed')]);
    expect(item?.reason).toContain('losing sales now');
    expect(item?.reason).not.toContain('cannot affect anything');
  });

  it('demotes an inactive listing, which is the real analogue of a draft', () => {
    const [item] = amazonRecommendations([entry(failing, 'inactive')]);
    expect(item?.impact).toBeLessThan(baseImpact);
    expect(item?.reason).toContain('cannot affect anything until it is selling');
  });

  it('never demotes impact below 1', () => {
    const [item] = amazonRecommendations([
      entry([check({ ruleId: 'video-present', status: 'warning' })], 'inactive'),
    ]);
    expect(item?.impact).toBeGreaterThanOrEqual(1);
  });

  it('treats an inactive listing failure as not severe', () => {
    const [active] = amazonRecommendations([entry(failing, 'active')]);
    const [inactive] = amazonRecommendations([entry(failing, 'inactive')]);
    expect(active?.priority).toBe('Critical');
    expect(inactive?.priority).not.toBe('Critical');
  });

  it('sorts a suppressed listing above an inactive one with the same rule', () => {
    const items = sortRecommendations(
      amazonRecommendations([
        entry(failing, 'inactive', { listingId: 'lst_inactive' }),
        entry(failing, 'suppressed', { listingId: 'lst_suppressed' }),
      ]),
    );
    expect(items[0]?.sourceEntityId).toBe('lst_suppressed');
  });

  it('ranks the suppression itself as the most urgent thing on that listing', () => {
    const items = sortRecommendations(
      amazonRecommendations([
        entry(
          [
            check({ ruleId: 'listing-status', status: 'error', severity: 'critical' }),
            check({ ruleId: 'video-present', status: 'warning', severity: 'low' }),
            check({ ruleId: 'bullets-length', status: 'warning', severity: 'low' }),
          ],
          'suppressed',
        ),
      ]),
    );
    expect(items[0]?.ruleId).toBe('listing-status');
    expect(items[0]?.priority).toBe('Critical');
  });
});

describe('every Amazon weighting is explainable', () => {
  it('states a rationale and a 1–5 pair for each weighted rule', () => {
    for (const [ruleId, weighting] of Object.entries(AMAZON_WEIGHTS)) {
      expect(weighting.impact, ruleId).toBeGreaterThanOrEqual(1);
      expect(weighting.impact, ruleId).toBeLessThanOrEqual(5);
      expect(weighting.effort, ruleId).toBeGreaterThanOrEqual(1);
      expect(weighting.effort, ruleId).toBeLessThanOrEqual(5);
      expect(weighting.rationale.length, ruleId).toBeGreaterThan(30);
    }
  });
});
