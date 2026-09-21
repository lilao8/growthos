import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecommendations,
  setRecommendationStatus,
  type RecommendationDeps,
} from '@/services/recommendation-service';
import { runSeoAuditForAllPages } from '@/services/seo-audit-service';
import { saveProductSeo } from '@/services/product-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { EMPTY_RECOMMENDATION_QUERY } from '@/domain/recommendations/sorting';

/**
 * Ignoring a finding.
 *
 * The status exists so a list of 200 findings can be narrowed to the ones
 * somebody still intends to act on. What it must not become is a way to make
 * problems disappear:
 *
 * - An ignore carries a required reason, so the decision can be read later.
 * - Ignored findings stay in the list, counted and filterable, never dropped.
 * - The evidence at the time of the decision is kept, so an ignore whose
 *   grounds have changed is flagged rather than silently honoured forever.
 */

const NAMESPACE = 'growthos.test.ignore';
const NOW = '2026-08-31T00:00:00.000Z';

function deps(overrides: Partial<RecommendationDeps> = {}): RecommendationDeps {
  return {
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    traffic: createFixtureTrafficRepository(),
    now: () => NOW,
    ...overrides,
  };
}

async function auditAll(): Promise<void> {
  await runSeoAuditForAllPages({
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    now: () => NOW,
  });
}

async function firstOpen(): Promise<{ id: string; evidence: string | null }> {
  const view = await loadRecommendations(deps());
  if (view.status === 'error') throw new Error(view.message);
  const item = view.view.allActive.find(
    (candidate) => candidate.status === 'Open' && candidate.evidence !== null,
  );
  if (item === undefined) throw new Error('expected an open finding');
  return { id: item.id, evidence: item.evidence };
}

beforeEach(() => {
  localStorage.clear();
});

describe('an ignore needs a reason', () => {
  it('refuses to ignore without one', async () => {
    await auditAll();
    const { id } = await firstOpen();

    const result = await setRecommendationStatus(deps(), id, 'Ignored');
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toContain('needs a reason');
  });

  it('refuses an unrecognised reason', async () => {
    await auditAll();
    const { id } = await firstOpen();

    const result = await setRecommendationStatus(deps(), id, 'Ignored', {
      // A reason outside the closed list would be unreadable later.
      reason: 'because-i-said-so' as never,
    });
    expect(result.status).toBe('error');
  });

  it('writes nothing when the reason is missing', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored');

    const raw = await deps().state.load();
    expect(raw.state.recommendationStatuses).toHaveLength(0);
  });

  it('accepts a valid reason and stores it', async () => {
    await auditAll();
    const { id } = await firstOpen();

    const result = await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'not-applicable',
      note: '  These images are decorative.  ',
    });
    expect(result.status).toBe('saved');

    const raw = await deps().state.load();
    const record = raw.state.recommendationStatuses.find((r) => r.id === id);
    expect(record?.status).toBe('Ignored');
    expect(record?.reason).toBe('not-applicable');
    // Trimmed, so stray whitespace does not become part of the record.
    expect(record?.note).toBe('These images are decorative.');
  });
});

describe('an ignored finding stays visible', () => {
  it('is still in the list, not dropped', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'deliberate',
    });

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    const item = view.view.allActive.find((candidate) => candidate.id === id);
    expect(item).toBeDefined();
    expect(item?.status).toBe('Ignored');
    expect(item?.ignore?.reason).toBe('deliberate');
  });

  it('leaves the open count lower by exactly one', async () => {
    await auditAll();
    const before = await loadRecommendations(deps());
    if (before.status === 'error') throw new Error('expected a view');
    const openBefore = before.view.tally.open;

    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'wont-fix',
    });

    const after = await loadRecommendations(deps());
    if (after.status === 'error') throw new Error('expected a view');
    expect(after.view.tally.open).toBe(openBefore - 1);
    expect(after.view.tally.ignored).toBe(1);
    // The finding did not leave the list, only the open bucket.
    expect(after.view.tally.total).toBe(before.view.tally.total);
  });

  it('can be filtered to', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'rule-disputed',
    });

    const view = await loadRecommendations(deps(), {
      ...EMPTY_RECOMMENDATION_QUERY,
      statuses: ['Ignored'],
    });
    if (view.status === 'error') throw new Error('expected a view');
    expect(view.view.items).toHaveLength(1);
    expect(view.view.items[0]?.id).toBe(id);
  });

  it('sorts below open work but above completed work', async () => {
    await auditAll();
    const view0 = await loadRecommendations(deps());
    if (view0.status === 'error') throw new Error('expected a view');
    const [a, b] = view0.view.allActive;
    if (a === undefined || b === undefined) throw new Error('expected two');

    await setRecommendationStatus(deps(), a.id, 'Ignored', {
      reason: 'deliberate',
    });
    await setRecommendationStatus(deps(), b.id, 'Done');

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    const statuses = view.view.allActive.map((item) => item.status);
    const firstIgnored = statuses.indexOf('Ignored');
    const firstDone = statuses.indexOf('Done');
    expect(firstIgnored).toBeGreaterThan(statuses.indexOf('Open'));
    expect(firstIgnored).toBeLessThan(firstDone);
  });

  it('survives a reload', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'not-applicable',
      note: 'Decorative only.',
    });

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    const item = view.view.allActive.find((candidate) => candidate.id === id);
    expect(item?.ignore?.note).toBe('Decorative only.');
  });
});

describe('an ignore can be taken back', () => {
  it('returns the finding to open and forgets the decision', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', { reason: 'wont-fix' });
    await setRecommendationStatus(deps(), id, 'Open');

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    const item = view.view.allActive.find((candidate) => candidate.id === id);
    expect(item?.status).toBe('Open');
    expect(item?.ignore).toBeNull();

    // Reopening removes the record; the absence of a decision is what Open is.
    const raw = await deps().state.load();
    expect(raw.state.recommendationStatuses.find((r) => r.id === id)).toBeUndefined();
  });
});

describe('an ignore whose grounds have changed is flagged', () => {
  const PRODUCT = 'prd_summit_20_bag';

  it('is not flagged while the evidence is unchanged', async () => {
    await auditAll();
    const { id } = await firstOpen();
    await setRecommendationStatus(deps(), id, 'Ignored', {
      reason: 'not-applicable',
    });

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    expect(
      view.view.allActive.find((item) => item.id === id)?.ignore?.needsReview,
    ).toBe(false);
    expect(view.view.tally.ignoredNeedingReview).toBe(0);
  });

  it('is flagged once the evidence moves on', async () => {
    await auditAll();

    // Find a finding about this product's meta title, ignore it, then change
    // the title so the evidence behind the decision no longer holds.
    const view0 = await loadRecommendations(deps());
    if (view0.status === 'error') throw new Error('expected a view');
    const target = view0.view.allActive.find(
      (item) =>
        item.relatedProductId === PRODUCT &&
        item.ruleId === 'meta-title-length' &&
        item.evidence !== null,
    );
    expect(target, 'expected a meta-title-length finding').toBeDefined();
    if (target === undefined) return;

    await setRecommendationStatus(deps(), target.id, 'Ignored', {
      reason: 'deliberate',
      note: 'Short on purpose.',
    });

    const state = createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    });
    await saveProductSeo(
      { state, traffic: createFixtureTrafficRepository() },
      PRODUCT,
      {
        primaryKeyword: 'winter sleeping bag',
        metaTitle:
          'Summit 20 Down Sleeping Bag — 800-fill Down, 20F Comfort Rating | NorthTrail',
        metaDescription:
          'An 800-fill down sleeping bag rated to 20F comfort, weighing 2.1 lb packed, for three season backpacking.',
        slug: 'summit-20-down-sleeping-bag',
      },
    );
    await runSeoAuditForAllPages({ state, now: () => NOW });

    const view = await loadRecommendations(deps());
    if (view.status === 'error') throw new Error('expected a view');
    const again = view.view.allActive.find((item) => item.id === target.id);

    // Either the finding stopped firing entirely (also fine — it is fixed), or
    // it is still there with different evidence and must be flagged.
    if (again !== undefined) {
      expect(again.ignore?.needsReview).toBe(true);
      expect(view.view.tally.ignoredNeedingReview).toBeGreaterThan(0);
    }
  });
});

describe('failure paths', () => {
  it('rejects an unknown status', async () => {
    const result = await setRecommendationStatus(deps(), 'rec_x', 'Maybe');
    expect(result.status).toBe('error');
  });

  it('reports a save failure rather than claiming the decision stuck', async () => {
    const broken = createFailingStateRepository(buildDemoSeedState());
    const result = await setRecommendationStatus(
      deps({ state: broken }),
      'rec_x',
      'Ignored',
      { reason: 'wont-fix' },
    );
    expect(result.status).toBe('error');
  });
});
