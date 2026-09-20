import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSeoOverview,
  loadSeoPage,
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
 * Audit persistence, staleness and the edit → snapshot → stale → re-run loop,
 * exercised against the real browser storage adapter.
 */

const NAMESPACE = 'growthos.test.seo';
const TENT_PAGE = 'snap_ridgeline_2p_tent';
const TENT_PRODUCT = 'prd_ridgeline_2p_tent';
const WORST_PAGE = 'snap_summit_20_bag';

let clock = 0;

function seoDeps(): SeoAuditDeps {
  return {
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    now: () => {
      clock += 1;
      return `2026-08-31T00:00:0${clock % 10}.000Z`;
    },
  };
}

function productDeps(): ProductServiceDeps {
  return {
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
    traffic: createFixtureTrafficRepository(),
  };
}

beforeEach(() => {
  localStorage.clear();
  clock = 0;
});

describe('before any audit has run', () => {
  it('reports every page as never audited with no score', async () => {
    const state = await loadSeoOverview(seoDeps());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    expect(state.rows.length).toBeGreaterThanOrEqual(15);
    expect(state.rows.every((row) => row.audit === null)).toBe(true);
    expect(state.portfolio.averageScore).toBeNull();
    expect(state.portfolio.pagesAudited).toBe(0);
    expect(state.portfolio.pagesCounted).toBe(0);
    expect(state.issues).toHaveLength(0);
  });

  it('shows no score on the product row either', async () => {
    const detail = await loadProductDetail(productDeps(), TENT_PRODUCT);
    if (detail.status !== 'ready') throw new Error('expected ready');
    expect(detail.row.seoScore).toBeNull();
    expect(detail.row.seoAudit).toBeNull();
  });
});

describe('running an audit', () => {
  it('persists a result for one page only', async () => {
    const result = await runSeoAuditForPage(seoDeps(), TENT_PAGE);
    expect(result).toEqual({ status: 'done', audited: 1 });

    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.portfolio.pagesAudited).toBe(1);
  });

  it('audits every page in one go', async () => {
    const result = await runSeoAuditForAllPages(seoDeps());
    expect(result.status).toBe('done');

    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.portfolio.pagesAudited).toBe(state.portfolio.pagesTotal);
    expect(state.portfolio.averageScore).not.toBeNull();
  });

  it('survives a reload, since the result is persisted', async () => {
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);

    // A fresh repository instance reads the same browser storage.
    const page = await loadSeoPage(seoDeps(), TENT_PAGE);
    if (page.status !== 'ready') throw new Error('expected ready');
    expect(page.row.audit).not.toBeNull();
    expect(page.row.audit?.ruleVersion).toBe('seo-1.0.0');
  });

  it('replaces the previous result instead of accumulating duplicates', async () => {
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);

    const raw = await seoDeps().state.load();
    expect(
      raw.state.auditResults.filter((item) => item.pageId === TENT_PAGE),
    ).toHaveLength(1);
  });

  it('gives a complete page a higher score than a neglected one', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const good = state.rows.find((row) => row.snapshot.id === TENT_PAGE);
    const bad = state.rows.find((row) => row.snapshot.id === WORST_PAGE);

    expect(good?.audit?.score).not.toBeNull();
    expect(bad?.audit?.score).not.toBeNull();
    expect(good?.audit?.score ?? 0).toBeGreaterThan(bad?.audit?.score ?? 100);
  });

  it('reports lower coverage on a page with uncaptured inputs', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const page = await loadSeoPage(seoDeps(), WORST_PAGE);
    if (page.status !== 'ready') throw new Error('expected ready');

    // The robots directive is unknown on this page, so coverage cannot be full.
    expect(page.row.audit?.coverage).toBeLessThan(1);
    expect(page.row.tally.unknown).toBeGreaterThan(0);
  });

  it('errors for a page that does not exist', async () => {
    const result = await runSeoAuditForPage(seoDeps(), 'snap_nope');
    expect(result.status).toBe('error');
  });

  it('reports a storage failure without claiming success', async () => {
    const result = await runSeoAuditForPage(
      { state: createFailingStateRepository(buildDemoSeedState()) },
      TENT_PAGE,
    );
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toMatch(/unavailable/i);
  });
});

describe('issue list', () => {
  it('names the page, rule, evidence and recommendation for every issue', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.issues.length).toBeGreaterThan(0);
    for (const issue of state.issues) {
      expect(issue.pageId).not.toBe('');
      expect(issue.productTitle).not.toBe('');
      expect(issue.check.ruleId).not.toBe('');
      expect(issue.check.recommendation).not.toBe('');
      expect(['error', 'warning']).toContain(issue.check.status);
    }
  });

  it('lists each finding once — no double counting across views', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const keys = state.issues.map((issue) => `${issue.pageId}:${issue.check.ruleId}`);
    expect(new Set(keys).size).toBe(keys.length);

    // The issue count and the portfolio tally describe the same findings.
    expect(state.issues.length).toBe(
      state.portfolio.tally.critical + state.portfolio.tally.warnings,
    );
  });

  it('sorts the most severe findings first', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    const order = ['critical', 'high', 'medium', 'low', 'info'];
    const ranks = state.issues.map((issue) => order.indexOf(issue.check.severity));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('excludes passes and unknowns from the issue list', async () => {
    await runSeoAuditForAllPages(seoDeps());
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(
      state.issues.some((issue) => issue.check.status === 'unknown'),
    ).toBe(false);
  });
});

describe('portfolio average', () => {
  it('counts only audited pages and says how many', async () => {
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);
    const state = await loadSeoOverview(seoDeps());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.portfolio.pagesCounted).toBe(1);
    expect(state.portfolio.pagesTotal).toBeGreaterThan(1);

    const page = await loadSeoPage(seoDeps(), TENT_PAGE);
    if (page.status !== 'ready') throw new Error('expected ready');
    // With one audited page the average is exactly that page's score, rather
    // than being dragged down by pages that were never checked.
    expect(state.portfolio.averageScore).toBe(page.row.audit?.score);
  });
});

describe('edit → snapshot → stale → re-run', () => {
  it('marks the audit stale after the product metadata changes', async () => {
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);

    const before = await loadSeoPage(seoDeps(), TENT_PAGE);
    if (before.status !== 'ready') throw new Error('expected ready');
    expect(before.row.audit?.stale).toBe(false);

    await saveProductSeo(productDeps(), TENT_PRODUCT, {
      primaryKeyword: 'two person tent',
      metaTitle: 'A completely different title for the Ridgeline tent page',
      metaDescription:
        'A rewritten description of the Ridgeline 2P, long enough to sit inside the project guideline for descriptions.',
    });

    const after = await loadSeoPage(seoDeps(), TENT_PAGE);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(true);
    // The stored verdict is untouched; only its currency changed.
    expect(after.row.audit?.score).toBe(before.row.audit?.score);
  });

  it('surfaces staleness on the product row and in the portfolio', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await saveProductSeo(productDeps(), TENT_PRODUCT, {
      primaryKeyword: 'two person tent',
      metaTitle: 'A completely different title for the Ridgeline tent page',
      metaDescription:
        'A rewritten description of the Ridgeline 2P, long enough to sit inside the project guideline for descriptions.',
    });

    const detail = await loadProductDetail(productDeps(), TENT_PRODUCT);
    if (detail.status !== 'ready') throw new Error('expected ready');
    expect(detail.row.seoStale).toBe(true);

    const overview = await loadSeoOverview(seoDeps());
    if (overview.status !== 'ready') throw new Error('expected ready');
    expect(overview.portfolio.pagesStale).toBe(1);
  });

  it('clears staleness when the audit is re-run, and grades the new content', async () => {
    await runSeoAuditForPage(seoDeps(), TENT_PAGE);
    await saveProductSeo(productDeps(), TENT_PRODUCT, {
      primaryKeyword: 'inflatable kayak',
      metaTitle: 'A completely different title for the Ridgeline tent page',
      metaDescription:
        'A rewritten description of the Ridgeline 2P, long enough to sit inside the project guideline for descriptions.',
    });

    await runSeoAuditForPage(seoDeps(), TENT_PAGE);

    const after = await loadSeoPage(seoDeps(), TENT_PAGE);
    if (after.status !== 'ready') throw new Error('expected ready');
    expect(after.row.audit?.stale).toBe(false);

    // The keyword no longer appears anywhere on the page, so that rule now fails.
    const keyword = after.row.audit?.checks.find(
      (check) => check.ruleId === 'keyword-usage',
    );
    expect(keyword?.status).toBe('error');
  });

  it('does not make other pages stale', async () => {
    await runSeoAuditForAllPages(seoDeps());
    await saveProductSeo(productDeps(), TENT_PRODUCT, {
      primaryKeyword: 'two person tent',
      metaTitle: 'A completely different title for the Ridgeline tent page',
      metaDescription:
        'A rewritten description of the Ridgeline 2P, long enough to sit inside the project guideline for descriptions.',
    });

    const other = await loadSeoPage(seoDeps(), WORST_PAGE);
    if (other.status !== 'ready') throw new Error('expected ready');
    expect(other.row.audit?.stale).toBe(false);
  });
});

describe('failure handling', () => {
  it('returns error, not empty, when the state cannot be read', async () => {
    const failing = createFailingStateRepository(buildDemoSeedState());
    const state = await loadSeoOverview({
      state: {
        ...failing,
        load: () => Promise.reject(new Error('Storage exploded.')),
      },
    });
    expect(state.status).toBe('error');
  });

  it('returns not-found for an unknown page id', async () => {
    const state = await loadSeoPage(seoDeps(), 'snap_nope');
    expect(state.status).toBe('not-found');
  });
});
