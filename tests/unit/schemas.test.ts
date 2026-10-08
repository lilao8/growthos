import { describe, expect, it } from 'vitest';
import {
  pageSnapshotSchema,
  productSchema,
  sessionFactSchema,
} from '@/domain/schemas';
import type { PageSnapshot, Product, SessionFact } from '@/domain/types';

const validProduct: Product = {
  id: 'prd_test',
  sku: 'NT-TEST-1',
  slug: 'test-product',
  title: 'Test Product',
  category: 'Lighting',
  priceCents: 5900,
  costCents: 2100,
  inventory: 10,
  status: 'active',
  primaryKeyword: 'test lantern',
  metaTitle: 'Test Product',
  metaDescription: 'A test product.',
  productDescription: 'A test product description.',
};

const validSession: SessionFact = {
  sessionId: 'ses_1',
  userId: 'usr_1',
  date: '2026-08-31',
  channel: 'Organic Search',
  source: 'google',
  landingPageId: 'snap_ridgeline_2p_tent',
  stages: ['session', 'product_view', 'add_to_cart'],
  viewedProductIds: ['prd_ridgeline_2p_tent'],
  orderId: null,
};

describe('productSchema', () => {
  it('accepts a valid product', () => {
    expect(productSchema.safeParse(validProduct).success).toBe(true);
  });

  it('rejects fractional money', () => {
    const result = productSchema.safeParse({ ...validProduct, priceCents: 59.5 });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed slug', () => {
    for (const slug of ['Test Product', 'test--product', '-test', 'test-']) {
      expect(productSchema.safeParse({ ...validProduct, slug }).success).toBe(
        false,
      );
    }
  });

  it('accepts a slug of any number of hyphenated words', () => {
    // The pattern repeats its hyphenated group, and only a slug past two
    // words proves it: dropping the repetition still accepts `a-b`, which is
    // what every rejection case above and the fixture happen to be. Mutation
    // testing found the quantifier removable with the suite still green.
    for (const slug of [
      'tent',
      'ridgeline-2p',
      'ridgeline-2p-backpacking-tent',
      'a-b-c-d-e-f',
    ]) {
      expect(
        productSchema.safeParse({ ...validProduct, slug }).success,
        slug,
      ).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    const result = productSchema.safeParse({
      ...validProduct,
      category: 'Kitchen Sinks',
    });
    expect(result.success).toBe(false);
  });
});

describe('sessionFactSchema', () => {
  it('accepts an ordered stage prefix', () => {
    expect(sessionFactSchema.safeParse(validSession).success).toBe(true);
  });

  it('rejects a sequence that skips a stage', () => {
    const result = sessionFactSchema.safeParse({
      ...validSession,
      stages: ['session', 'add_to_cart'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-order stages', () => {
    const result = sessionFactSchema.safeParse({
      ...validSession,
      stages: ['session', 'add_to_cart', 'product_view'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid calendar date', () => {
    const result = sessionFactSchema.safeParse({
      ...validSession,
      date: '2026-02-30',
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Page snapshots are audit input read back from storage.
 *
 * Seven of the nine exported schemas had no unit test at all; this covers the
 * one whose image rule mutation testing showed to be unguarded — `min(1)` on
 * an image src could be changed to `max(1)` with the suite still green.
 */
describe('pageSnapshotSchema', () => {
  const validSnapshot: PageSnapshot = {
    id: 'snap_test',
    productId: 'prd_test',
    url: 'https://northtrail.example.com/products/test',
    metaTitle: 'Test',
    metaDescription: 'A test page.',
    h1: 'Test',
    headings: [{ level: 1, text: 'Test' }],
    bodyText: 'Body copy.',
    images: [{ src: '/img/test.jpg', alt: 'A test image', decorative: false }],
    internalLinks: [{ href: '/collections/test', anchorText: 'All tests' }],
    canonical: 'https://northtrail.example.com/products/test',
    indexability: 'index',
    structuredData: [],
    directAnswer: null,
    faq: [],
    facts: [],
    evidence: [],
    originalityClaim: null,
    capturedAt: '2026-08-31',
  };

  it('accepts a well-formed snapshot', () => {
    expect(pageSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it('rejects an image with an empty src', () => {
    // An image with no source is not a real image, and the audit counts it
    // when scoring alt-text coverage.
    const result = pageSnapshotSchema.safeParse({
      ...validSnapshot,
      images: [{ src: '', alt: 'Still has alt text', decorative: false }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an image src far longer than one character', () => {
    // The guard is a minimum, not a maximum; a long CDN path is ordinary.
    const result = pageSnapshotSchema.safeParse({
      ...validSnapshot,
      images: [
        {
          src: '/img/products/ridgeline-2p-backpacking-tent-pitched-at-dawn.jpg',
          alt: 'The tent pitched',
          decorative: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a snapshot with no images rather than demanding one', () => {
    expect(
      pageSnapshotSchema.safeParse({ ...validSnapshot, images: [] }).success,
    ).toBe(true);
  });

  it('rejects an unknown indexability state', () => {
    const result = pageSnapshotSchema.safeParse({
      ...validSnapshot,
      indexability: 'maybe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a capturedAt that is not a UTC calendar date', () => {
    for (const capturedAt of ['2026-13-01', '2026-02-30', '31-08-2026', '']) {
      expect(
        pageSnapshotSchema.safeParse({ ...validSnapshot, capturedAt }).success,
        capturedAt,
      ).toBe(false);
    }
  });
});
