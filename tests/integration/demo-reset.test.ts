import { beforeEach, describe, expect, it } from 'vitest';
import {
  previewDemoReset,
  resetDemoData,
} from '@/services/demo-state-service';
import {
  createBrowserStateRepository,
  stateKey,
} from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { saveProductSeo } from '@/services/product-service';
import { createContentIdea } from '@/services/content-service';
import { runSeoAuditForPage } from '@/services/seo-audit-service';
import { setRecommendationStatus } from '@/services/recommendation-service';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';

/**
 * Demo reset against the real browser adapter.
 *
 * The storage contract is that stored data is cleared by an explicit user
 * action and by nothing else, so these tests check both halves: that a reset
 * really does return to the seed, and that the things which look like resets —
 * a failed save, a corrupted entry, an ordinary load — leave storage alone.
 */

const NAMESPACE = 'growthos.test.reset';

function repository() {
  return createBrowserStateRepository(buildDemoSeedState(), {
    namespace: NAMESPACE,
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('previewDemoReset', () => {
  it('reports a fresh browser as already clean', async () => {
    const result = await previewDemoReset(repository());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.preview.alreadyClean).toBe(true);
    expect(result.preview.corrupted).toBe(false);
    expect(result.preview.editedProducts).toBe(0);
  });

  it('counts an edited product, and only that product', async () => {
    const repo = repository();
    const seed = buildDemoSeedState();
    const target = seed.products[0];
    expect(target).toBeDefined();
    if (target === undefined) return;

    const saved = await saveProductSeo(
      { state: repo, traffic: createFixtureTrafficRepository() },
      target.id,
      {
        primaryKeyword: 'two person tent',
        metaTitle: 'A deliberately different title for the reset test',
        metaDescription:
          'A deliberately different meta description written to be long enough to pass validation for this reset preview test case.',
        slug: target.slug,
      },
    );
    expect(saved.status).toBe('saved');

    const result = await previewDemoReset(repo);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.preview.editedProducts).toBe(1);
    expect(result.preview.alreadyClean).toBe(false);
  });

  it('counts audits and completed recommendations separately', async () => {
    const repo = repository();
    const seed = buildDemoSeedState();
    const snapshot = seed.pageSnapshots[0];
    expect(snapshot).toBeDefined();
    if (snapshot === undefined) return;

    await runSeoAuditForPage({ state: repo }, snapshot.id);
    await setRecommendationStatus(
      { state: repo, traffic: createFixtureTrafficRepository() },
      'rec_seo_deadbeef',
      'Done',
    );

    const result = await previewDemoReset(repo);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.preview.auditResults).toBe(1);
    expect(result.preview.completedRecommendations).toBe(1);
    expect(result.preview.editedProducts).toBe(0);
  });

  it('counts a content idea the user added', async () => {
    const repo = repository();
    const before = buildDemoSeedState().contentIdeas.length;

    const created = await createContentIdea(
      { state: repo },
      {
        topic: 'How to choose a sleeping bag temperature rating',
        primaryKeyword: 'sleeping bag temperature rating',
        secondaryKeywords: '',
        searchIntent: 'Informational',
        funnelStage: 'TOFU',
        contentType: 'Buying Guide',
        status: 'Idea',
        targetProductId: '',
        seoOpportunity: '60',
        geoOpportunity: '60',
        productRelevance: '60',
      },
    );
    expect(created.status).toBe('saved');

    const result = await previewDemoReset(repo);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    // One added idea, and the seed ideas untouched.
    expect(result.preview.contentIdeas).toBe(1);
    expect(before).toBeGreaterThan(0);
  });

  it('treats an unreadable entry as a repair rather than a loss', async () => {
    localStorage.setItem(stateKey(NAMESPACE), '{ not json at all');

    const result = await previewDemoReset(repository());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.preview.corrupted).toBe(true);
    expect(result.preview.alreadyClean).toBe(false);
  });

  it('reports an error instead of guessing when the source fails', async () => {
    const failing = {
      ...createFailingStateRepository(buildDemoSeedState()),
      load: async () => {
        throw new Error('Storage exploded.');
      },
    };

    const result = await previewDemoReset(failing);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toBe('Storage exploded.');
  });
});

describe('resetDemoData', () => {
  it('returns storage to the seed', async () => {
    const repo = repository();
    const seed = buildDemoSeedState();
    const snapshot = seed.pageSnapshots[0];
    expect(snapshot).toBeDefined();
    if (snapshot === undefined) return;

    await runSeoAuditForPage({ state: repo }, snapshot.id);
    expect((await repo.load()).state.auditResults).toHaveLength(1);

    const result = await resetDemoData(repo);
    expect(result.status).toBe('reset');

    const after = await repo.load();
    expect(after.status).toBe('empty');
    expect(after.state.auditResults).toHaveLength(0);
    expect(after.state.recommendationStatuses).toHaveLength(0);
    expect(after.state.products).toHaveLength(seed.products.length);
    expect(after.state.contentIdeas).toHaveLength(seed.contentIdeas.length);
  });

  it('removes only this project’s key', async () => {
    localStorage.setItem('someone.elses.data', 'keep me');
    const repo = repository();
    await repo.save(buildDemoSeedState());

    await resetDemoData(repo);

    expect(localStorage.getItem(stateKey(NAMESPACE))).toBeNull();
    expect(localStorage.getItem('someone.elses.data')).toBe('keep me');
  });

  it('is idempotent', async () => {
    const repo = repository();
    expect((await resetDemoData(repo)).status).toBe('reset');
    expect((await resetDemoData(repo)).status).toBe('reset');
  });

  it('reports failure rather than claiming success', async () => {
    const broken = {
      ...createFailingStateRepository(buildDemoSeedState()),
      reset: async () => {
        throw new Error('Storage is read-only.');
      },
    };

    const result = await resetDemoData(broken);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toBe('Storage is read-only.');
  });
});

describe('nothing else clears storage', () => {
  it('a corrupted entry is left in place until the user resets', async () => {
    const key = stateKey(NAMESPACE);
    localStorage.setItem(key, '{ not json at all');

    const loaded = await repository().load();
    expect(loaded.status).toBe('corrupted');
    // The bad value is still there: a load must never silently discard data.
    expect(localStorage.getItem(key)).toBe('{ not json at all');
  });

  it('an ordinary load of a fresh browser writes nothing', async () => {
    await repository().load();
    expect(localStorage.getItem(stateKey(NAMESPACE))).toBeNull();
  });
});
