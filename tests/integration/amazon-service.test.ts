import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadAmazonOverview,
  loadListing,
  runAuditForAllListings,
  runAuditForListing,
  saveListingEdit,
  type AmazonDeps,
} from '@/services/amazon-service';
import { loadDashboard } from '@/services/dashboard-service';
import { loadRecommendations } from '@/services/recommendation-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { byteLength } from '@/domain/amazon/rules';
import { AMAZON_RULE_VERSION } from '@/domain/amazon/config';

/**
 * Amazon listing service against the real browser storage adapter.
 *
 * Beyond the usual persistence round-trip, two guarantees are checked here
 * because they are the reason this module was allowed to exist at all: Amazon
 * data never reaches a storefront metric, and a suppressed listing is not
 * demoted the way an unpublished storefront product is.
 */

const NAMESPACE = 'growthos.test.amazon';
const SUPPRESSED = 'lst_trailcell_lantern';
const WORST = 'lst_summit_20_bag';
const CLEAN = 'lst_emberlite_stove';

function deps(overrides: Partial<AmazonDeps> = {}): AmazonDeps {
  return {
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    now: () => '2026-08-31T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadAmazonOverview', () => {
  it('lists every seeded listing with no score before an audit', async () => {
    const state = await loadAmazonOverview(deps());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    expect(state.rows.length).toBeGreaterThanOrEqual(15);
    expect(state.rows.every((row) => row.audit === null)).toBe(true);
    expect(state.portfolio.averageScore).toBeNull();
    expect(state.portfolio.listingsAudited).toBe(0);
    expect(state.issues).toEqual([]);
  });

  it('knows the suppressed count before any audit has run', async () => {
    const state = await loadAmazonOverview(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    // Status is a listing fact, not an audit output — urgent either way.
    expect(state.portfolio.suppressed).toBe(1);
    expect(state.portfolio.inactive).toBe(1);
  });

  it('every listing points at a real product', async () => {
    const state = await loadAmazonOverview(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    for (const row of state.rows) {
      expect(row.product, row.listing.asin).not.toBeNull();
    }
  });

  it('produces scores and issues once audited', async () => {
    const d = deps();
    const run = await runAuditForAllListings(d);
    expect(run.status).toBe('done');

    const state = await loadAmazonOverview(d);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.portfolio.averageScore).not.toBeNull();
    expect(state.portfolio.listingsAudited).toBe(state.rows.length);
    expect(state.portfolio.ruleVersion).toBe(AMAZON_RULE_VERSION);
    expect(state.issues.length).toBeGreaterThan(0);
  });

  it('sorts issues with the most severe first', async () => {
    const d = deps();
    await runAuditForAllListings(d);
    const state = await loadAmazonOverview(d);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.issues[0]?.check.severity).toBe('critical');
  });

  it('reports an error rather than an empty catalogue when storage fails', async () => {
    const broken = createFailingStateRepository(buildDemoSeedState());
    const state = await loadAmazonOverview(
      deps({
        state: { ...broken, load: async () => { throw new Error('Storage is down.'); } },
      }),
    );
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Storage is down.');
  });
});

describe('the seeded catalogue exercises each verdict', () => {
  it('produces errors, warnings, passes and unknowns', async () => {
    const d = deps();
    await runAuditForAllListings(d);
    const state = await loadAmazonOverview(d);
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.portfolio.tally.critical).toBeGreaterThan(0);
    expect(state.portfolio.tally.warnings).toBeGreaterThan(0);
    expect(state.portfolio.tally.passed).toBeGreaterThan(0);
    // Unknowns must actually occur, or the coverage path is never exercised.
    expect(state.portfolio.tally.unknown).toBeGreaterThan(0);
  });

  it('includes a listing whose backend terms exceed the byte limit only because of accents', async () => {
    const state = await loadAmazonOverview(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const overBudget = state.rows.find(
      (row) =>
        byteLength(row.listing.backendSearchTerms) > 250 &&
        row.listing.backendSearchTerms.length <= 250,
    );
    expect(overBudget, 'expected a byte-overflow fixture').toBeDefined();
  });

  it('spreads scores rather than clustering them', async () => {
    const d = deps();
    await runAuditForAllListings(d);
    const state = await loadAmazonOverview(d);
    if (state.status !== 'ready') throw new Error('expected ready');

    const scores = state.rows
      .map((row) => row.audit?.score)
      .filter((score): score is number => typeof score === 'number');
    expect(Math.min(...scores)).toBeLessThan(60);
    expect(Math.max(...scores)).toBeGreaterThan(90);
  });
});

describe('editing a listing', () => {
  it('persists across a fresh repository instance', async () => {
    const saved = await saveListingEdit(deps(), CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, 2.6 oz, Piezo Ignition, Boils 1L Fast',
      bullets: 'First bullet that is long enough to pass the minimum length rule.\nSecond bullet that is also long enough to pass the minimum length rule.',
      backendSearchTerms: 'synonym alternative phrasing misspelled variant another query',
    });
    expect(saved.status).toBe('saved');

    const reloaded = await loadListing(deps(), CLEAN);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.listing.title).toContain('NorthTrail Emberlite');
    expect(reloaded.row.listing.bullets).toHaveLength(2);
  });

  it('makes a stored audit stale without anything marking it', async () => {
    const d = deps();
    await runAuditForListing(d, CLEAN);

    const before = await loadListing(d, CLEAN);
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(before.row.audit?.stale).toBe(false);

    await saveListingEdit(d, CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, a deliberately different title here',
      bullets: before.row.listing.bullets.join('\n'),
      backendSearchTerms: before.row.listing.backendSearchTerms,
    });

    const after = await loadListing(d, CLEAN);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(true);
  });

  it('clears staleness when the audit is re-run', async () => {
    const d = deps();
    await runAuditForListing(d, CLEAN);
    const before = await loadListing(d, CLEAN);
    if (before.status !== 'ready') throw new Error('expected ready');

    await saveListingEdit(d, CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, another deliberately different title',
      bullets: before.row.listing.bullets.join('\n'),
      backendSearchTerms: before.row.listing.backendSearchTerms,
    });
    await runAuditForListing(d, CLEAN);

    const after = await loadListing(d, CLEAN);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(false);
  });

  it('rejects backend terms past the byte limit and saves nothing', async () => {
    const d = deps();
    const tooLong = 'montaña '.repeat(40);
    expect(byteLength(tooLong.trim())).toBeGreaterThan(250);

    const result = await saveListingEdit(d, CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, 2.6 oz, Piezo Ignition, Boils Fast',
      bullets: 'A bullet long enough to satisfy the minimum length guidance here.',
      backendSearchTerms: tooLong,
    });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.errors['backendSearchTerms']).toContain('bytes, not characters');

    const reloaded = await loadListing(d, CLEAN);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.listing.backendSearchTerms).not.toBe(tooLong.trim());
  });

  it('rejects an empty title', async () => {
    const result = await saveListingEdit(deps(), CLEAN, {
      title: '   ',
      bullets: 'A bullet long enough to satisfy the minimum length guidance here.',
      backendSearchTerms: 'synonym alternative phrasing',
    });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.errors['title']).toBeDefined();
  });

  it('rejects more bullets than Amazon displays', async () => {
    const result = await saveListingEdit(deps(), CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, 2.6 oz, Piezo Ignition, Boils Fast',
      bullets: Array.from({ length: 6 }, () => 'A bullet long enough to pass.').join('\n'),
      backendSearchTerms: 'synonym alternative phrasing',
    });
    expect(result.status).toBe('invalid');
  });

  it('keeps the listing unchanged when the save itself fails', async () => {
    const seed = buildDemoSeedState();
    const failing = createFailingStateRepository(seed);
    const originalTitle = seed.amazonListings.find((l) => l.id === CLEAN)?.title;
    const result = await saveListingEdit(deps({ state: failing }), CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, 2.6 oz, Piezo Ignition, Boils Fast',
      bullets: 'A bullet long enough to satisfy the minimum length guidance here.',
      backendSearchTerms: 'synonym alternative phrasing',
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    // The service reports the cause; the UI adds the reassurance, because the
    // UI is what actually still holds the user's input.
    expect(result.message).toContain('Demo storage is unavailable.');

    const reloaded = await loadListing(deps(), CLEAN);
    if (reloaded.status !== 'ready') throw new Error('expected ready');
    expect(reloaded.row.listing.title).toBe(originalTitle);
  });

  it('reports a missing listing rather than silently creating one', async () => {
    const result = await saveListingEdit(deps(), 'lst_not_real', {
      title: 'NorthTrail Something, 2.6 oz, Piezo Ignition, Boils One Litre Fast',
      bullets: 'A bullet long enough to satisfy the minimum length guidance here.',
      backendSearchTerms: 'synonym alternative phrasing',
    });
    expect(result.status).toBe('error');

    const overview = await loadAmazonOverview(deps());
    if (overview.status !== 'ready') throw new Error('expected ready');
    expect(
      overview.rows.some((row) => row.listing.id === 'lst_not_real'),
    ).toBe(false);
  });
});

describe('running audits', () => {
  it('re-running replaces rather than accumulates', async () => {
    const d = deps();
    await runAuditForListing(d, CLEAN);
    await runAuditForListing(d, CLEAN);

    const raw = await d.state.load();
    expect(
      raw.state.listingAudits.filter((audit) => audit.listingId === CLEAN),
    ).toHaveLength(1);
  });

  it('reports a missing listing instead of auditing nothing quietly', async () => {
    const result = await runAuditForListing(deps(), 'lst_not_real');
    expect(result.status).toBe('error');
  });

  it('survives a reload', async () => {
    await runAuditForAllListings(deps());
    const state = await loadAmazonOverview(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.portfolio.listingsAudited).toBe(state.rows.length);
  });
});

describe('Amazon never contributes to storefront metrics', () => {
  it('leaves every dashboard headline identical before and after auditing', async () => {
    const d = deps();
    const traffic = createFixtureTrafficRepository();

    const before = await loadDashboard(traffic);
    await runAuditForAllListings(d);
    await saveListingEdit(d, CLEAN, {
      title: 'NorthTrail Emberlite Canister Stove, a changed title for this test case',
      bullets: 'A bullet long enough to satisfy the minimum length guidance here.',
      backendSearchTerms: 'synonym alternative phrasing misspelled variant query',
    });
    const after = await loadDashboard(traffic);

    // Auditing and editing listings must not move a single storefront number.
    expect(after).toEqual(before);
  });

  it('keeps listing audits out of the page audit array entirely', async () => {
    const d = deps();
    await runAuditForAllListings(d);
    const raw = await d.state.load();

    expect(raw.state.listingAudits.length).toBeGreaterThan(0);
    // Page audits are keyed by pageId; a listing must never appear there.
    expect(raw.state.auditResults).toHaveLength(0);
  });
});

describe('Amazon findings reach Recommendations', () => {
  function recDeps() {
    return {
      state: createBrowserStateRepository(buildDemoSeedState(), {
        namespace: NAMESPACE,
      }),
      traffic: createFixtureTrafficRepository(),
      now: () => '2026-08-31T00:00:00.000Z',
    };
  }

  it('contributes nothing until the listings are audited', async () => {
    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');
    expect(view.view.allActive.some((item) => item.source === 'amazon')).toBe(
      false,
    );
    expect(view.view.quietSources).toContain('amazon');
  });

  it('adds Amazon tasks once audited, and names the source', async () => {
    await runAuditForAllListings(deps());

    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');
    const amazon = view.view.allActive.filter((item) => item.source === 'amazon');
    expect(amazon.length).toBeGreaterThan(0);
    expect(view.view.quietSources).not.toContain('amazon');

    for (const item of amazon) {
      expect(item.link.startsWith('/amazon/'), item.id).toBe(true);
      expect(item.ruleVersion).toBe(AMAZON_RULE_VERSION);
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.suggestedAction.length).toBeGreaterThan(5);
    }
  });

  it('raises the suppression as Critical and ranks it first on its own listing', async () => {
    await runAuditForAllListings(deps());

    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');

    const onSuppressed = view.view.allActive.filter(
      (item) => item.source === 'amazon' && item.sourceEntityId === SUPPRESSED,
    );
    expect(onSuppressed.length).toBeGreaterThan(1);

    // The top two on this listing are the suppression itself and the
    // non-compliant main image that caused it — both Critical, and both ahead
    // of any copy polishing. The image comes first, which is right rather than
    // accidental: replacing it is how the suppression actually gets lifted, so
    // the sort puts the actionable root cause above the symptom.
    expect(onSuppressed.slice(0, 2).map((item) => item.ruleId).sort()).toEqual([
      'listing-status',
      'main-image-compliance',
    ]);
    expect(onSuppressed[0]?.priority).toBe('Critical');
    expect(onSuppressed[1]?.priority).toBe('Critical');

    // Across the whole list it sits among the Critical items. It is not
    // asserted to be index 0: the cross-source sort puts Quick Wins ahead of
    // Strategic work at equal priority, and reinstating a suppressed listing
    // is genuinely not a quick win. See dispatch-10.md for that trade-off.
    const index = view.view.allActive.findIndex(
      (item) => item.id === onSuppressed[0]?.id,
    );
    const criticals = view.view.allActive.filter(
      (item) => item.priority === 'Critical',
    ).length;
    expect(index).toBeLessThan(criticals);
  });

  it('ranks the worst listing above the cleanest one', async () => {
    await runAuditForAllListings(deps());
    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');

    const indexOf = (listingId: string): number =>
      view.view.allActive.findIndex(
        (item) => item.source === 'amazon' && item.sourceEntityId === listingId,
      );
    const worst = indexOf(WORST);
    const clean = indexOf(CLEAN);
    expect(worst).toBeGreaterThanOrEqual(0);
    if (clean >= 0) expect(worst).toBeLessThan(clean);
  });

  it('keeps a completed Amazon task done across a re-audit', async () => {
    const d = deps();
    await runAuditForAllListings(d);

    const { setRecommendationStatus } = await import(
      '@/services/recommendation-service'
    );
    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');
    const target = view.view.allActive.find((item) => item.source === 'amazon');
    expect(target).toBeDefined();
    if (target === undefined) return;

    await setRecommendationStatus(recDeps(), target.id, 'Done');
    await runAuditForAllListings(d);

    const after = await loadRecommendations(recDeps());
    if (after.status === 'error') throw new Error('expected a view');
    const again = after.view.allActive.find((item) => item.id === target.id);
    expect(again?.status).toBe('Done');
  });
});
