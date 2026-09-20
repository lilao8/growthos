import { DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import {
  computeProductMetrics,
  emptyProductMetrics,
  type ProductMetrics,
} from '@/domain/product-metrics';
import {
  EMPTY_QUERY,
  filterProducts,
  isQueryActive,
  sortProducts,
  type ProductQuery,
} from '@/domain/product-filters';
import {
  applySeoEdit,
  syncSnapshotWithSeoEdit,
  validateSeoEdit,
  type FieldErrors,
} from '@/domain/product-seo';
import type { AuditResult, PageSnapshot, Product } from '@/domain/types';
import { readAudit } from '@/domain/audit-lookup';
import type { DemoState, DemoStateRepository } from '@/repositories/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';

/**
 * Product service: composes the editable catalogue (state repository) with the
 * read-only traffic facts (traffic repository), applies the pure query and
 * validation rules, and classifies the outcome for the UI.
 */

export interface ProductServiceDeps {
  state: DemoStateRepository;
  traffic: TrafficRepository;
  window?: DateWindow;
}

/**
 * A catalogue row. A score is null until an audit has actually been run for
 * that page — "Not audited" is the honest display, and inventing a number
 * would be worse. `geoScore` stays null until Dispatch 4.
 */
export interface ProductRow {
  product: Product;
  metrics: ProductMetrics;
  seoScore: number | null;
  geoScore: number | null;
  /** Set when the page has been audited but the content has changed since. */
  seoStale: boolean;
  seoAudit: AuditResult | null;
}

export type ProductListState =
  | {
      status: 'ready';
      rows: ProductRow[];
      totalCount: number;
      queryActive: boolean;
    }
  | {
      status: 'empty';
      rows: [];
      totalCount: number;
      queryActive: boolean;
    }
  | { status: 'error'; message: string };

export type ProductDetailState =
  | {
      status: 'ready';
      row: ProductRow;
      snapshot: PageSnapshot | null;
    }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export type SaveSeoResult =
  | { status: 'saved'; product: Product }
  | { status: 'invalid'; errors: FieldErrors }
  | { status: 'error'; message: string };

interface LoadedData {
  state: DemoState;
  metrics: Map<string, ProductMetrics>;
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

async function loadData(deps: ProductServiceDeps): Promise<LoadedData> {
  const window = deps.window ?? DEMO_WINDOW;
  const [stateResult, traffic] = await Promise.all([
    deps.state.load(),
    deps.traffic.load(),
  ]);

  return {
    state: stateResult.state,
    metrics: computeProductMetrics(
      traffic.sessions,
      traffic.orders,
      traffic.orderItems,
      window,
    ),
  };
}

function toRow(product: Product, data: LoadedData): ProductRow {
  const snapshot = data.state.pageSnapshots.find(
    (candidate) => candidate.productId === product.id,
  );
  const audit =
    snapshot === undefined
      ? null
      : readAudit(
          data.state.auditResults,
          snapshot,
          product.primaryKeyword,
          'seo',
        );

  return {
    product,
    metrics: data.metrics.get(product.id) ?? emptyProductMetrics(product.id),
    // A score exists only where an audit has been run against this page.
    seoScore: audit?.score ?? null,
    seoStale: audit?.stale ?? false,
    seoAudit: audit,
    // Filled in by Dispatch 4.
    geoScore: null,
  };
}

export async function loadProductList(
  deps: ProductServiceDeps,
  query: ProductQuery = EMPTY_QUERY,
): Promise<ProductListState> {
  let data: LoadedData;
  try {
    data = await loadData(deps);
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load the product catalogue.'),
    };
  }

  const queryActive = isQueryActive(query);
  const totalCount = data.state.products.length;
  const matched = sortProducts(filterProducts(data.state.products, query));

  if (matched.length === 0) {
    return { status: 'empty', rows: [], totalCount, queryActive };
  }

  return {
    status: 'ready',
    rows: matched.map((product) => toRow(product, data)),
    totalCount,
    queryActive,
  };
}

export async function loadProductDetail(
  deps: ProductServiceDeps,
  productId: string,
): Promise<ProductDetailState> {
  let data: LoadedData;
  try {
    data = await loadData(deps);
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load this product.'),
    };
  }

  const product = data.state.products.find(
    (candidate) => candidate.id === productId || candidate.slug === productId,
  );
  if (product === undefined) return { status: 'not-found' };

  return {
    status: 'ready',
    row: toRow(product, data),
    snapshot:
      data.state.pageSnapshots.find(
        (snapshot) => snapshot.productId === product.id,
      ) ?? null,
  };
}

/**
 * Validates first, then writes. An invalid edit never reaches storage, and a
 * storage failure leaves the persisted catalogue untouched — in both cases the
 * caller keeps the user's typed input so nothing has to be retyped.
 */
export async function saveProductSeo(
  deps: ProductServiceDeps,
  productId: string,
  input: unknown,
): Promise<SaveSeoResult> {
  const validation = validateSeoEdit(input);
  if (!validation.ok) {
    return { status: 'invalid', errors: validation.errors };
  }

  let current: DemoState;
  try {
    current = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved catalogue.'),
    };
  }

  const existing = current.products.find((product) => product.id === productId);
  if (existing === undefined) {
    return { status: 'error', message: 'That product no longer exists.' };
  }

  const updated = applySeoEdit(existing, validation.value);
  const next: DemoState = {
    ...current,
    products: current.products.map((product) =>
      product.id === productId ? updated : product,
    ),
    // Keeping the snapshot in step is what makes a later audit grade the
    // metadata the store actually uses.
    pageSnapshots: current.pageSnapshots.map((snapshot) =>
      snapshot.productId === productId
        ? syncSnapshotWithSeoEdit(snapshot, validation.value)
        : snapshot,
    ),
  };

  try {
    await deps.state.save(next);
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save your changes.'),
    };
  }

  return { status: 'saved', product: updated };
}
