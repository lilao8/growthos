import type { Product, ProductCategory, ProductStatus } from './types';

/**
 * Catalogue search and filtering — pure, so the rules are testable without a
 * browser and identical wherever they are applied.
 *
 * Search matches the fields an operator would actually type: title, SKU, slug
 * and primary keyword. Matching is case-insensitive, trims surrounding
 * whitespace, and treats internal runs of whitespace as single spaces, so
 * "  RIDGELINE   2p " finds "Ridgeline 2P".
 *
 * Filters combine as an intersection: a product must satisfy the search term
 * AND a selected category AND a selected status. An empty selection means "no
 * constraint on this field", not "match nothing".
 */

export interface ProductQuery {
  search: string;
  categories: readonly ProductCategory[];
  statuses: readonly ProductStatus[];
}

export const EMPTY_QUERY: ProductQuery = {
  search: '',
  categories: [],
  statuses: [],
};

export function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isQueryActive(query: ProductQuery): boolean {
  return (
    normalizeSearch(query.search) !== '' ||
    query.categories.length > 0 ||
    query.statuses.length > 0
  );
}

function matchesSearch(product: Product, normalized: string): boolean {
  if (normalized === '') return true;
  const haystack = [
    product.title,
    product.sku,
    product.slug,
    product.primaryKeyword,
  ]
    .map((field) => normalizeSearch(field))
    .join(' | ');
  return haystack.includes(normalized);
}

export function filterProducts(
  products: readonly Product[],
  query: ProductQuery,
): Product[] {
  const normalized = normalizeSearch(query.search);
  return products.filter((product) => {
    if (!matchesSearch(product, normalized)) return false;
    if (
      query.categories.length > 0 &&
      !query.categories.includes(product.category)
    ) {
      return false;
    }
    if (query.statuses.length > 0 && !query.statuses.includes(product.status)) {
      return false;
    }
    return true;
  });
}

/** Stable ordering for the catalogue table: category, then title. */
export function sortProducts(products: readonly Product[]): Product[] {
  return [...products].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
  );
}
