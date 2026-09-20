import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGeoOverview,
  loadGeoPage,
  runGeoAuditForAllPages,
  runGeoAuditForPage,
  type GeoAuditDeps,
} from '@/services/geo-audit-service';
import {
  loadSeoOverview,
  runSeoAuditForAllPages,
  runSeoAuditForPage,
  type SeoAuditDeps,
} from '@/services/seo-audit-service';
import {
  loadProductDetail,
  saveProductSeo,
  type ProductServiceDeps,
} from '@/services/product-service';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';

/**
 * GEO persistence, engine independence and the shared staleness machinery.
 */

const NAMESPACE = 'growthos.test.geo';
const RICH_PAGE = 'snap_ridgeline_2p_tent';
const THIN_PAGE = 'snap_summit_20_bag';
const RICH_PRODUCT = 'prd_ridgeline_2p_tent';

let clock = 0;

function stateRepo() {
  return createBrowserStateRepository(buildDemoSeedState(), {
    namespace: NAMESPACE,
  });
}

function geoDeps(): GeoAuditDeps {
  return {
    state: stateRepo(),
    now: () => {
      clock += 1;
      return `2026-08-31T00:00:0${clock % 10}.000Z`;
    },
  };
}

function seoDeps(): SeoAuditDeps {
  return { state: stateRepo(), now: () => '2026-08-31T00:00:00.000Z' };
}

function productDeps(): ProductServiceDeps {
  return { state: stateRepo(), traffic: createFixtureTrafficRepository() };
}

const VALID_EDIT = {
  primaryKeyword: 'two person tent',
  metaTitle: 'A rewritten title for the Ridgeline tent page',
  metaDescription:
    'A rewritten description of the Ridgeline 2P, long enough to sit inside the project guideline for descriptions.',
};

beforeEach(() => {
  localStorage.clear();
  clock = 0;
});

describe('before any GEO audit', () => {
  it('reports every page as never audited with no score', async () => {
    const state = await loadGeoOverview(geoDeps());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    expect(state.rows.length).toBeGreaterThanOrEqual(15);
    expect(state.rows.every((row) => row.audit === null)).toBe(true);
    expect(state.portfolio.averageScore).toBeNull();
    expect(state.portfolio.readiness.label).toBe('Not assessed');
    expect(state.recommendations).toHaveLength(0);
  });

  it('shows no GEO score on the product row', async () => {
    const detail = await loadProductDetail(productDeps(), RICH_PRODUCT);
    if (detail.status !== 'ready') throw new Error('expected ready');
    expect(detail.row.geoScore).toBeNull();
    expect(detail.row.geoAudit).toBeNull();
  });
});

describe('running GEO audits', () => {
  it('persists and survives a fresh repository instance', async () => {
    expect(await runGeoAuditForPage(geoDeps(), RICH_PAGE)).toEqual({
      status: 'done',
      audited: 1,
    });

    const page = await loadGeoPage(geoDeps(), RICH_PAGE);
    if (page.status !== 'ready') throw new Error('expected ready');
    expect(page.row.audit?.ruleVersion).toBe('geo-1.0.0');
    expect(page.row.audit?.checks).toHaveLength(10);
  });

  it('replaces the previous result rather than accumulating duplicates', async () => {
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);

    const raw = await stateRepo().load();
    expect(
      raw.state.auditResults.filter(
        (item) => item.pageId === RICH_PAGE && item.kind === 'geo',
      ),
    ).toHaveLength(1);
  });

  it('scores a content-rich page far above a marketing-copy page', async () => {
    await runGeoAuditForAllPages(geoDeps());
    const state = await loadGeoOverview(geoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const rich = state.rows.find((row) => row.snapshot.id === RICH_PAGE);
    const thin = state.rows.find((row) => row.snapshot.id === THIN_PAGE);

    expect(rich?.audit?.score ?? 0).toBeGreaterThan(70);
    expect(thin?.audit?.score ?? 100).toBeLessThan(30);
    expect(rich?.readiness.label).not.toBe(thin?.readiness.label);
  });

  it('lists recommendations lowest scoring first, excluding met rules', async () => {
    await runGeoAuditForAllPages(geoDeps());
    const state = await loadGeoOverview(geoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.recommendations.length).toBeGreaterThan(0);
    const points = state.recommendations.map((item) => item.check.points ?? 0);
    expect([...points].sort((a, b) => a - b)).toEqual(points);
    expect(points.every((value) => value < 10)).toBe(true);

    for (const item of state.recommendations) {
      expect(item.check.recommendation.length).toBeGreaterThan(0);
      expect(item.productTitle).not.toBe('');
    }
  });

  it('counts recommendations as exactly the rules below full marks', async () => {
    await runGeoAuditForAllPages(geoDeps());
    const state = await loadGeoOverview(geoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.recommendations.length).toBe(
      state.portfolio.tally.critical + state.portfolio.tally.warnings,
    );
  });

  it('errors for a page that does not exist', async () => {
    expect((await runGeoAuditForPage(geoDeps(), 'snap_nope')).status).toBe(
      'error',
    );
  });

  it('reports a storage failure without claiming success', async () => {
    const result = await runGeoAuditForPage(
      { state: createFailingStateRepository(buildDemoSeedState()) },
      RICH_PAGE,
    );
    expect(result.status).toBe('error');
  });
});

describe('the two engines are independent', () => {
  it('stores SEO and GEO results side by side for the same page', async () => {
    await runSeoAuditForPage(seoDeps(), RICH_PAGE);
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);

    const raw = await stateRepo().load();
    const forPage = raw.state.auditResults.filter(
      (item) => item.pageId === RICH_PAGE,
    );
    expect(forPage.map((item) => item.kind).sort()).toEqual(['geo', 'seo']);
  });

  it('running GEO does not create or alter an SEO result', async () => {
    await runGeoAuditForAllPages(geoDeps());

    const seo = await loadSeoOverview(seoDeps());
    if (seo.status !== 'ready') throw new Error('expected ready');
    expect(seo.portfolio.pagesAudited).toBe(0);
    expect(seo.portfolio.averageScore).toBeNull();
  });

  it('a GEO failure leaves SEO results readable, and vice versa', async () => {
    await runSeoAuditForAllPages(seoDeps());

    // GEO cannot be read at all...
    const geo = await loadGeoOverview({
      state: {
        ...createFailingStateRepository(buildDemoSeedState()),
        load: () => Promise.reject(new Error('GEO storage exploded.')),
      },
    });
    expect(geo.status).toBe('error');

    // ...and SEO still reports its own, real results.
    const seo = await loadSeoOverview(seoDeps());
    if (seo.status !== 'ready') throw new Error('expected ready');
    expect(seo.portfolio.pagesAudited).toBeGreaterThan(0);
  });

  it('gives the same page different scores under the two models', async () => {
    await runSeoAuditForPage(seoDeps(), THIN_PAGE);
    await runGeoAuditForPage(geoDeps(), THIN_PAGE);

    const seo = await loadSeoOverview(seoDeps());
    const geo = await loadGeoPage(geoDeps(), THIN_PAGE);
    if (seo.status !== 'ready' || geo.status !== 'ready') {
      throw new Error('expected ready');
    }
    const seoRow = seo.rows.find((row) => row.snapshot.id === THIN_PAGE);

    // They measure different things, so they must not be assumed equal.
    expect(seoRow?.audit?.kind).toBe('seo');
    expect(geo.row.audit?.kind).toBe('geo');
    expect(geo.row.audit?.ruleVersion).not.toBe(seoRow?.audit?.ruleVersion);
  });
});

describe('staleness', () => {
  it('marks a GEO audit stale after the page content changes', async () => {
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);

    const before = await loadGeoPage(geoDeps(), RICH_PAGE);
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(before.row.audit?.stale).toBe(false);

    await saveProductSeo(productDeps(), RICH_PRODUCT, VALID_EDIT);

    const after = await loadGeoPage(geoDeps(), RICH_PAGE);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(true);
  });

  it('does not mark GEO stale when only the keyword changed', async () => {
    await runSeoAuditForPage(seoDeps(), RICH_PAGE);
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);

    const detailBefore = await loadProductDetail(productDeps(), RICH_PRODUCT);
    if (detailBefore.status !== 'ready') throw new Error('expected ready');

    // Change only the keyword; the page snapshot itself is untouched.
    await saveProductSeo(productDeps(), RICH_PRODUCT, {
      primaryKeyword: 'ultralight two person shelter',
      metaTitle: detailBefore.row.product.metaTitle,
      metaDescription: detailBefore.row.product.metaDescription,
    });

    const detail = await loadProductDetail(productDeps(), RICH_PRODUCT);
    if (detail.status !== 'ready') throw new Error('expected ready');

    // SEO reads the keyword, so its result is stale.
    expect(detail.row.seoStale).toBe(true);
    // GEO never reads it, so telling the user to re-run would be noise.
    expect(detail.row.geoStale).toBe(false);
  });

  it('clears staleness when the GEO audit is re-run', async () => {
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);
    await saveProductSeo(productDeps(), RICH_PRODUCT, VALID_EDIT);
    await runGeoAuditForPage(geoDeps(), RICH_PAGE);

    const after = await loadGeoPage(geoDeps(), RICH_PAGE);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(false);
  });

  it('surfaces the GEO score and staleness on the product row', async () => {
    await runGeoAuditForAllPages(geoDeps());

    const detail = await loadProductDetail(productDeps(), RICH_PRODUCT);
    if (detail.status !== 'ready') throw new Error('expected ready');
    expect(detail.row.geoScore).not.toBeNull();
    expect(detail.row.geoStale).toBe(false);

    await saveProductSeo(productDeps(), RICH_PRODUCT, VALID_EDIT);

    const stale = await loadProductDetail(productDeps(), RICH_PRODUCT);
    if (stale.status !== 'ready') throw new Error('expected ready');
    expect(stale.row.geoStale).toBe(true);
  });
});

describe('failure handling', () => {
  it('returns error when the state cannot be read', async () => {
    const state = await loadGeoOverview({
      state: {
        ...createFailingStateRepository(buildDemoSeedState()),
        load: () => Promise.reject(new Error('Storage exploded.')),
      },
    });
    expect(state.status).toBe('error');
  });

  it('returns not-found for an unknown page id', async () => {
    expect((await loadGeoPage(geoDeps(), 'snap_nope')).status).toBe('not-found');
  });
});

describe('catalogue coverage', () => {
  it('gives a spread of readiness bands across the demo catalogue', async () => {
    await runGeoAuditForAllPages(geoDeps());
    const state = await loadGeoOverview(geoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const bands = new Set(state.rows.map((row) => row.readiness.label));
    // A model that gave every page the same band would not be telling us much.
    expect(bands.size).toBeGreaterThanOrEqual(3);
  });

  it('scores every audited page within 0–100', async () => {
    await runGeoAuditForAllPages(geoDeps());
    const state = await loadGeoOverview(geoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.rows) {
      const score = row.audit?.score;
      if (score === null || score === undefined) continue;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
