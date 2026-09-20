import { beforeEach, describe, expect, it } from 'vitest';
import {
  createContentIdea,
  loadContentIdea,
  loadContentList,
  setContentStatus,
  updateContentIdea,
  type ContentServiceDeps,
} from '@/services/content-service';
import { runSeoAuditForPage, type SeoAuditDeps } from '@/services/seo-audit-service';
import { runGeoAuditForPage, type GeoAuditDeps } from '@/services/geo-audit-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { EMPTY_CONTENT_QUERY } from '@/domain/content/content-filters';

/**
 * Content service against the real browser storage adapter: persistence, the
 * product relationship, and the failure paths.
 */

const NAMESPACE = 'growthos.test.content';
const PAD_IDEA = 'idea_r-value-faq';
const TENT_PAGE = 'snap_ridgeline_2p_tent';
const TENT_IDEA = 'idea_best-2-person-backpacking-tents';

function stateRepo() {
  return createBrowserStateRepository(buildDemoSeedState(), {
    namespace: NAMESPACE,
  });
}

function deps(): ContentServiceDeps {
  return { state: stateRepo() };
}

const NEW_IDEA = {
  topic: 'Choosing between a tarp and a tent',
  primaryKeyword: 'tarp vs tent',
  secondaryKeywords: 'ultralight shelter, tarp camping',
  searchIntent: 'Commercial',
  funnelStage: 'MOFU',
  contentType: 'Comparison',
  status: 'Idea',
  targetProductId: 'prd_basecamp_tarp',
  seoOpportunity: '66',
  geoOpportunity: '58',
  productRelevance: '90',
};

beforeEach(() => {
  localStorage.clear();
});

describe('loadContentList', () => {
  it('returns the seeded plan ordered by opportunity', async () => {
    const state = await loadContentList(deps());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    expect(state.rows.length).toBeGreaterThanOrEqual(10);
    const scores = state.rows.map((row) => row.breakdown.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('covers every intent and funnel stage, so the demo plan is explainable', async () => {
    const state = await loadContentList(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const intents = new Set(state.rows.map((row) => row.idea.searchIntent));
    const stages = new Set(state.rows.map((row) => row.idea.funnelStage));
    expect(intents.size).toBe(4);
    expect(stages.size).toBe(3);
  });

  it('resolves the target product for each idea that names one', async () => {
    const state = await loadContentList(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.rows) {
      if (row.idea.targetProductId === null) {
        expect(row.product).toBeNull();
        expect(row.danglingProduct).toBe(false);
      } else {
        expect(row.product?.id).toBe(row.idea.targetProductId);
        expect(row.danglingProduct).toBe(false);
      }
    }
  });

  it('applies filters and reports the unfiltered total', async () => {
    const state = await loadContentList(deps(), {
      ...EMPTY_CONTENT_QUERY,
      stages: ['BOFU'],
    });
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.rows.length).toBeLessThan(state.totalCount);
    expect(state.queryActive).toBe(true);
  });

  it('returns empty — not error — when filters match nothing', async () => {
    const state = await loadContentList(deps(), {
      ...EMPTY_CONTENT_QUERY,
      search: 'kayak paddle technique',
    });
    expect(state.status).toBe('empty');
    if (state.status !== 'empty') return;
    expect(state.queryActive).toBe(true);
  });

  it('returns error when storage cannot be read', async () => {
    const state = await loadContentList({
      state: {
        ...createFailingStateRepository(buildDemoSeedState()),
        load: () => Promise.reject(new Error('Storage exploded.')),
      },
    });
    expect(state.status).toBe('error');
  });
});

describe('createContentIdea', () => {
  it('persists a new idea that survives a fresh repository instance', async () => {
    const result = await createContentIdea(deps(), NEW_IDEA);
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    const reloaded = await loadContentIdea(deps(), result.idea.id);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.idea.topic).toBe(NEW_IDEA.topic);
    expect(reloaded.row.idea.secondaryKeywords).toEqual([
      'ultralight shelter',
      'tarp camping',
    ]);
  });

  it('scores the new idea from its own inputs', async () => {
    const result = await createContentIdea(deps(), NEW_IDEA);
    if (result.status !== 'saved') throw new Error('expected saved');

    const reloaded = await loadContentIdea(deps(), result.idea.id);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    // 0.35×66 + 0.25×58 + 0.20×80 + 0.20×90 = 23.1 + 14.5 + 16 + 18 = 71.6 -> 72
    expect(reloaded.row.breakdown.score).toBe(72);
  });

  it('rejects an invalid entry and writes nothing', async () => {
    const before = await loadContentList(deps());
    if (before.status !== 'ready') throw new Error('expected ready');

    const result = await createContentIdea(deps(), { ...NEW_IDEA, topic: '  ' });
    expect(result.status).toBe('invalid');

    const after = await loadContentList(deps());
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.totalCount).toBe(before.totalCount);
  });

  it('rejects a target product that is not in the catalogue', async () => {
    const result = await createContentIdea(deps(), {
      ...NEW_IDEA,
      targetProductId: 'prd_does_not_exist',
    });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.errors.targetProductId).toContain('not in the catalogue');
  });

  it('allows an idea with no target product', async () => {
    const result = await createContentIdea(deps(), {
      ...NEW_IDEA,
      targetProductId: '',
    });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.idea.targetProductId).toBeNull();
  });

  it('gives two ideas with the same topic distinct ids', async () => {
    const first = await createContentIdea(deps(), NEW_IDEA);
    const second = await createContentIdea(deps(), NEW_IDEA);
    if (first.status !== 'saved' || second.status !== 'saved') {
      throw new Error('expected saved');
    }
    expect(second.idea.id).not.toBe(first.idea.id);
  });

  it('reports a storage failure without claiming success', async () => {
    const result = await createContentIdea(
      { state: createFailingStateRepository(buildDemoSeedState()) },
      NEW_IDEA,
    );
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toMatch(/unavailable/i);
  });
});

describe('updateContentIdea', () => {
  it('saves an edit and re-scores it', async () => {
    const result = await updateContentIdea(deps(), PAD_IDEA, {
      topic: 'Sleeping pad R-value, answered',
      primaryKeyword: 'sleeping pad r value',
      secondaryKeywords: 'r value chart',
      searchIntent: 'Commercial',
      funnelStage: 'BOFU',
      contentType: 'FAQ',
      status: 'Writing',
      targetProductId: 'prd_cloudbed_pad',
      seoOpportunity: '90',
      geoOpportunity: '90',
      productRelevance: '90',
    });
    expect(result.status).toBe('saved');

    const reloaded = await loadContentIdea(deps(), PAD_IDEA);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.idea.status).toBe('Writing');
    expect(reloaded.row.idea.funnelStage).toBe('BOFU');
    // 0.35×90 + 0.25×90 + 0.20×80 + 0.20×90 = 31.5 + 22.5 + 16 + 18 = 88
    expect(reloaded.row.breakdown.score).toBe(88);
  });

  it('keeps the id stable across an edit', async () => {
    const result = await updateContentIdea(deps(), PAD_IDEA, {
      topic: 'A completely different topic',
      primaryKeyword: 'something else',
      secondaryKeywords: '',
      searchIntent: 'Informational',
      funnelStage: 'TOFU',
      contentType: 'Blog',
      status: 'Idea',
      targetProductId: '',
      seoOpportunity: '10',
      geoOpportunity: '10',
      productRelevance: '10',
    });
    if (result.status !== 'saved') throw new Error('expected saved');
    expect(result.idea.id).toBe(PAD_IDEA);
  });

  it('does not touch other ideas', async () => {
    await updateContentIdea(deps(), PAD_IDEA, {
      topic: 'Edited topic',
      primaryKeyword: 'edited keyword',
      secondaryKeywords: '',
      searchIntent: 'Informational',
      funnelStage: 'TOFU',
      contentType: 'Blog',
      status: 'Idea',
      targetProductId: '',
      seoOpportunity: '10',
      geoOpportunity: '10',
      productRelevance: '10',
    });

    const other = await loadContentIdea(deps(), TENT_IDEA);
    if (other.status !== 'ready') throw new Error('expected ready');
    expect(other.row.idea.topic).toBe(
      'Best two-person backpacking tents under $400',
    );
  });

  it('errors for an idea that does not exist', async () => {
    const result = await updateContentIdea(deps(), 'idea_nope', NEW_IDEA);
    expect(result.status).toBe('error');
  });

  it('rejects a dangling target product on edit too', async () => {
    const result = await updateContentIdea(deps(), PAD_IDEA, {
      ...NEW_IDEA,
      targetProductId: 'prd_gone',
    });
    expect(result.status).toBe('invalid');
  });
});

describe('setContentStatus', () => {
  it('moves an idea through the workflow and persists it', async () => {
    for (const status of ['Planned', 'Writing', 'Review', 'Published']) {
      const result = await setContentStatus(deps(), TENT_IDEA, status);
      expect(result.status).toBe('saved');
    }

    const reloaded = await loadContentIdea(deps(), TENT_IDEA);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.idea.status).toBe('Published');
  });

  it('changes nothing else about the idea', async () => {
    const before = await loadContentIdea(deps(), TENT_IDEA);
    if (before.status !== 'ready') throw new Error('expected ready');

    await setContentStatus(deps(), TENT_IDEA, 'Review');

    const after = await loadContentIdea(deps(), TENT_IDEA);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.idea).toEqual({ ...before.row.idea, status: 'Review' });
    expect(after.row.breakdown.score).toBe(before.row.breakdown.score);
  });

  it('rejects an unknown status', async () => {
    const result = await setContentStatus(deps(), TENT_IDEA, 'Shipped');
    expect(result.status).toBe('invalid');
  });

  it('errors for an idea that does not exist', async () => {
    expect((await setContentStatus(deps(), 'idea_nope', 'Planned')).status).toBe(
      'error',
    );
  });
});

describe('opportunity estimates are not audit scores', () => {
  it('shows the measured audit scores separately, and they do not affect the score', async () => {
    const seoDeps: SeoAuditDeps = {
      state: stateRepo(),
      now: () => '2026-08-31T00:00:00.000Z',
    };
    const geoDeps: GeoAuditDeps = {
      state: stateRepo(),
      now: () => '2026-08-31T00:00:00.000Z',
    };

    const before = await loadContentIdea(deps(), TENT_IDEA);
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(before.extras.auditRun).toBe(false);
    expect(before.extras.measuredSeoScore).toBeNull();

    await runSeoAuditForPage(seoDeps, TENT_PAGE);
    await runGeoAuditForPage(geoDeps, TENT_PAGE);

    const after = await loadContentIdea(deps(), TENT_IDEA);
    if (after.status !== 'ready') throw new Error('expected ready');

    // The measured scores now exist and are surfaced for contrast...
    expect(after.extras.auditRun).toBe(true);
    expect(after.extras.measuredSeoScore).not.toBeNull();
    expect(after.extras.measuredGeoScore).not.toBeNull();
    // ...but the opportunity score is unchanged, because it is built from the
    // editor's judgements and never from audit results.
    expect(after.row.breakdown.score).toBe(before.row.breakdown.score);
  });

  it('labels every entered input as entered and only intent as derived', async () => {
    const detail = await loadContentIdea(deps(), TENT_IDEA);
    if (detail.status !== 'ready') throw new Error('expected ready');

    const derived = detail.row.breakdown.parts.filter(
      (part) => part.source === 'derived',
    );
    expect(derived).toHaveLength(1);
    expect(derived[0]?.key).toBe('commercialIntent');
  });
});

describe('dangling product relationships', () => {
  it('flags an idea whose target product is missing from the catalogue', async () => {
    // Write a state where the product behind an idea no longer exists.
    const repo = stateRepo();
    const state = (await repo.load()).state;
    await repo.save({
      ...state,
      products: state.products.filter(
        (product) => product.id !== 'prd_cloudbed_pad',
      ),
    });

    const detail = await loadContentIdea(deps(), PAD_IDEA);
    if (detail.status !== 'ready') throw new Error('expected ready');
    expect(detail.row.product).toBeNull();
    expect(detail.row.danglingProduct).toBe(true);
  });
});

describe('not found', () => {
  it('returns not-found for an unknown idea id', async () => {
    expect((await loadContentIdea(deps(), 'idea_nope')).status).toBe('not-found');
  });
});
