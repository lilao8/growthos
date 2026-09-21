import { expect, test, type Page } from '@playwright/test';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Screenshot capture for the README and the portfolio write-up.
 *
 * This is not part of the test suite — it lives outside `e2e/` and runs under
 * its own config, because its job is to produce files rather than to assert.
 * It still asserts that each page reached a ready state before capturing, so a
 * broken page cannot quietly become a screenshot of a spinner.
 *
 * Run with: npm run screenshots
 */

const OUT = path.resolve('docs/screenshots');

const WIDE = { width: 1440, height: 900 } as const;
const PHONE = { width: 375, height: 812 } as const;

/** Everything this run wrote, so the prune step knows what to keep. */
const written = new Set<string>();

async function shoot(
  page: Page,
  name: string,
  { fullPage = true }: { fullPage?: boolean } = {},
): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  written.add(`${name}.png`);
}

/** Scores only exist once an audit has been run, so run them all first. */
async function runAudits(page: Page): Promise<void> {
  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await page.goto('/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);
  await page.goto('/amazon');
  await page.getByTestId('run-all-listing-audits').click();
  await expect(page.getByTestId('run-all-listing-message')).toContainText(
    /Audited/,
  );
}

test('capture the demo path', async ({ page }) => {
  test.slow();
  await page.setViewportSize(WIDE);
  await runAudits(page);

  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await expect(page.getByTestId('seo-health-score-value')).toHaveText(/^\d+$/);
  await shoot(page, '01-dashboard');

  await page.goto('/products');
  await expect(page.getByTestId('result-count')).toBeVisible();
  await shoot(page, '02-products');

  await page.goto('/products/prd_ridgeline_2p_tent');
  await expect(page.getByTestId('detail-sku')).toBeVisible();
  await shoot(page, '03-product-detail');

  await page.goto('/seo');
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText(/^\d+$/);
  await shoot(page, '04-seo-overview');

  await page.goto('/seo/snap_summit_20_bag');
  await expect(page.getByTestId('check-meta-title-present')).toBeVisible();
  await shoot(page, '05-seo-page-detail');

  await page.goto('/geo');
  await expect(page.getByTestId('geo-metric-score-value')).toHaveText(/^\d+$/);
  await shoot(page, '06-geo-overview');

  await page.goto('/geo/snap_summit_20_bag');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, '07-geo-page-detail');

  await page.goto('/content');
  await expect(page.getByTestId('content-result-count')).toBeVisible();
  await shoot(page, '08-content-planner');

  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();
  await shoot(page, '09-analytics');

  await page.goto('/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();
  await shoot(page, '10-funnel');

  await page.goto('/amazon');
  await expect(page.getByTestId('amazon-metric-score-value')).toHaveText(/^\d+$/);
  await shoot(page, '11-amazon-listings');

  // The suppressed listing: the most interesting one to look at, because its
  // audit explains why it is selling nothing.
  await page.goto('/amazon/lst_trailcell_lantern');
  await expect(page.getByTestId('listing-detail-score')).toHaveText(/^\d+$/);
  await shoot(page, '12-amazon-listing-detail');

  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();
  await expect(page.getByTestId('ad-metric-acos-value')).toHaveText(/%$/);
  // Viewport only: the full page carries a search term table dozens of rows
  // long, and the first screenful already shows the metrics and the notes.
  await shoot(page, '13-amazon-advertising', { fullPage: false });

  await page.goto('/recommendations');
  await expect(
    page.locator('[data-testid^="rec-"][data-source]').first(),
  ).toBeVisible();
  // Viewport only: a full-page shot of every open task is several megabytes
  // and shows nothing the first screenful does not.
  await shoot(page, '14-recommendations', { fullPage: false });

  await page.goto('/about-project');
  await expect(page.getByTestId('about-chain')).toBeVisible();
  await shoot(page, '15-about-project');
});

test('capture the mobile layout', async ({ page }) => {
  await page.setViewportSize(PHONE);

  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await shoot(page, '16-dashboard-375px');

  await page.getByTestId('menu-toggle').click();
  await expect(page.getByTestId('mobile-nav')).toBeVisible();
  await shoot(page, '17-mobile-navigation');
});

/**
 * Removes images this run did not write.
 *
 * Renaming or renumbering a shot would otherwise leave the old file behind,
 * and the directory would slowly fill with screenshots of pages that no longer
 * exist — worse than having none, because they still look current.
 *
 * Deliberately last rather than first: clearing the directory up front would
 * destroy a perfectly good set if a capture failed halfway through. This way a
 * failed run leaves the previous images untouched.
 */
test('prune screenshots this run did not write', async () => {
  expect(written.size).toBeGreaterThan(0);

  const existing = await readdir(OUT);
  const stale = existing.filter(
    (name) => name.endsWith('.png') && !written.has(name),
  );
  await Promise.all(stale.map((name) => unlink(path.join(OUT, name))));
});
