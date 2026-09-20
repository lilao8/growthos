import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadProductDetail,
  loadProductList,
  saveProductSeo,
  type ProductServiceDeps,
} from '@/services/product-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import {
  createFailingStateRepository,
  createMemoryStateRepository,
} from '@/repositories/memory-state-repository';
import {
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
} from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { EMPTY_QUERY } from '@/domain/product-filters';

/**
 * Product service against real adapters: the browser adapter for persistence,
 * the fixture adapter for traffic.
 */

const NAMESPACE = 'growthos.test.products';

function deps(overrides: Partial<ProductServiceDeps> = {}): ProductServiceDeps {
  return {
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    traffic: createFixtureTrafficRepository(),
    ...overrides,
  };
}

const VALID_EDIT = {
  primaryKeyword: 'two person tent',
  metaTitle: 'Ridgeline 2P — Two Person Backpacking Tent | NorthTrail',
  metaDescription:
    'A freestanding two-person backpacking tent at 3.9 lb, with a 1800 mm fly and two vestibules for three-season trips.',
};

beforeEach(() => {
  localStorage.clear();
});

describe('loadProductList', () => {
  it('returns the whole catalogue with at least 15 SKUs', async () => {
    const state = await loadProductList(deps());

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.rows.length).toBeGreaterThanOrEqual(15);
    expect(state.totalCount).toBe(state.rows.length);
    expect(state.queryActive).toBe(false);
  });

  it('never exposes a score before an audit has run', async () => {
    const state = await loadProductList(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.rows) {
      expect(row.seoScore).toBeNull();
      expect(row.geoScore).toBeNull();
    }
  });

  it('attaches derived metrics from the traffic fixture', async () => {
    const state = await loadProductList(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const active = state.rows.filter((row) => row.product.status === 'active');
    expect(active.some((row) => row.metrics.viewSessions > 0)).toBe(true);
    expect(active.some((row) => row.metrics.revenueCents > 0)).toBe(true);
  });

  it('gives archived and draft products no traffic, since they are not live', async () => {
    const state = await loadProductList(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.rows) {
      if (row.product.status === 'active') continue;
      expect(row.metrics.viewSessions).toBe(0);
      expect(row.metrics.revenueCents).toBe(0);
      expect(row.metrics.conversionRate).toBeNull();
    }
  });

  it('applies search and reports the unfiltered total alongside', async () => {
    const state = await loadProductList(deps(), {
      ...EMPTY_QUERY,
      search: 'ridgeline',
    });

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.rows.length).toBeLessThan(state.totalCount);
    expect(state.queryActive).toBe(true);
  });

  it('returns empty — not error — when filters match nothing', async () => {
    const state = await loadProductList(deps(), {
      ...EMPTY_QUERY,
      search: 'inflatable kayak',
    });

    expect(state.status).toBe('empty');
    if (state.status !== 'empty') return;
    expect(state.queryActive).toBe(true);
    expect(state.totalCount).toBeGreaterThanOrEqual(15);
  });

  it('returns error when the traffic source fails', async () => {
    const state = await loadProductList(
      deps({ traffic: createFailingTrafficRepository('Traffic source down.') }),
    );
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Traffic source down.');
  });
});

describe('loadProductDetail', () => {
  it('finds a product by id and by slug', async () => {
    const byId = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    const bySlug = await loadProductDetail(
      deps(),
      'ridgeline-2p-backpacking-tent',
    );

    expect(byId.status).toBe('ready');
    expect(bySlug.status).toBe('ready');
    if (byId.status !== 'ready' || bySlug.status !== 'ready') return;
    expect(byId.row.product.id).toBe(bySlug.row.product.id);
  });

  it('returns not-found for an unknown id rather than throwing', async () => {
    const state = await loadProductDetail(deps(), 'prd_does_not_exist');
    expect(state.status).toBe('not-found');
  });

  it('includes the page snapshot that audits will read', async () => {
    const state = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.snapshot).not.toBeNull();
    expect(state.snapshot?.productId).toBe('prd_ridgeline_2p_tent');
  });
});

describe('saveProductSeo', () => {
  it('persists a valid edit and survives a fresh repository instance', async () => {
    const result = await saveProductSeo(
      deps(),
      'prd_ridgeline_2p_tent',
      VALID_EDIT,
    );
    expect(result.status).toBe('saved');

    // A new repository reads the same browser storage — the equivalent of a refresh.
    const reloaded = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.product.metaTitle).toBe(VALID_EDIT.metaTitle);
    expect(reloaded.row.product.primaryKeyword).toBe(VALID_EDIT.primaryKeyword);
  });

  it('syncs the page snapshot so audits grade the current metadata', async () => {
    await saveProductSeo(deps(), 'prd_ridgeline_2p_tent', VALID_EDIT);

    const reloaded = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.snapshot?.metaTitle).toBe(VALID_EDIT.metaTitle);
    expect(reloaded.snapshot?.metaDescription).toBe(VALID_EDIT.metaDescription);
  });

  it('leaves the snapshot body untouched', async () => {
    const before = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (before.status !== 'ready') throw new Error('expected ready');

    await saveProductSeo(deps(), 'prd_ridgeline_2p_tent', VALID_EDIT);

    const after = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.snapshot?.bodyText).toBe(before.snapshot?.bodyText);
    expect(after.snapshot?.faq).toEqual(before.snapshot?.faq);
  });

  it('does not touch other products', async () => {
    await saveProductSeo(deps(), 'prd_ridgeline_2p_tent', VALID_EDIT);

    const other = await loadProductDetail(deps(), 'prd_summit_20_bag');
    if (other.status !== 'ready') throw new Error('expected ready');
    expect(other.row.product.metaTitle).toBe('Summit 20 Down Sleeping Bag');
  });

  it('rejects an invalid edit and writes nothing', async () => {
    const result = await saveProductSeo(deps(), 'prd_ridgeline_2p_tent', {
      ...VALID_EDIT,
      metaTitle: '   ',
    });

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.errors.metaTitle).toBeDefined();

    const reloaded = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.product.metaTitle).toBe(
      'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
    );
  });

  it('reports a storage failure without claiming success', async () => {
    const result = await saveProductSeo(
      deps({ state: createFailingStateRepository(buildDemoSeedState()) }),
      'prd_ridgeline_2p_tent',
      VALID_EDIT,
    );

    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toMatch(/unavailable/i);
  });

  it('errors for a product that does not exist', async () => {
    const result = await saveProductSeo(deps(), 'prd_nope', VALID_EDIT);
    expect(result.status).toBe('error');
  });

  it('keeps edits isolated from the in-memory adapter used elsewhere', async () => {
    const memory = createMemoryStateRepository(buildDemoSeedState());
    await saveProductSeo(deps({ state: memory }), 'prd_ridgeline_2p_tent', VALID_EDIT);

    // The browser-backed repository never saw that write.
    const browserSide = await loadProductDetail(deps(), 'prd_ridgeline_2p_tent');
    if (browserSide.status !== 'ready') throw new Error('expected ready');
    expect(browserSide.row.product.metaTitle).toBe(
      'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
    );
  });
});
