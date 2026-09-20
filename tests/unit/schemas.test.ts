import { describe, expect, it } from 'vitest';
import { productSchema, sessionFactSchema } from '@/domain/schemas';
import type { Product, SessionFact } from '@/domain/types';

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
