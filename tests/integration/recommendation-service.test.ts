import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecommendations,
  setRecommendationStatus,
  type RecommendationDeps,
} from '@/services/recommendation-service';
import { runSeoAuditForAllPages, type SeoAuditDeps } from '@/services/seo-audit-service';
import { runGeoAuditForAllPages, type GeoAuditDeps } from '@/services/geo-audit-service';
import { saveProductSeo, type ProductServiceDeps } from '@/services/product-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import {
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
} from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { EMPTY_RECOMMENDATION_QUERY } from '@/domain/recommendations/sorting';

/**
 * The task centre against the real engines: what each source contributes, and
 * whether a completion survives everything that can happen to the list.
 */

const NAMESPACE = 'growthos.test.recommendations';

function stateRepo() {
  return createBrowserStateRepository(buildDemoSeedState(), {
    namespace: NAMESPACE,
  });
}

function deps(): RecommendationDeps {
  return {
    state: stateRepo(),
    traffic: createFixtureTrafficRepository(),
    now: () => '2026-08-31T00:00:00.000Z',
  };
}

function seoDeps(): SeoAuditDeps {
  return { state: stateRepo(), now: () => '2026-08-31T00:00:00.000Z' };
}

function geoDeps(): GeoAuditDeps {
  return { state: stateRepo(), now: () => '2026-08-31T00:00:00.000Z' };
}

function productDeps(): ProductServiceDeps {
  return { state: stateRepo(), traffic: createFixtureTrafficRepository() };
}

async function ready(query = EMPTY_RECOMMENDATION_QUERY) {
  const state = await loadRecommendations(deps(), query);
  if (state.status === 'error') throw new Error(state.message);
  return state.view;
}

beforeEach(() => {
  localStorage.clear();
});

describe('what each source contributes', () => {
  it('reports funnel and analytics findings before any audit has run', async () => {
    const view = await ready();
    const sources = new Set(view.allActive.map((item) => item.source));

    expect(sources.has('funnel')).toBe(true);
    expect(sources.has('content')).toBe(true);
    // Audits have not been run, so they legitimately contribute nothing yet.
    expect(sources.has('seo')).toBe(false);
    expect(sources.has('geo')).toBe(false);
    expect(view.quietSources).toContain('seo');
    expect(view.quietSources).toContain('geo');
  });

  it('adds SEO and GEO findings once the audits have run', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await runGeoAuditForAllPages(geoDeps());

    const view = await ready();
    const sources = new Set(view.allActive.map((item) => item.source));

    expect(sources.has('seo')).toBe(true);
    expect(sources.has('geo')).toBe(true);
    expect(view.quietSources).not.toContain('seo');
  });

  it('has at least one explainable item from every source', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await runGeoAuditForAllPages(geoDeps());
    const view = await ready();

    for (const source of ['seo', 'geo', 'content', 'funnel'] as const) {
      const item = view.allActive.find((candidate) => candidate.source === source);
      expect(item, `expected a ${source} recommendation`).toBeDefined();
      expect(item?.reason.length ?? 0).toBeGreaterThan(20);
      expect(item?.suggestedAction.length ?? 0).toBeGreaterThan(10);
      expect(item?.link.startsWith('/')).toBe(true);
      expect(item?.ruleVersion.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('gives every item a link that resolves to a real module', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await runGeoAuditForAllPages(geoDeps());
    const view = await ready();

    const validPrefixes = ['/seo/', '/geo/', '/content/', '/analytics', '/funnel'];
    for (const item of view.allActive) {
      expect(
        validPrefixes.some((prefix) => item.link.startsWith(prefix)),
        `unexpected link ${item.link}`,
      ).toBe(true);
    }
  });

  it('links a page-level finding to its product as well', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready();

    const seoItem = view.allActive.find((item) => item.source === 'seo');
    expect(seoItem?.relatedProductId).not.toBeNull();
  });

  it('gives channel findings no product, since they are not about one', async () => {
    const view = await ready();
    for (const item of view.allActive) {
      if (item.source !== 'analytics' && item.source !== 'funnel') continue;
      expect(item.relatedProductId).toBeNull();
    }
  });
});

describe('no problems, no tasks', () => {
  it('produces nothing from a catalogue with no findings', async () => {
    // A state with no content ideas and no audits: content and audits go quiet.
    const repo = stateRepo();
    const state = (await repo.load()).state;
    await repo.save({ ...state, contentIdeas: [], auditResults: [] });

    const view = await ready();
    const sources = new Set(view.allActive.map((item) => item.source));
    expect(sources.has('content')).toBe(false);
    expect(sources.has('seo')).toBe(false);
  });

  it('never fabricates a task from an unaudited page', async () => {
    const view = await ready();
    expect(view.allActive.filter((item) => item.source === 'seo')).toHaveLength(0);
  });
});

describe('stable identity across regeneration', () => {
  it('produces identical ids on a second load', async () => {
    await runSeoAuditForAllPages(seoDeps());

    const first = await ready();
    const second = await ready();
    expect(second.allActive.map((item) => item.id)).toEqual(
      first.allActive.map((item) => item.id),
    );
  });

  it('does not merge the same rule on different pages', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready();

    const keywordItems = view.allActive.filter(
      (item) => item.source === 'seo' && item.ruleId === 'keyword-usage',
    );
    expect(keywordItems.length).toBeGreaterThan(1);
    expect(new Set(keywordItems.map((item) => item.id)).size).toBe(
      keywordItems.length,
    );
    expect(new Set(keywordItems.map((item) => item.sourceEntityId)).size).toBe(
      keywordItems.length,
    );
  });

  it('gives every task a unique id', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await runGeoAuditForAllPages(geoDeps());
    const view = await ready();
    expect(new Set(view.allActive.map((item) => item.id)).size).toBe(
      view.allActive.length,
    );
  });
});

describe('completion survives', () => {
  it('persists Done and restores it on reload', async () => {
    const view = await ready();
    const target = view.allActive[0];
    if (target === undefined) throw new Error('expected a task');

    expect(await setRecommendationStatus(deps(), target.id, 'Done')).toEqual({
      status: 'saved',
      id: target.id,
      next: 'Done',
    });

    const after = await ready();
    expect(after.allActive.find((item) => item.id === target.id)?.status).toBe(
      'Done',
    );
    expect(after.tally.done).toBe(1);
  });

  it('survives running the audits afterwards', async () => {
    const view = await ready();
    const target = view.allActive.find((item) => item.source === 'funnel');
    if (target === undefined) throw new Error('expected a funnel task');
    await setRecommendationStatus(deps(), target.id, 'Done');

    await runSeoAuditForAllPages(seoDeps());
    await runGeoAuditForAllPages(geoDeps());

    const after = await ready();
    expect(after.allActive.find((item) => item.id === target.id)?.status).toBe(
      'Done',
    );
  });

  it('can be undone, and the task returns to open', async () => {
    const view = await ready();
    const target = view.allActive[0];
    if (target === undefined) throw new Error('expected a task');

    await setRecommendationStatus(deps(), target.id, 'Done');
    await setRecommendationStatus(deps(), target.id, 'Open');

    const after = await ready();
    expect(after.allActive.find((item) => item.id === target.id)?.status).toBe(
      'Open',
    );
    expect(after.tally.done).toBe(0);

    // Undoing removes the record rather than storing "Open".
    const raw = await stateRepo().load();
    expect(raw.state.recommendationStatuses).toHaveLength(0);
  });

  it('keeps a completed task as history once the finding disappears', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready();

    const target = view.allActive.find(
      (item) => item.source === 'seo' && item.ruleId === 'meta-title-present',
    );
    if (target === undefined) throw new Error('expected a missing-title task');
    await setRecommendationStatus(deps(), target.id, 'Done');

    // Fix the underlying problem and re-audit: the finding goes away.
    const pageId = target.sourceEntityId;
    const raw = await stateRepo().load();
    const snapshot = raw.state.pageSnapshots.find((item) => item.id === pageId);
    const productId = snapshot?.productId;
    if (productId === undefined || productId === null) {
      throw new Error('expected a product page');
    }

    await saveProductSeo(productDeps(), productId, {
      primaryKeyword: 'rechargeable camping lantern',
      metaTitle: 'TrailCell Rechargeable Lantern | NorthTrail Outdoor',
      metaDescription:
        'A 400-lumen USB-C rechargeable lantern with a 40-hour runtime on low, for camp and power cuts alike.',
    });
    await runSeoAuditForAllPages(seoDeps());

    const after = await ready();
    expect(after.allActive.some((item) => item.id === target.id)).toBe(false);
    expect(after.historical.some((item) => item.id === target.id)).toBe(true);
    expect(after.historical[0]?.active).toBe(false);
  });

  it('refuses an unknown status and changes nothing', async () => {
    const view = await ready();
    const target = view.allActive[0];
    if (target === undefined) throw new Error('expected a task');

    const result = await setRecommendationStatus(deps(), target.id, 'Archived');
    expect(result.status).toBe('error');

    const raw = await stateRepo().load();
    expect(raw.state.recommendationStatuses).toHaveLength(0);
  });

  it('reports a storage failure without claiming success', async () => {
    const result = await setRecommendationStatus(
      {
        state: createFailingStateRepository(buildDemoSeedState()),
        traffic: createFixtureTrafficRepository(),
      },
      'rec_anything',
      'Done',
    );
    expect(result.status).toBe('error');
  });
});

describe('filtering', () => {
  it('filters by source', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready({
      ...EMPTY_RECOMMENDATION_QUERY,
      sources: ['seo'],
    });

    expect(view.items.length).toBeGreaterThan(0);
    expect(view.items.every((item) => item.source === 'seo')).toBe(true);
    expect(view.items.length).toBeLessThan(view.allActive.length);
    expect(view.queryActive).toBe(true);
  });

  it('intersects source with priority', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready({
      ...EMPTY_RECOMMENDATION_QUERY,
      sources: ['seo'],
      priorities: ['Critical'],
    });

    expect(
      view.items.every(
        (item) => item.source === 'seo' && item.priority === 'Critical',
      ),
    ).toBe(true);
  });

  it('filters by quadrant', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready({
      ...EMPTY_RECOMMENDATION_QUERY,
      quadrants: ['Quick Win'],
    });
    expect(view.items.every((item) => item.quadrant === 'Quick Win')).toBe(true);
  });

  it('leaves the totals unfiltered so the counts stay honest', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const all = await ready();
    const filtered = await ready({
      ...EMPTY_RECOMMENDATION_QUERY,
      sources: ['seo'],
    });

    expect(filtered.allActive.length).toBe(all.allActive.length);
    expect(filtered.tally.total).toBe(all.tally.total);
  });
});

describe('ordering on real data', () => {
  it('opens with the highest priority, and never leads with a done task', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const view = await ready();

    const priorities = ['Critical', 'High', 'Medium', 'Low'];
    const ranks = view.allActive
      .filter((item) => item.status === 'Open')
      .map((item) => priorities.indexOf(item.priority));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    const target = view.allActive[0];
    if (target === undefined) throw new Error('expected a task');
    await setRecommendationStatus(deps(), target.id, 'Done');

    const after = await ready();
    expect(after.allActive[0]?.status).toBe('Open');
  });
});

describe('failures', () => {
  it('returns error when the traffic source fails', async () => {
    const state = await loadRecommendations({
      state: stateRepo(),
      traffic: createFailingTrafficRepository('Traffic down.'),
    });
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Traffic down.');
  });

  it('returns error when the state cannot be read', async () => {
    const state = await loadRecommendations({
      state: {
        ...createFailingStateRepository(buildDemoSeedState()),
        load: () => Promise.reject(new Error('Storage exploded.')),
      },
      traffic: createFixtureTrafficRepository(),
    });
    expect(state.status).toBe('error');
  });
});
