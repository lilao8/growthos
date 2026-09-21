import { describe, expect, it } from 'vitest';
import { AMAZON_RULES, byteLength } from '@/domain/amazon/rules';
import {
  AMAZON_RULE_IDS,
  DEFAULT_AMAZON_CONFIG,
  AMAZON_RULE_VERSION,
} from '@/domain/amazon/config';
import { listingFingerprint, runListingAudit } from '@/domain/amazon/engine';
import type { AmazonListing, AuditCheck, CheckStatus, Product } from '@/domain/types';

/**
 * The Amazon listing rules.
 *
 * Every rule is exercised for each verdict it can reach, including `unknown`,
 * because an unknown that silently becomes a pass is the failure mode these
 * rules exist to avoid.
 */

const PRODUCT: Product = {
  id: 'prd_test',
  sku: 'NT-TEST-1',
  slug: 'northtrail-test-item',
  title: 'NorthTrail Test Item',
  category: 'Tents & Shelters',
  priceCents: 10000,
  costCents: 4000,
  inventory: 10,
  status: 'active',
  primaryKeyword: 'test item',
  metaTitle: 'Test',
  metaDescription: 'Test',
  productDescription: 'Test',
};

const GOOD_BULLET =
  'CARRIES 45 LB COMFORTABLY: a load-transferring hipbelt moves weight off the shoulders on long days.';

function listing(overrides: Partial<AmazonListing> = {}): AmazonListing {
  return {
    id: 'lst_test',
    productId: 'prd_test',
    asin: 'B0TESTASIN',
    marketplace: 'ATVPDKIKX0DER',
    title:
      'NorthTrail Test Item, 3-Season Freestanding Shelter for Two, 4.2 lb Packed Weight, Dual Vestibules',
    bullets: [GOOD_BULLET, GOOD_BULLET, GOOD_BULLET, GOOD_BULLET, GOOD_BULLET],
    aPlusModules: ['Comparison chart'],
    backendSearchTerms:
      'synonym alternative phrasing misspelled variant another useful query people actually type here',
    imageCount: 7,
    mainImageWhiteBackground: 'yes',
    hasVideo: true,
    browseNode: '3400371',
    brandRegistered: true,
    variationParentAsin: null,
    expectedVariationSiblings: [],
    reviewCount: 200,
    averageRating: 4.5,
    buyBoxPercentage: 0.97,
    fulfilment: 'FBA',
    status: 'active',
    ...overrides,
  };
}

function run(overrides: Partial<AmazonListing> = {}, product: Product | null = PRODUCT) {
  return runListingAudit({
    listing: listing(overrides),
    product,
    now: '2026-08-31T00:00:00.000Z',
  });
}

function find(checks: readonly AuditCheck[], ruleId: string): AuditCheck {
  const found = checks.find((check) => check.ruleId === ruleId);
  if (found === undefined) throw new Error(`no check for ${ruleId}`);
  return found;
}

function statusOf(
  ruleId: string,
  overrides: Partial<AmazonListing> = {},
  product: Product | null = PRODUCT,
): CheckStatus {
  return find(run(overrides, product).checks, ruleId).status;
}

describe('byteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(byteLength('abcde')).toBe(5);
  });

  it('counts accented Latin as two bytes', () => {
    expect(byteLength('montaña')).toBe(8);
    expect('montaña'.length).toBe(7);
  });

  it('counts CJK as three bytes and emoji as four', () => {
    expect(byteLength('帐篷')).toBe(6);
    expect(byteLength('🏕')).toBe(4);
  });

  it('is zero for an empty string', () => {
    expect(byteLength('')).toBe(0);
  });
});

describe('engine shape', () => {
  it('runs every declared rule exactly once', () => {
    const result = run();
    expect(result.checks).toHaveLength(AMAZON_RULES.length);
    expect(result.checks.map((check) => check.ruleId).sort()).toEqual(
      [...AMAZON_RULE_IDS].sort(),
    );
  });

  it('stamps its own rule version, not the SEO one', () => {
    expect(run().ruleVersion).toBe(AMAZON_RULE_VERSION);
    expect(AMAZON_RULE_VERSION).not.toContain('seo');
  });

  it('is deterministic for the same inputs', () => {
    expect(run()).toEqual(run());
  });

  it('scores a clean listing at 100', () => {
    expect(run().score).toBe(100);
    expect(run().coverage).toBe(1);
  });

  it('leaves points null — this engine weights by status, not bands', () => {
    for (const check of run().checks) {
      expect(check.points).toBeNull();
    }
  });

  it('excludes unknown checks from the score rather than failing them', () => {
    // Two unknowns: main image not recorded, and buy box not recorded.
    const result = run({
      mainImageWhiteBackground: 'unknown',
      buyBoxPercentage: null,
    });
    expect(result.score).toBe(100);
    expect(result.coverage).toBeCloseTo(
      (AMAZON_RULES.length - 2) / AMAZON_RULES.length,
    );
  });
});

describe('listing-status', () => {
  it('fails outright when suppressed', () => {
    expect(statusOf('listing-status', { status: 'suppressed' })).toBe('error');
    expect(
      find(run({ status: 'suppressed' }).checks, 'listing-status').severity,
    ).toBe('critical');
  });

  it('warns when inactive', () => {
    expect(statusOf('listing-status', { status: 'inactive' })).toBe('warning');
  });

  it('passes when active', () => {
    expect(statusOf('listing-status')).toBe('pass');
  });
});

describe('title rules', () => {
  it('fails an empty title and cannot assess its structure', () => {
    expect(statusOf('title-length', { title: '' })).toBe('error');
    expect(statusOf('title-structure', { title: '' })).toBe('unknown');
  });

  it('fails a title past the maximum', () => {
    expect(
      statusOf('title-length', { title: 'NorthTrail '.repeat(30) }),
    ).toBe('error');
  });

  it('warns on a title below the minimum', () => {
    expect(statusOf('title-length', { title: 'NorthTrail Tent' })).toBe(
      'warning',
    );
  });

  it('accepts a title exactly at each boundary', () => {
    const atMin = `NorthTrail ${'a'.repeat(DEFAULT_AMAZON_CONFIG.titleMin - 11)}`;
    expect(atMin).toHaveLength(DEFAULT_AMAZON_CONFIG.titleMin);
    expect(statusOf('title-length', { title: atMin })).toBe('pass');

    const atMax = `NorthTrail ${'a'.repeat(DEFAULT_AMAZON_CONFIG.titleMax - 11)}`;
    expect(atMax).toHaveLength(DEFAULT_AMAZON_CONFIG.titleMax);
    expect(statusOf('title-length', { title: atMax })).toBe('pass');
  });

  it('fails promotional filler in the title', () => {
    expect(
      statusOf('title-structure', {
        title: 'NorthTrail Test Item BEST SELLER with FREE SHIPPING for everyone',
      }),
    ).toBe('error');
  });

  it('warns when the title does not lead with the brand', () => {
    expect(
      statusOf('title-structure', {
        title: 'Freestanding Shelter for Two by NorthTrail, 4.2 lb Packed Weight',
      }),
    ).toBe('warning');
  });

  it('reads the brand from the product, so a rename is followed', () => {
    const renamed: Product = { ...PRODUCT, title: 'Summitry Test Item' };
    expect(statusOf('title-structure', {}, renamed)).toBe('warning');
    expect(
      statusOf('title-structure', { title: 'Summitry Test Item, 3-Season Shelter' }, renamed),
    ).toBe('pass');
  });
});

describe('bullet rules', () => {
  it('fails with no bullets and cannot assess their length', () => {
    expect(statusOf('bullets-count', { bullets: [] })).toBe('error');
    expect(statusOf('bullets-length', { bullets: [] })).toBe('unknown');
  });

  it('warns when fewer than five are used', () => {
    expect(statusOf('bullets-count', { bullets: [GOOD_BULLET] })).toBe('warning');
  });

  it('ignores blank bullets when counting', () => {
    expect(
      statusOf('bullets-count', {
        bullets: [GOOD_BULLET, '   ', GOOD_BULLET, '', GOOD_BULLET],
      }),
    ).toBe('warning');
  });

  it('warns on a bullet that is too short', () => {
    expect(
      statusOf('bullets-length', {
        bullets: [GOOD_BULLET, 'Two doors.', GOOD_BULLET, GOOD_BULLET, GOOD_BULLET],
      }),
    ).toBe('warning');
  });

  it('warns on a bullet that is too long', () => {
    expect(
      statusOf('bullets-length', {
        bullets: [
          'A'.repeat(DEFAULT_AMAZON_CONFIG.bulletMaxChars + 1),
          GOOD_BULLET,
          GOOD_BULLET,
          GOOD_BULLET,
          GOOD_BULLET,
        ],
      }),
    ).toBe('warning');
  });
});

describe('image rules', () => {
  it('fails with no images at all', () => {
    expect(statusOf('image-count', { imageCount: 0 })).toBe('error');
  });

  it('fails below the minimum and warns below the healthy count', () => {
    expect(statusOf('image-count', { imageCount: 2 })).toBe('error');
    expect(statusOf('image-count', { imageCount: 4 })).toBe('warning');
    expect(statusOf('image-count', { imageCount: 6 })).toBe('pass');
  });

  it('reports unknown main-image compliance rather than assuming it', () => {
    expect(
      statusOf('main-image-compliance', { mainImageWhiteBackground: 'unknown' }),
    ).toBe('unknown');
  });

  it('fails a non-compliant main image as critical', () => {
    const check = find(
      run({ mainImageWhiteBackground: 'no' }).checks,
      'main-image-compliance',
    );
    expect(check.status).toBe('error');
    expect(check.severity).toBe('critical');
  });
});

describe('A+ content', () => {
  it('cannot apply without brand registration', () => {
    expect(
      statusOf('aplus-content', { brandRegistered: false, aPlusModules: [] }),
    ).toBe('unknown');
  });

  it('fails a registered brand with no modules', () => {
    expect(
      statusOf('aplus-content', { brandRegistered: true, aPlusModules: [] }),
    ).toBe('error');
  });
});

describe('backend search terms', () => {
  it('fails when empty', () => {
    expect(statusOf('backend-search-terms', { backendSearchTerms: '' })).toBe(
      'error',
    );
  });

  it('fails past the byte limit even when the character count looks safe', () => {
    // 246 characters, 261 bytes: a character-based check would accept this.
    const value =
      'chaqueta impermeable montaña senderismo cortavientos montañismo excursión impermeável técnica respirável capucha ajustável costuras seladas à prova d água corta-vento montanhismo caminhada trilha leve señora niño pequeño árbol otoño verão inverno';
    expect(value.length).toBeLessThan(
      DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes,
    );
    expect(byteLength(value)).toBeGreaterThan(
      DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes,
    );
    expect(statusOf('backend-search-terms', { backendSearchTerms: value })).toBe(
      'error',
    );
  });

  it('passes exactly at the byte limit', () => {
    const value = 'a'.repeat(DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes);
    expect(byteLength(value)).toBe(
      DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes,
    );
    expect(statusOf('backend-search-terms', { backendSearchTerms: value })).toBe(
      'pass',
    );
  });

  it('warns when words are repeated within the field', () => {
    expect(
      statusOf('backend-search-terms', {
        backendSearchTerms:
          'shelter synonym shelter alternative phrasing misspelled variant another query people type',
      }),
    ).toBe('warning');
  });

  it('warns when words are already indexed from the title', () => {
    const check = find(
      run({
        backendSearchTerms:
          'freestanding vestibules synonym alternative phrasing misspelled variant another useful query',
      }).checks,
      'backend-search-terms',
    );
    expect(check.status).toBe('warning');
    expect(check.evidence).toContain('already in the title');
  });

  it('warns when the field is barely used', () => {
    expect(
      statusOf('backend-search-terms', { backendSearchTerms: 'tent shelter' }),
    ).toBe('warning');
  });
});

describe('browse node and variations', () => {
  it('fails with no browse node', () => {
    expect(statusOf('browse-node', { browseNode: null })).toBe('error');
    expect(statusOf('browse-node', { browseNode: '  ' })).toBe('error');
  });

  it('passes a standalone listing with no siblings', () => {
    expect(statusOf('variation-relationship', { expectedVariationSiblings: [] })).toBe(
      'pass',
    );
  });

  it('fails a standalone listing that has siblings', () => {
    expect(
      statusOf('variation-relationship', {
        expectedVariationSiblings: ['B0SIBLING1'],
        variationParentAsin: null,
      }),
    ).toBe('error');
  });

  it('passes once the family exists', () => {
    expect(
      statusOf('variation-relationship', {
        expectedVariationSiblings: ['B0SIBLING1'],
        variationParentAsin: 'B0PARENTAS',
      }),
    ).toBe('pass');
  });
});

describe('review health', () => {
  it('warns when there are no reviews', () => {
    expect(
      statusOf('review-health', { reviewCount: 0, averageRating: null }),
    ).toBe('warning');
  });

  it('refuses to conclude from a rating on too few reviews', () => {
    const check = find(
      run({ reviewCount: 6, averageRating: 3.5 }).checks,
      'review-health',
    );
    // A 3.5 is below the floor, but six reviews cannot support that verdict.
    expect(check.status).toBe('warning');
    expect(check.evidence).toContain('below minimum sample');
  });

  it('fails a low rating once the sample is large enough', () => {
    expect(statusOf('review-health', { reviewCount: 143, averageRating: 3.8 })).toBe(
      'error',
    );
  });

  it('passes at the rating floor exactly', () => {
    expect(statusOf('review-health', { reviewCount: 143, averageRating: 4 })).toBe(
      'pass',
    );
  });
});

describe('buy box', () => {
  it('reports unknown when not recorded', () => {
    expect(statusOf('buy-box', { buyBoxPercentage: null })).toBe('unknown');
  });

  it('fails below the floor and passes at it', () => {
    expect(statusOf('buy-box', { buyBoxPercentage: 0.62 })).toBe('error');
    expect(statusOf('buy-box', { buyBoxPercentage: 0.9 })).toBe('pass');
  });
});

describe('fingerprint', () => {
  it('changes when an audited field changes', () => {
    const base = listingFingerprint(listing(), PRODUCT);
    expect(listingFingerprint(listing({ title: 'Something else' }), PRODUCT)).not.toBe(
      base,
    );
    expect(listingFingerprint(listing({ imageCount: 9 }), PRODUCT)).not.toBe(base);
  });

  it('changes when the product name changes, because a rule reads it', () => {
    const base = listingFingerprint(listing(), PRODUCT);
    expect(
      listingFingerprint(listing(), { ...PRODUCT, title: 'Renamed Item' }),
    ).not.toBe(base);
  });

  it('does not change for a field no rule reads', () => {
    const base = listingFingerprint(listing(), PRODUCT);
    // Fulfilment is recorded but no rule grades it, so editing it must not
    // tell the user to redo an audit whose result cannot change.
    expect(listingFingerprint(listing({ fulfilment: 'FBM' }), PRODUCT)).toBe(base);
  });
});

describe('every rule carries its explanation', () => {
  it('gives each check a message, explanation and recommendation', () => {
    for (const check of run({ status: 'suppressed', bullets: [] }).checks) {
      expect(check.message.length, check.ruleId).toBeGreaterThan(5);
      expect(check.explanation.length, check.ruleId).toBeGreaterThan(20);
      expect(check.recommendation.length, check.ruleId).toBeGreaterThan(5);
    }
  });
});
