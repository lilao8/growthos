import { describe, expect, it } from 'vitest';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { getDemoStatus } from '@/services/demo-state-service';
import { createMemoryStateRepository } from '@/repositories/memory-state-repository';
import { DEMO_WINDOW } from '@/domain/demo-window';

describe('demo seed fixture', () => {
  it('validates against the persisted schema', () => {
    expect(() => buildDemoSeedState()).not.toThrow();
  });

  it('is byte-identical across calls — no randomness at load time', () => {
    expect(JSON.stringify(buildDemoSeedState())).toBe(
      JSON.stringify(buildDemoSeedState()),
    );
  });

  it('returns an independent copy each time', () => {
    const first = buildDemoSeedState();
    const product = first.products[0];
    if (product === undefined) throw new Error('missing product');
    product.title = 'Mutated';

    expect(buildDemoSeedState().products[0]?.title).not.toBe('Mutated');
  });

  it('has unique SKUs and slugs', () => {
    const { products } = buildDemoSeedState();
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
  });

  it('prices every product above its cost', () => {
    for (const product of buildDemoSeedState().products) {
      expect(product.priceCents).toBeGreaterThan(product.costCents);
    }
  });

  it('links every snapshot to a product that exists', () => {
    const state = buildDemoSeedState();
    const ids = new Set(state.products.map((product) => product.id));
    for (const snapshot of state.pageSnapshots) {
      if (snapshot.productId !== null) {
        expect(ids).toContain(snapshot.productId);
      }
    }
  });

  it('captures snapshots inside the demo window', () => {
    for (const snapshot of buildDemoSeedState().pageSnapshots) {
      expect(snapshot.capturedAt).toBe(DEMO_WINDOW.end);
    }
  });

  it('keeps an incomplete snapshot so audits must handle missing data', () => {
    const snapshot = buildDemoSeedState().pageSnapshots.find(
      (candidate) => candidate.id === 'snap_summit_20_bag',
    );
    expect(snapshot).toBeDefined();
    expect(snapshot?.h1).toBeNull();
    expect(snapshot?.canonical).toBeNull();
    expect(snapshot?.indexability).toBe('unknown');
  });
});

describe('demo state service', () => {
  it('reports the fixture contents and the fixed window', async () => {
    const status = await getDemoStatus(
      createMemoryStateRepository(buildDemoSeedState()),
    );

    expect(status.brandReady).toBe(true);
    // The brief requires at least 15 SKUs; asserting the floor rather than an
    // exact count keeps this from breaking every time the catalogue grows.
    expect(status.productCount).toBeGreaterThanOrEqual(15);
    expect(status.snapshotCount).toBe(status.productCount);
    expect(status.windowStart).toBe('2026-06-03');
    expect(status.windowEnd).toBe('2026-08-31');
    expect(status.windowDays).toBe(90);
    expect(status.loadStatus).toBe('empty');
  });

  it('reflects persisted edits after a save', async () => {
    const repository = createMemoryStateRepository(buildDemoSeedState());
    const state = buildDemoSeedState();
    state.products = state.products.slice(0, 2);
    await repository.save(state);

    const status = await getDemoStatus(repository);
    expect(status.loadStatus).toBe('loaded');
    expect(status.productCount).toBe(2);
  });
});
