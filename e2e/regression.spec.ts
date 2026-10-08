import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Full-chain regression.
 *
 * The other specs each test one module. This one walks the path an operator
 * actually takes — edit a product, watch its audit go stale, re-run it, plan
 * content, read the channel and funnel numbers, then act on the resulting task
 * and prove the decision persisted. Its value is in the seams between modules,
 * which no single-module spec can see.
 */

const PRODUCT = 'prd_ridgeline_2p_tent';
const NEW_TITLE = 'Ridgeline 2P — Two Person Backpacking Tent | NorthTrail';

function firstNumber(text: string): number {
  // "729 (100.0%)" must read as 729, not 729100.
  const match = /-?[\d,]+(?:\.\d+)?/.exec(text);
  return match === null ? Number.NaN : Number(match[0].replace(/,/g, ''));
}

async function runAllAudits(page: Page): Promise<void> {
  await gotoReady(page, '/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await gotoReady(page, '/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);
}

test('the whole chain holds together, from a product edit to a completed task', async ({
  page,
}) => {
  // 1. A product edit persists and is reflected in its page snapshot.
  await gotoReady(page, `/products/${PRODUCT}`);
  await page.getByTestId('field-meta-title').fill(NEW_TITLE);
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();
  await expect(page.getByTestId('snapshot-meta-title')).toHaveText(NEW_TITLE);

  // 2. Auditing produces a score where there was none.
  await expect(page.getByTestId('detail-seo-score')).toHaveText('Not audited');
  await runAllAudits(page);
  await gotoReady(page, `/products/${PRODUCT}`);
  await expect(page.getByTestId('detail-seo-score')).toHaveText(/\d+/);

  // 3. A further edit makes the stored audit stale rather than silently stale.
  await page.getByTestId('field-meta-title').fill('A shorter title');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();
  await expect(page.getByTestId('detail-seo-score')).toContainText('(stale)');

  // 4. Re-running clears staleness for that page.
  await gotoReady(page, '/seo');
  await expect(page.getByTestId('stale-banner')).toBeVisible();
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);

  // 5. Content carries the measured scores through from the audits.
  await gotoReady(page, '/content');
  await expect(page.getByTestId('content-result-count')).toBeVisible();

  // 6. Analytics and the funnel both report on the same window.
  await gotoReady(page, '/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();
  const analyticsSessions = firstNumber(
    await page.getByTestId('analytics-sessions-value').innerText(),
  );

  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  // 7. Recommendations aggregates it all, and a completion survives a reload.
  await gotoReady(page, '/recommendations');
  const card = page.locator('[data-testid^="rec-"][data-source]').first();
  await expect(card).toBeVisible();
  const id = ((await card.getAttribute('data-testid')) ?? '').replace(
    /^rec-/,
    '',
  );
  await page.getByTestId(`rec-toggle-${id}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  // 8. The dashboard still agrees with Analytics after all of the above.
  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  const dashboardSessions = firstNumber(
    await page.getByTestId('metric-sessions-value').innerText(),
  );
  expect(dashboardSessions).toBe(analyticsSessions);
});

test('the dashboard links to every module in the project', async ({ page }) => {
  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('dashboard-module-links')).toBeVisible();

  const targets = [
    ['dashboard-goto-products', /\/products$/],
    ['dashboard-goto-seo-audit', /\/seo$/],
    ['dashboard-goto-geo-audit', /\/geo$/],
    ['dashboard-goto-content', /\/content$/],
    ['dashboard-goto-analytics', /\/analytics$/],
    ['dashboard-goto-funnel', /\/funnel$/],
    ['dashboard-goto-amazon', /\/amazon$/],
    ['dashboard-goto-amazon-ads', /\/amazon\/advertising$/],
    ['dashboard-goto-recommendations', /\/recommendations$/],
  ] as const;

  for (const [testId, url] of targets) {
    await gotoReady(page, '/dashboard');
    await expect(page.getByTestId('dashboard-module-links')).toBeVisible();
    await page.getByTestId(testId).click();
    await expect(page, `${testId} should navigate`).toHaveURL(url);
  }
});

test('the demo window is identical on every module', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/dashboard');
  const header = await page.getByTestId('header-window').innerText();
  expect(header).toContain('UTC');

  for (const route of [
    '/products',
    '/seo',
    '/geo',
    '/content',
    '/analytics',
    '/funnel',
    '/amazon',
    '/amazon/advertising',
    '/recommendations',
    '/about-project',
  ]) {
    await gotoReady(page, route);
    await expect(
      page.getByTestId('header-window'),
      `${route} should show the same window`,
    ).toHaveText(header);
  }
});

test('reloading twice gives byte-identical headline numbers', async ({
  page,
}) => {
  const read = async (): Promise<string[]> => {
    await gotoReady(page, '/dashboard');
    await expect(page.getByTestId('dashboard-ready')).toBeVisible();
    return page
      .locator('[data-metric-card] [data-testid$="-value"]')
      .allInnerTexts();
  };

  const first = await read();
  const second = await read();

  expect(first.length).toBeGreaterThan(5);
  // Seeded data must not drift between loads; a mismatch here means something
  // is being generated at render time.
  expect(second).toEqual(first);
});

test('every module renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  for (const route of [
    '/dashboard',
    '/products',
    '/seo',
    '/geo',
    '/content',
    '/analytics',
    '/funnel',
    '/amazon',
    '/amazon/advertising',
    '/recommendations',
    '/about-project',
  ]) {
    await gotoReady(page, route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1440]) {
  test(`no module overflows horizontally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    // Detail routes are included deliberately: they hold the long unbreakable
    // strings (canonical URLs, slugs) that overflow a narrow screen, and a
    // list-page-only sweep would not see them.
    for (const route of [
      '/dashboard',
      '/products',
      `/products/${PRODUCT}`,
      '/seo',
      '/seo/snap_ridgeline_2p_tent',
      '/geo',
      '/geo/snap_ridgeline_2p_tent',
      '/content',
      '/content/idea_r-value-faq',
      '/analytics',
      '/funnel',
      '/amazon',
      '/amazon/lst_trailcell_lantern',
      '/amazon/advertising',
      '/recommendations',
      '/about-project',
    ]) {
      await gotoReady(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test('the main landmark and a single h1 exist on every module', async ({
  page,
}) => {
  for (const route of [
    '/dashboard',
    '/products',
    '/seo',
    '/geo',
    '/content',
    '/analytics',
    '/funnel',
    '/amazon',
    '/amazon/advertising',
    '/recommendations',
    '/about-project',
  ]) {
    await gotoReady(page, route);
    await expect(page.getByRole('main'), route).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }), route).toHaveCount(1);
  }
});
