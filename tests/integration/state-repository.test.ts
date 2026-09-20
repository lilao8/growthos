import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBrowserStateRepository,
  stateKey,
} from '@/repositories/browser-state-repository';
import { createMemoryStateRepository } from '@/repositories/memory-state-repository';
import type { DemoState, DemoStateRepository } from '@/repositories/types';
import { SCHEMA_VERSION } from '@/repositories/types';
import { buildDemoSeedState } from '@/fixtures/demo-seed';

/**
 * Integration boundary: the real persistence path, not mocks. The browser
 * adapter runs against jsdom's localStorage; both adapters must satisfy the
 * same contract.
 */

const TEST_NAMESPACE = 'growthos.test';
const KEY = stateKey(TEST_NAMESPACE);

function editedState(): DemoState {
  const state = buildDemoSeedState();
  const first = state.products[0];
  if (first === undefined) throw new Error('Seed fixture has no products');
  first.metaTitle = 'Edited meta title';
  return state;
}

describe.each<[string, () => DemoStateRepository]>([
  ['memory adapter', () => createMemoryStateRepository(buildDemoSeedState())],
  [
    'browser adapter',
    () =>
      createBrowserStateRepository(buildDemoSeedState(), {
        namespace: TEST_NAMESPACE,
      }),
  ],
])('%s', (_name, create) => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports empty and falls back to the seed before anything is written', async () => {
    const result = await create().load();
    expect(result.status).toBe('empty');
    expect(result.state.products.length).toBeGreaterThan(0);
    expect(result.error).toBeNull();
  });

  it('round-trips a saved edit', async () => {
    const repository = create();
    await repository.save(editedState());

    const result = await repository.load();
    expect(result.status).toBe('loaded');
    expect(result.state.products[0]?.metaTitle).toBe('Edited meta title');
  });

  it('does not hand out a shared reference to the seed', async () => {
    const repository = create();
    const first = await repository.load();
    const firstProduct = first.state.products[0];
    if (firstProduct === undefined) throw new Error('missing product');
    firstProduct.title = 'Mutated in place';

    const second = await repository.load();
    expect(second.state.products[0]?.title).not.toBe('Mutated in place');
  });

  it('refuses to persist an invalid state', async () => {
    const repository = create();
    const invalid = buildDemoSeedState();
    const product = invalid.products[0];
    if (product === undefined) throw new Error('missing product');
    product.priceCents = 12.5;

    await expect(repository.save(invalid)).rejects.toThrow(TypeError);
  });

  it('reset returns to the seed and clears prior edits', async () => {
    const repository = create();
    await repository.save(editedState());

    const afterReset = await repository.reset();
    expect(afterReset.status).toBe('empty');

    const reloaded = await repository.load();
    expect(reloaded.status).toBe('empty');
    expect(reloaded.state.products[0]?.metaTitle).not.toBe('Edited meta title');
  });
});

describe('browser adapter specifics', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes under its own namespaced key only', async () => {
    const repository = createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
    });
    await repository.save(editedState());

    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('reset leaves unrelated keys in the same origin untouched', async () => {
    localStorage.setItem('unrelated-app.state', 'keep me');
    const repository = createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
    });
    await repository.save(editedState());
    await repository.reset();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('unrelated-app.state')).toBe('keep me');
  });

  it('reports corrupted JSON instead of throwing, and keeps the seed usable', async () => {
    localStorage.setItem(KEY, '{not json');
    const result = await createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
    }).load();

    expect(result.status).toBe('corrupted');
    expect(result.error).toContain('not valid JSON');
    expect(result.state.products.length).toBeGreaterThan(0);
  });

  it('reports a schema version mismatch distinctly', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION - 1,
        products: [],
        pageSnapshots: [],
      }),
    );
    const result = await createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
    }).load();

    expect(result.status).toBe('corrupted');
    expect(result.error).toContain('older schema');
  });

  it('rejects structurally valid JSON that violates the domain rules', async () => {
    const invalid = buildDemoSeedState();
    const product = invalid.products[0];
    if (product === undefined) throw new Error('missing product');
    const raw = JSON.stringify({
      ...invalid,
      products: [{ ...product, slug: 'Not A Slug' }],
    });
    localStorage.setItem(KEY, raw);

    const result = await createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
    }).load();
    expect(result.status).toBe('corrupted');
    expect(result.error).toContain('slug');
  });

  it('reports unavailable on the server instead of failing the render', async () => {
    const result = await createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
      storage: null,
    }).load();

    expect(result.status).toBe('unavailable');
    expect(result.state.products.length).toBeGreaterThan(0);
  });

  it('surfaces a save failure when storage is unavailable', async () => {
    const repository = createBrowserStateRepository(buildDemoSeedState(), {
      namespace: TEST_NAMESPACE,
      storage: null,
    });
    await expect(repository.save(editedState())).rejects.toThrow(
      /storage is unavailable/i,
    );
  });
});
