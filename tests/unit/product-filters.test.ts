import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  filterProducts,
  isQueryActive,
  normalizeSearch,
  sortProducts,
} from '@/domain/product-filters';
import { buildCatalogueProducts } from '@/fixtures/demo-catalogue';
import type { Product } from '@/domain/types';

const products = buildCatalogueProducts();

function titles(result: readonly Product[]): string[] {
  return result.map((product) => product.title);
}

describe('normalizeSearch', () => {
  it('lowercases, trims and collapses internal whitespace', () => {
    expect(normalizeSearch('  RIDGELINE   2P  ')).toBe('ridgeline 2p');
    expect(normalizeSearch('\tSleeping\nBag ')).toBe('sleeping bag');
    expect(normalizeSearch('   ')).toBe('');
  });
});

describe('filterProducts — search', () => {
  it('returns everything for an empty or whitespace-only term', () => {
    expect(filterProducts(products, EMPTY_QUERY)).toHaveLength(products.length);
    expect(
      filterProducts(products, { ...EMPTY_QUERY, search: '   ' }),
    ).toHaveLength(products.length);
  });

  it('is case-insensitive', () => {
    const lower = filterProducts(products, { ...EMPTY_QUERY, search: 'ridgeline' });
    const upper = filterProducts(products, { ...EMPTY_QUERY, search: 'RIDGELINE' });
    expect(titles(lower)).toEqual(titles(upper));
    expect(lower.length).toBeGreaterThan(1);
  });

  it('ignores surrounding and repeated whitespace', () => {
    const tidy = filterProducts(products, { ...EMPTY_QUERY, search: 'rain shell' });
    const messy = filterProducts(products, {
      ...EMPTY_QUERY,
      search: '  rain    shell ',
    });
    expect(titles(messy)).toEqual(titles(tidy));
    expect(tidy).toHaveLength(1);
  });

  it('matches SKU', () => {
    const result = filterProducts(products, { ...EMPTY_QUERY, search: 'NT-TENT' });
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every((product) => product.sku.startsWith('NT-TENT'))).toBe(true);
  });

  it('matches slug and primary keyword', () => {
    expect(
      filterProducts(products, { ...EMPTY_QUERY, search: 'down-sleeping-bag' }).length,
    ).toBeGreaterThan(0);
    expect(
      filterProducts(products, { ...EMPTY_QUERY, search: 'merino wool base layer' }),
    ).toHaveLength(1);
  });

  it('returns nothing for a term that matches no field', () => {
    expect(
      filterProducts(products, { ...EMPTY_QUERY, search: 'kayak paddle' }),
    ).toHaveLength(0);
  });
});

describe('filterProducts — combined filters', () => {
  it('treats an empty selection as no constraint', () => {
    expect(
      filterProducts(products, { search: '', categories: [], statuses: [] }),
    ).toHaveLength(products.length);
  });

  it('filters by category', () => {
    const result = filterProducts(products, {
      ...EMPTY_QUERY,
      categories: ['Lighting'],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((product) => product.category === 'Lighting')).toBe(true);
  });

  it('treats multiple categories as a union within the field', () => {
    const single = filterProducts(products, {
      ...EMPTY_QUERY,
      categories: ['Lighting'],
    });
    const pair = filterProducts(products, {
      ...EMPTY_QUERY,
      categories: ['Lighting', 'Cooking'],
    });
    expect(pair.length).toBeGreaterThan(single.length);
  });

  it('filters by status', () => {
    const drafts = filterProducts(products, {
      ...EMPTY_QUERY,
      statuses: ['draft'],
    });
    expect(drafts.every((product) => product.status === 'draft')).toBe(true);
    expect(drafts.length).toBe(1);
  });

  it('intersects search, category and status', () => {
    const result = filterProducts(products, {
      search: 'tent',
      categories: ['Tents & Shelters'],
      statuses: ['archived'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Trailhead 1P Tent');
  });

  it('returns nothing when the conditions cannot both hold', () => {
    expect(
      filterProducts(products, {
        search: 'headlamp',
        categories: ['Cooking'],
        statuses: [],
      }),
    ).toHaveLength(0);
  });
});

describe('isQueryActive', () => {
  it('is false only when nothing is set', () => {
    expect(isQueryActive(EMPTY_QUERY)).toBe(false);
    expect(isQueryActive({ ...EMPTY_QUERY, search: '  ' })).toBe(false);
    expect(isQueryActive({ ...EMPTY_QUERY, search: 'tent' })).toBe(true);
    expect(isQueryActive({ ...EMPTY_QUERY, categories: ['Cooking'] })).toBe(true);
    expect(isQueryActive({ ...EMPTY_QUERY, statuses: ['draft'] })).toBe(true);
  });
});

describe('sortProducts', () => {
  it('orders by category then title and does not mutate the input', () => {
    const input = buildCatalogueProducts();
    const snapshot = titles(input);
    const sorted = sortProducts(input);

    expect(titles(input)).toEqual(snapshot);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous === undefined || current === undefined) continue;
      const byCategory = previous.category.localeCompare(current.category);
      expect(byCategory <= 0).toBe(true);
      if (byCategory === 0) {
        expect(previous.title.localeCompare(current.title) <= 0).toBe(true);
      }
    }
  });
});
