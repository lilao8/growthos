import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadAdvertising,
  loadListingAdvertising,
  type AmazonAdsDeps,
} from '@/services/amazon-ads-service';
import { loadDashboard } from '@/services/dashboard-service';
import { loadAnalytics } from '@/services/analytics-service';
import { loadRecommendations } from '@/services/recommendation-service';
import {
  createFailingAmazonAdsRepository,
  createEmptyAmazonAdsRepository,
  createFixtureAmazonAdsRepository,
} from '@/repositories/amazon-ads-repository';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { getAmazonAdsFixture } from '@/fixtures/demo-amazon-ads';
import { AD_RULE_VERSION, DEFAULT_AD_CONFIG } from '@/domain/amazon/ad-config';
import { DEMO_WINDOW, isWithinWindow } from '@/domain/demo-window';
import { runAuditForAllListings } from '@/services/amazon-service';
import { sumCents } from '@/domain/money';

/**
 * Advertising service against the real fixture repositories.
 *
 * Two guarantees carry the weight here, because they are the reason the module
 * was allowed to exist: the aggregates reconcile against the underlying rows,
 * and nothing from Amazon ever reaches a storefront metric.
 */

const NAMESPACE = 'growthos.test.ads';
const LOW_ORGANIC = 'lst_beacon_headlamp';
const NOT_ADVERTISED = 'lst_waypoint_compass';

function deps(overrides: Partial<AmazonAdsDeps> = {}): AmazonAdsDeps {
  return {
    ads: createFixtureAmazonAdsRepository(),
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadAdvertising', () => {
  it('reports plausible marketplace economics', async () => {
    const state = await loadAdvertising(deps());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    const { totals } = state.view;
    // Guards against a generator that drifts into figures no real account
    // sees — a sub-5% ACOS or a 50% click conversion rate would mean the
    // fixture is demonstrating rules against impossible data.
    expect(totals.acos).toBeGreaterThan(0.1);
    expect(totals.acos).toBeLessThan(0.6);
    expect(totals.cvr).toBeGreaterThan(0.01);
    expect(totals.cvr).toBeLessThan(0.25);
    expect(totals.ctr).toBeGreaterThan(0.001);
    expect(totals.ctr).toBeLessThan(0.05);
    expect(totals.unitSessionPercentage).toBeGreaterThan(0.01);
    expect(totals.unitSessionPercentage).toBeLessThan(0.3);
  });

  it('keeps TACOS below ACOS, because total sales exceed attributed sales', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const { totals } = state.view;
    expect(totals.tacos).not.toBeNull();
    expect(totals.acos).not.toBeNull();
    expect(totals.tacos ?? 1).toBeLessThan(totals.acos ?? 0);
  });

  it('stamps its own rule version', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.view.ruleVersion).toBe(AD_RULE_VERSION);
  });

  it('reports the empty state rather than zeros when there are no rows', async () => {
    const state = await loadAdvertising(
      deps({ ads: createEmptyAmazonAdsRepository() }),
    );
    expect(state.status).toBe('empty');
  });

  it('reports an error rather than an empty page when the source fails', async () => {
    const state = await loadAdvertising(
      deps({ ads: createFailingAmazonAdsRepository('Reports are down.') }),
    );
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Reports are down.');
  });
});

describe('aggregates reconcile against the underlying rows', () => {
  it('campaign spend sums to the total', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const { campaigns, totals } = state.view;

    expect(sumCents(campaigns.map((row) => row.spendCents))).toBe(
      totals.spendCents,
    );
    expect(sumCents(campaigns.map((row) => row.adSalesCents))).toBe(
      totals.adSalesCents,
    );
    expect(campaigns.reduce((sum, row) => sum + row.clicks, 0)).toBe(
      totals.clicks,
    );
  });

  it('search term rows sum to the total', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const { searchTerms, totals } = state.view;

    expect(sumCents(searchTerms.map((row) => row.spendCents))).toBe(
      totals.spendCents,
    );
    expect(searchTerms.reduce((sum, row) => sum + row.adOrders, 0)).toBe(
      totals.adOrders,
    );
  });

  it('daily points sum to the total', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const { daily, totals } = state.view;

    expect(sumCents(daily.map((point) => point.spendCents))).toBe(
      totals.spendCents,
    );
    expect(daily).toHaveLength(DEMO_WINDOW.days);
  });

  it('matches a hand-rolled sum of the raw fixture rows', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const raw = getAmazonAdsFixture().searchTerms.filter((row) =>
      isWithinWindow(row.date, DEMO_WINDOW),
    );
    expect(state.view.totals.clicks).toBe(
      raw.reduce((sum, row) => sum + row.clicks, 0),
    );
    expect(state.view.totals.spendCents).toBe(
      sumCents(raw.map((row) => row.spendCents)),
    );
  });

  it('per-ASIN ad sales sum to the total', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(sumCents(state.view.asins.map((row) => row.adSalesCents))).toBe(
      state.view.totals.adSalesCents,
    );
  });
});

describe('the fixture exercises each rule branch', () => {
  it('produces harvest, negation and inconclusive sets that do not overlap', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const { harvest, negations, inconclusive } = state.view;

    expect(harvest.length).toBeGreaterThan(0);
    expect(negations.length).toBeGreaterThan(0);
    expect(inconclusive.length).toBeGreaterThan(0);

    const key = (targetId: string, term: string): string => `${targetId}:${term}`;
    const harvested = new Set(
      harvest.map((item) => key(item.sourceTargetId, item.customerSearchTerm)),
    );
    const negated = new Set(
      negations.map((item) => key(item.sourceTargetId, item.customerSearchTerm)),
    );
    const held = new Set(
      inconclusive.map((item) => key(item.targetId, item.customerSearchTerm)),
    );
    for (const id of harvested) expect(negated.has(id)).toBe(false);
    for (const id of negated) expect(held.has(id)).toBe(false);
  });

  it('does not harvest a term that already has an exact target', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');

    // "2 person tent" is served by a broad target AND has its own exact
    // target. The exclusion is only meaningful if the term would otherwise
    // qualify, so that is asserted first — otherwise this test would pass on a
    // fixture where the term simply had a bad ACOS, and the exact-target check
    // could be deleted without failing anything.
    const viaBroad = state.view.searchTerms.find(
      (row) => row.customerSearchTerm === '2 person tent' && row.matchType === 'broad',
    );
    expect(viaBroad).toBeDefined();
    if (viaBroad === undefined) return;

    const ceiling =
      DEFAULT_AD_CONFIG.targetAcos - DEFAULT_AD_CONFIG.harvestAcosMargin;
    expect(viaBroad.clicks).toBeGreaterThanOrEqual(
      DEFAULT_AD_CONFIG.minimumClicksForConclusion,
    );
    expect(viaBroad.adOrders).toBeGreaterThan(0);
    expect(viaBroad.acos ?? 1).toBeLessThanOrEqual(ceiling);

    // Every criterion met, and still not harvested — because an exact target
    // for this phrase already exists.
    expect(
      state.view.harvest.some(
        (item) => item.customerSearchTerm === '2 person tent',
      ),
    ).toBe(false);
  });

  it('holds every inconclusive term below the click threshold', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    for (const row of state.view.inconclusive) {
      expect(row.clicks, row.customerSearchTerm).toBeLessThan(
        DEFAULT_AD_CONFIG.minimumClicksForConclusion,
      );
      expect(row.adOrders).toBe(0);
    }
  });

  it('finds at least one campaign above the target ACOS', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.view.overTargetCampaigns.length).toBeGreaterThan(0);
    for (const row of state.view.overTargetCampaigns) {
      expect(row.acos ?? 0).toBeGreaterThan(DEFAULT_AD_CONFIG.targetAcos);
      expect(row.lowVolume).toBe(false);
    }
  });

  it('finds the ASIN that is carried by advertising', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    const low = state.view.asins.filter((row) => row.lowOrganicShare);
    expect(low.map((row) => row.listingId)).toContain(LOW_ORGANIC);
  });

  it('never reports a negative or impossible organic share', async () => {
    const state = await loadAdvertising(deps());
    if (state.status !== 'ready') throw new Error('expected ready');
    for (const row of state.view.asins) {
      if (row.organicShare === null) continue;
      expect(row.organicShare, row.listingId).toBeGreaterThanOrEqual(0);
      expect(row.organicShare, row.listingId).toBeLessThanOrEqual(1);
    }
  });

  it('is identical across repeated loads', async () => {
    const first = await loadAdvertising(deps());
    const second = await loadAdvertising(deps());
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(second.view.totals).toEqual(first.view.totals);
    expect(second.view.harvest).toEqual(first.view.harvest);
  });
});

describe('loadListingAdvertising', () => {
  it('returns the figures for an advertised ASIN', async () => {
    const state = await loadListingAdvertising(deps(), LOW_ORGANIC);
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.row.listingId).toBe(LOW_ORGANIC);
    expect(state.row.lowOrganicShare).toBe(true);
  });

  it('says "not advertised" rather than showing zeros', async () => {
    const state = await loadListingAdvertising(deps(), NOT_ADVERTISED);
    // Zeros would read as poor performance; this ASIN simply has no campaign.
    expect(state.status).toBe('none');
  });

  it('propagates a source failure instead of claiming no advertising', async () => {
    const state = await loadListingAdvertising(
      deps({ ads: createFailingAmazonAdsRepository('Reports are down.') }),
      LOW_ORGANIC,
    );
    expect(state.status).toBe('error');
  });
});

describe('Amazon advertising never touches storefront metrics', () => {
  it('leaves every dashboard headline identical', async () => {
    const traffic = createFixtureTrafficRepository();
    const before = await loadDashboard(traffic);
    await loadAdvertising(deps());
    const after = await loadDashboard(traffic);
    expect(after).toEqual(before);
  });

  it('leaves the storefront channel analytics identical', async () => {
    const traffic = createFixtureTrafficRepository();
    const before = await loadAnalytics({ traffic });
    await loadAdvertising(deps());
    const after = await loadAnalytics({ traffic });
    expect(after).toEqual(before);
  });

  it('keeps the two conversion rates on different denominators', async () => {
    const ads = await loadAdvertising(deps());
    const site = await loadDashboard(createFixtureTrafficRepository());
    if (ads.status !== 'ready' || site.status !== 'ready') {
      throw new Error('expected ready states');
    }

    // Amazon: orders ÷ clicks. Storefront: purchasing sessions ÷ sessions.
    // The point of this test is that the two are computed from different
    // quantities entirely — not that one happens to be larger today.
    expect(ads.view.totals.cvr).not.toBe(site.summary.conversionRate);
    expect(ads.view.totals.clicks).toBeGreaterThan(0);
    expect(site.summary.sessions).toBeGreaterThan(0);
    expect(ads.view.totals.clicks).not.toBe(site.summary.sessions);
  });

  it('writes nothing to persisted state', async () => {
    await loadAdvertising(deps());
    // Reports are read-only facts; nothing about them belongs in storage.
    expect(localStorage.length).toBe(0);
  });
});

describe('advertising findings reach Recommendations', () => {
  function recDeps() {
    return {
      state: createBrowserStateRepository(buildDemoSeedState(), {
        namespace: NAMESPACE,
      }),
      traffic: createFixtureTrafficRepository(),
      ads: createFixtureAmazonAdsRepository(),
      now: () => '2026-08-31T00:00:00.000Z',
    };
  }

  it('contributes advertising tasks without any audit having been run', async () => {
    // Unlike listing-quality findings, advertising findings come from reports
    // rather than from an audit the user triggers, so they are there at once.
    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');

    const ads = view.view.allActive.filter(
      (item) => item.source === 'amazon' && item.link === '/amazon/advertising',
    );
    expect(ads.length).toBeGreaterThan(0);
    for (const item of ads) {
      expect(item.ruleVersion).toBe(AD_RULE_VERSION);
      expect(item.category).toBe('Amazon advertising');
      expect(item.suggestedAction.length).toBeGreaterThan(20);
    }
  });

  it('raises every rule the fixture triggers', async () => {
    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');
    const ruleIds = new Set(
      view.view.allActive
        .filter((item) => item.link === '/amazon/advertising')
        .map((item) => item.ruleId),
    );
    expect(ruleIds).toContain('negate-search-term');
    expect(ruleIds).toContain('harvest-search-term');
    expect(ruleIds).toContain('campaign-acos');
    expect(ruleIds).toContain('low-organic-share');
  });

  it('gives each search term task a stable id keyed by term and target', async () => {
    const first = await loadRecommendations(recDeps());
    const second = await loadRecommendations(recDeps());
    if (first.status === 'error' || second.status === 'error') {
      throw new Error('expected views');
    }
    const ids = (view: typeof first): string[] =>
      view.view.allActive
        .filter((item) => item.link === '/amazon/advertising')
        .map((item) => item.id);
    expect(ids(second)).toEqual(ids(first));
    expect(new Set(ids(first)).size).toBe(ids(first).length);
  });

  it('omits advertising entirely when no report source is supplied', async () => {
    const { ads, ...withoutAds } = recDeps();
    expect(ads).toBeDefined();
    const view = await loadRecommendations(withoutAds);
    if (view.status === 'error') throw new Error('expected a view');
    expect(
      view.view.allActive.some((item) => item.link === '/amazon/advertising'),
    ).toBe(false);
  });

  it('coexists with listing-quality findings rather than replacing them', async () => {
    const d = recDeps();
    await runAuditForAllListings({
      state: d.state,
      now: () => '2026-08-31T00:00:00.000Z',
    });

    const view = await loadRecommendations(recDeps());
    if (view.status === 'error') throw new Error('expected a view');
    const amazon = view.view.allActive.filter((item) => item.source === 'amazon');
    expect(
      amazon.some((item) => item.link.startsWith('/amazon/lst_')),
    ).toBe(true);
    expect(
      amazon.some((item) => item.link === '/amazon/advertising'),
    ).toBe(true);
  });
});
