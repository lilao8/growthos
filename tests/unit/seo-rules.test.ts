import { describe, expect, it } from 'vitest';
import { runSeoAudit } from '@/domain/seo-audit/engine';
import { DEFAULT_SEO_CONFIG, SEO_RULE_IDS } from '@/domain/seo-audit/config';
import type { AuditCheck, PageSnapshot } from '@/domain/types';

const NOW = '2026-08-31T00:00:00.000Z';
const URL = 'https://northtrail.example.com/products/ridgeline-2p-tent';

/** A snapshot that passes every rule, used as the baseline to perturb. */
function completeSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: 'snap_test',
    productId: 'prd_test',
    url: URL,
    metaTitle: 'Ridgeline 2 Person Backpacking Tent | NorthTrail',
    metaDescription:
      'A 3.9 lb freestanding two-person tent with a full-coverage rainfly, built for three-season backcountry trips.',
    h1: 'Ridgeline 2 Person Backpacking Tent',
    headings: [
      { level: 1, text: 'Ridgeline 2 Person Backpacking Tent' },
      { level: 2, text: 'Specifications' },
    ],
    bodyText:
      'The Ridgeline 2P is a freestanding 2 person backpacking tent weighing 3.9 lb packed.',
    images: [
      { src: '/a.jpg', alt: 'Tent pitched on a ridge', decorative: false },
      { src: '/divider.svg', alt: '', decorative: true },
    ],
    internalLinks: [
      { href: '/collections/tents', anchorText: 'All tents' },
      { href: '/guides/tents', anchorText: 'How to choose a tent' },
    ],
    canonical: URL,
    indexability: 'index',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Ridgeline 2 Person Backpacking Tent',
        sku: 'NT-TENT-RDG2',
        offers: {
          '@type': 'Offer',
          price: '329.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
    directAnswer: null,
    faq: [],
    facts: [],
    evidence: [],
    originalityClaim: null,
    capturedAt: '2026-08-31',
    ...overrides,
  };
}

function audit(
  overrides: Partial<PageSnapshot> = {},
  keyword = '2 person backpacking tent',
) {
  return runSeoAudit({
    snapshot: completeSnapshot(overrides),
    primaryKeyword: keyword,
    now: NOW,
  });
}

function checkFor(checks: readonly AuditCheck[], ruleId: string): AuditCheck {
  const found = checks.find((item) => item.ruleId === ruleId);
  if (found === undefined) throw new Error(`No check for ${ruleId}`);
  return found;
}

describe('rule coverage', () => {
  it('runs every configured rule exactly once', () => {
    const result = audit();
    expect(result.checks).toHaveLength(SEO_RULE_IDS.length);
    expect(result.checks.map((item) => item.ruleId)).toEqual([
      ...SEO_RULE_IDS,
    ]);
  });

  it('gives every check a message, explanation and recommendation', () => {
    for (const item of audit().checks) {
      expect(item.message.length).toBeGreaterThan(0);
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(item.recommendation.length).toBeGreaterThan(0);
    }
  });

  it('scores a fully compliant page 100', () => {
    const result = audit();
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(1);
    expect(result.checks.every((item) => item.status === 'pass')).toBe(true);
  });
});

describe('meta title', () => {
  it('flags a missing title as an error and cannot assess its length', () => {
    const { checks } = audit({ metaTitle: null });
    expect(checkFor(checks, 'meta-title-present').status).toBe('error');
    expect(checkFor(checks, 'meta-title-present').severity).toBe('critical');
    expect(checkFor(checks, 'meta-title-length').status).toBe('unknown');
  });

  it('treats an empty string the same as absent', () => {
    expect(
      checkFor(audit({ metaTitle: '   ' }).checks, 'meta-title-present').status,
    ).toBe('error');
  });

  it('warns when the title is too long', () => {
    const check = checkFor(
      audit({ metaTitle: 'x'.repeat(DEFAULT_SEO_CONFIG.titleMax + 1) }).checks,
      'meta-title-length',
    );
    expect(check.status).toBe('warning');
    expect(check.evidence).toContain(String(DEFAULT_SEO_CONFIG.titleMax + 1));
  });

  it('warns when the title is too short', () => {
    expect(
      checkFor(audit({ metaTitle: 'Tent' }).checks, 'meta-title-length').status,
    ).toBe('warning');
  });

  it('passes exactly at both length boundaries', () => {
    const min = 'x'.repeat(DEFAULT_SEO_CONFIG.titleMin);
    const max = 'x'.repeat(DEFAULT_SEO_CONFIG.titleMax);
    expect(
      checkFor(audit({ metaTitle: min }).checks, 'meta-title-length').status,
    ).toBe('pass');
    expect(
      checkFor(audit({ metaTitle: max }).checks, 'meta-title-length').status,
    ).toBe('pass');
  });
});

describe('meta description', () => {
  it('flags a missing description as an error', () => {
    const { checks } = audit({ metaDescription: null });
    expect(checkFor(checks, 'meta-description-present').status).toBe('error');
    expect(checkFor(checks, 'meta-description-length').status).toBe('unknown');
  });

  it('passes at both length boundaries', () => {
    const min = 'x'.repeat(DEFAULT_SEO_CONFIG.descriptionMin);
    const max = 'x'.repeat(DEFAULT_SEO_CONFIG.descriptionMax);
    expect(
      checkFor(audit({ metaDescription: min }).checks, 'meta-description-length')
        .status,
    ).toBe('pass');
    expect(
      checkFor(audit({ metaDescription: max }).checks, 'meta-description-length')
        .status,
    ).toBe('pass');
  });
});

describe('h1', () => {
  it('errors when there is no H1', () => {
    const check = checkFor(
      audit({ h1: null, headings: [{ level: 2, text: 'Specs' }] }).checks,
      'h1',
    );
    expect(check.status).toBe('error');
    expect(check.severity).toBe('critical');
  });

  it('errors when there is more than one H1', () => {
    const check = checkFor(
      audit({
        headings: [
          { level: 1, text: 'First' },
          { level: 1, text: 'Second' },
        ],
      }).checks,
      'h1',
    );
    expect(check.status).toBe('error');
    expect(check.evidence).toBe('First | Second');
  });
});

describe('url slug', () => {
  it('errors on an uppercase or underscored slug', () => {
    for (const url of [
      'https://example.com/products/Ridgeline_2P',
      'https://example.com/products/Ridgeline-2P',
    ]) {
      expect(checkFor(audit({ url }).checks, 'url-slug').status).toBe('error');
    }
  });

  it('warns on an overlong slug', () => {
    const check = checkFor(
      audit({
        url: 'https://example.com/products/the-very-best-two-person-lightweight-backpacking-tent-for-every-trail',
      }).checks,
      'url-slug',
    );
    expect(check.status).toBe('warning');
  });

  it('cannot assess a URL it fails to parse', () => {
    expect(checkFor(audit({ url: 'not a url' }).checks, 'url-slug').status).toBe(
      'unknown',
    );
  });
});

describe('canonical', () => {
  it('errors when absent', () => {
    expect(checkFor(audit({ canonical: null }).checks, 'canonical').status).toBe(
      'error',
    );
  });

  it('errors when unparseable', () => {
    expect(
      checkFor(audit({ canonical: '/relative/path' }).checks, 'canonical').status,
    ).toBe('error');
  });

  it('warns when it points at another page', () => {
    const check = checkFor(
      audit({ canonical: 'https://northtrail.example.com/collections/tents' })
        .checks,
      'canonical',
    );
    expect(check.status).toBe('warning');
    expect(check.severity).toBe('high');
  });

  it('accepts a self-canonical with a trailing slash difference', () => {
    expect(
      checkFor(audit({ canonical: `${URL}/` }).checks, 'canonical').status,
    ).toBe('pass');
  });
});

describe('image alt', () => {
  it('errors when a content image has no alt attribute', () => {
    const check = checkFor(
      audit({ images: [{ src: '/a.jpg', alt: null, decorative: false }] }).checks,
      'image-alt',
    );
    expect(check.status).toBe('error');
    expect(check.evidence).toBe('/a.jpg');
  });

  it('warns on an empty alt for a content image', () => {
    expect(
      checkFor(
        audit({ images: [{ src: '/a.jpg', alt: '', decorative: false }] }).checks,
        'image-alt',
      ).status,
    ).toBe('warning');
  });

  it('allows a decorative image to have an empty alt', () => {
    const check = checkFor(
      audit({
        images: [
          { src: '/a.jpg', alt: 'A tent', decorative: false },
          { src: '/line.svg', alt: '', decorative: true },
        ],
      }).checks,
      'image-alt',
    );
    expect(check.status).toBe('pass');
  });

  it('cannot assess a page with no content images', () => {
    expect(
      checkFor(audit({ images: [] }).checks, 'image-alt').status,
    ).toBe('unknown');
  });
});

describe('internal links', () => {
  it('errors with no internal links', () => {
    expect(
      checkFor(audit({ internalLinks: [] }).checks, 'internal-links').status,
    ).toBe('error');
  });

  it('warns on generic anchor text', () => {
    const check = checkFor(
      audit({
        internalLinks: [
          { href: '/a', anchorText: 'Click here' },
          { href: '/b', anchorText: 'All tents' },
        ],
      }).checks,
      'internal-links',
    );
    expect(check.status).toBe('warning');
    expect(check.evidence).toContain('/a');
  });

  it('warns on a single link even when well labelled', () => {
    expect(
      checkFor(
        audit({
          internalLinks: [{ href: '/collections/tents', anchorText: 'All tents' }],
        }).checks,
        'internal-links',
      ).status,
    ).toBe('warning');
  });
});

describe('structured data', () => {
  it('errors when there is none', () => {
    expect(
      checkFor(audit({ structuredData: [] }).checks, 'structured-data').status,
    ).toBe('error');
  });

  it('errors when nothing is of type Product', () => {
    const check = checkFor(
      audit({
        structuredData: [{ '@context': 'https://schema.org', '@type': 'Article' }],
      }).checks,
      'structured-data',
    );
    expect(check.status).toBe('error');
    expect(check.message).toContain('no Product entry');
  });

  it('validates required fields rather than mere presence', () => {
    const check = checkFor(
      audit({
        structuredData: [
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'A tent',
            offers: { '@type': 'Offer', price: '329.00' },
          },
        ],
      }).checks,
      'structured-data',
    );
    expect(check.status).toBe('error');
    expect(check.message).toContain('offers.priceCurrency');
  });

  it('warns when only recommended fields are missing', () => {
    const check = checkFor(
      audit({
        structuredData: [
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'A tent',
            offers: { price: '329.00', priceCurrency: 'USD' },
          },
        ],
      }).checks,
      'structured-data',
    );
    expect(check.status).toBe('warning');
    expect(check.message).toContain('sku');
  });

  it('rejects a non-object entry without throwing', () => {
    expect(
      checkFor(audit({ structuredData: [null, 'text', 42] }).checks, 'structured-data')
        .status,
    ).toBe('error');
  });
});

describe('indexability', () => {
  it('passes an indexable page', () => {
    expect(checkFor(audit().checks, 'indexability').status).toBe('pass');
  });

  it('warns on noindex and does not propose changing it automatically', () => {
    const check = checkFor(
      audit({ indexability: 'noindex' }).checks,
      'indexability',
    );
    expect(check.status).toBe('warning');
    expect(check.recommendation).toContain('will not change it for you');
  });

  it('treats an uncaptured robots directive as unknown, never as a pass', () => {
    const check = checkFor(
      audit({ indexability: 'unknown' }).checks,
      'indexability',
    );
    expect(check.status).toBe('unknown');
  });
});

describe('keyword usage', () => {
  it('cannot assess a product with no keyword', () => {
    expect(checkFor(audit({}, '').checks, 'keyword-usage').status).toBe('unknown');
  });

  it('errors when the keyword words appear nowhere', () => {
    const check = checkFor(audit({}, 'inflatable kayak').checks, 'keyword-usage');
    expect(check.status).toBe('error');
    expect(check.evidence).toContain('never appears verbatim');
  });

  it('warns when the keyword is verbatim only in the content, not the title', () => {
    const check = checkFor(
      audit(
        {
          metaTitle: 'A shelter for two people, tested over fourteen nights out',
          h1: 'A shelter for two',
          url: 'https://northtrail.example.com/products/shelter-for-two',
          bodyText: 'This is a 2 person backpacking tent.',
        },
        '2 person backpacking tent',
      ).checks,
      'keyword-usage',
    );
    expect(check.status).toBe('warning');
    expect(check.message).toContain('content');
  });

  it('warns — not errors — when the page uses the words but not the phrase', () => {
    // "2P" is not the phrase "2 person", but the page is plainly about it.
    const check = checkFor(
      audit(
        {
          metaTitle: 'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
          h1: 'Ridgeline 2P Backpacking Tent',
          headings: [{ level: 1, text: 'Ridgeline 2P Backpacking Tent' }],
          bodyText:
            'A freestanding two-person backpacking tent for three-season use.',
        },
        '2 person backpacking tent',
      ).checks,
      'keyword-usage',
    );
    expect(check.status).toBe('warning');
    expect(check.message).toContain('never the phrase itself');
  });

  it('counts FAQ answers and spec values as page content', () => {
    const check = checkFor(
      audit(
        {
          metaTitle: 'Alpine Base Layer for cold-weather hiking and travel',
          h1: 'Alpine Base Layer',
          bodyText: 'Comfortable across a wide range of temperatures.',
          url: 'https://northtrail.example.com/products/alpine-base-layer',
          facts: [{ label: 'Material', value: '100% merino wool' }],
        },
        'merino wool base layer',
      ).checks,
      'keyword-usage',
    );
    // 'merino' and 'wool' come from the spec table, 'base'/'layer' from the title.
    expect(check.status).toBe('warning');
    expect(check.evidence).toContain('content');
  });

  it('is case and whitespace insensitive', () => {
    expect(
      checkFor(audit({}, '  2 PERSON   backpacking Tent ').checks, 'keyword-usage')
        .status,
    ).toBe('pass');
  });

  it('states that using a keyword is not the same as being relevant', () => {
    expect(
      checkFor(audit().checks, 'keyword-usage').recommendation,
    ).toContain('not the same as being relevant');
  });
});

describe('determinism', () => {
  it('produces an identical result for identical input', () => {
    expect(JSON.stringify(audit())).toBe(JSON.stringify(audit()));
  });

  it('produces the same fingerprint for identical input', () => {
    expect(audit().inputFingerprint).toBe(audit().inputFingerprint);
  });

  it('changes the fingerprint when the content changes', () => {
    expect(audit().inputFingerprint).not.toBe(
      audit({ metaTitle: 'Something else entirely, long enough to count' })
        .inputFingerprint,
    );
  });

  it('changes the fingerprint when only the keyword changes', () => {
    expect(audit({}, 'tent').inputFingerprint).not.toBe(
      audit({}, 'backpacking tent').inputFingerprint,
    );
  });
});
