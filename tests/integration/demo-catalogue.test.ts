import { describe, expect, it } from 'vitest';
import {
  buildCatalogueProducts,
  buildCatalogueSnapshots,
  catalogueDemandWeights,
  snapshotIdFor,
} from '@/fixtures/demo-catalogue';
import { pageSnapshotSchema, productSchema } from '@/domain/schemas';

/**
 * The catalogue is the project's factual base for products and for every audit
 * that follows, so its business coherence is checked rather than assumed.
 */

const products = buildCatalogueProducts();
const snapshots = buildCatalogueSnapshots();

describe('catalogue shape', () => {
  it('has at least 15 SKUs', () => {
    expect(products.length).toBeGreaterThanOrEqual(15);
  });

  it('every product passes the domain schema', () => {
    for (const product of products) {
      const result = productSchema.safeParse(product);
      if (!result.success) {
        throw new Error(`Invalid product ${product.sku}: ${result.error.message}`);
      }
    }
  });

  it('SKUs, slugs and ids are unique', () => {
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
  });

  it('covers several categories and all three statuses', () => {
    expect(new Set(products.map((p) => p.category)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(products.map((p) => p.status))).toEqual(
      new Set(['active', 'draft', 'archived']),
    );
  });

  it('has at least 15 sellable active SKUs', () => {
    expect(
      products.filter((product) => product.status === 'active').length,
    ).toBeGreaterThanOrEqual(15);
  });
});

describe('business coherence', () => {
  it('prices every product above cost with a plausible retail margin', () => {
    for (const product of products) {
      expect(product.priceCents).toBeGreaterThan(product.costCents);
      const margin =
        (product.priceCents - product.costCents) / product.priceCents;
      expect(margin).toBeGreaterThan(0.45);
      expect(margin).toBeLessThan(0.75);
    }
  });

  it('keeps unavailable products out of stock', () => {
    for (const product of products) {
      if (product.status === 'active') continue;
      expect(product.inventory).toBe(0);
    }
  });

  it('stocks cheap items more deeply than expensive ones on average', () => {
    const active = products.filter((product) => product.status === 'active');
    const cheap = active.filter((product) => product.priceCents < 10_000);
    const dear = active.filter((product) => product.priceCents >= 25_000);
    const mean = (list: typeof active): number =>
      list.reduce((sum, product) => sum + product.inventory, 0) / list.length;

    expect(cheap.length).toBeGreaterThan(0);
    expect(dear.length).toBeGreaterThan(0);
    expect(mean(cheap)).toBeGreaterThan(mean(dear));
  });

  it('gives every published product a keyword that relates to its title', () => {
    for (const product of products) {
      if (product.status !== 'active') continue;
      expect(product.primaryKeyword.length).toBeGreaterThan(0);

      const words = product.primaryKeyword
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 3);
      const haystack =
        `${product.title} ${product.productDescription} ${product.category}`.toLowerCase();
      const overlap = words.filter((word) => haystack.includes(word));
      expect(
        overlap.length,
        `keyword "${product.primaryKeyword}" is unrelated to ${product.title}`,
      ).toBeGreaterThan(0);
    }
  });

  it('assigns every product a positive demand weight', () => {
    const weights = catalogueDemandWeights();
    expect(weights.length).toBe(products.length);
    for (const { weight } of weights) {
      expect(weight).toBeGreaterThan(0);
    }
  });
});

describe('page snapshots', () => {
  it('gives every product exactly one snapshot with a derived id', () => {
    expect(snapshots.length).toBe(products.length);
    for (const product of products) {
      const snapshot = snapshots.find((s) => s.productId === product.id);
      expect(snapshot).toBeDefined();
      expect(snapshot?.id).toBe(snapshotIdFor(product.id));
    }
  });

  it('every snapshot passes the domain schema', () => {
    for (const snapshot of snapshots) {
      const result = pageSnapshotSchema.safeParse(snapshot);
      if (!result.success) {
        throw new Error(`Invalid snapshot ${snapshot.id}: ${result.error.message}`);
      }
    }
  });

  it('builds each URL from the product slug', () => {
    for (const product of products) {
      const snapshot = snapshots.find((s) => s.productId === product.id);
      expect(snapshot?.url).toContain(`/products/${product.slug}`);
    }
  });

  it('mirrors product metadata onto the snapshot unless deliberately different', () => {
    const tent = snapshots.find((s) => s.productId === 'prd_ridgeline_2p_tent');
    const product = products.find((p) => p.id === 'prd_ridgeline_2p_tent');
    expect(tent?.metaTitle).toBe(product?.metaTitle);
    expect(tent?.metaDescription).toBe(product?.metaDescription);
  });

  it('includes authored quality gaps for the audit engines to find', () => {
    // These are deliberate: an audit with only perfect input proves nothing.
    expect(snapshots.some((s) => s.h1 === null)).toBe(true);
    expect(snapshots.some((s) => s.canonical === null)).toBe(true);
    expect(snapshots.some((s) => s.indexability === 'unknown')).toBe(true);
    expect(snapshots.some((s) => s.indexability === 'noindex')).toBe(true);
    expect(
      snapshots.some((s) =>
        s.images.some((image) => image.alt === null && !image.decorative),
      ),
    ).toBe(true);
    expect(snapshots.some((s) => s.internalLinks.length === 0)).toBe(true);
    expect(snapshots.some((s) => s.structuredData.length === 0)).toBe(true);
    expect(snapshots.some((s) => s.faq.length === 0)).toBe(true);
    expect(snapshots.some((s) => s.directAnswer === null)).toBe(true);
    expect(
      snapshots.some((s) => s.canonical !== null && !s.canonical.includes(s.url)),
    ).toBe(true);
  });

  it('also includes complete pages, so the audit can award a pass', () => {
    const complete = snapshots.filter(
      (s) =>
        s.h1 !== null &&
        s.canonical === s.url &&
        s.indexability === 'index' &&
        s.faq.length > 0 &&
        s.facts.length >= 3 &&
        s.directAnswer !== null &&
        s.structuredData.length > 0 &&
        s.internalLinks.length > 0,
    );
    expect(complete.length).toBeGreaterThanOrEqual(4);
  });

  it('marks decorative images as decorative so an empty alt is not a defect', () => {
    const decorative = snapshots
      .flatMap((s) => s.images)
      .filter((image) => image.decorative);
    expect(decorative.length).toBeGreaterThan(0);
    for (const image of decorative) {
      expect(image.alt).toBe('');
    }
  });

  it('is deterministic across builds', () => {
    expect(JSON.stringify(buildCatalogueSnapshots())).toBe(
      JSON.stringify(buildCatalogueSnapshots()),
    );
  });
});
