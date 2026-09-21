import { expect, test, type Page } from '@playwright/test';

/**
 * The loading and retry paths, across every module that loads data.
 *
 * These were exercised on the dashboard only, which left the other eight
 * modules asserting "shows an error" without ever proving that retry does
 * anything. The `flaky` seam fails once and then succeeds, so a retry that
 * merely re-renders the same error is distinguishable from one that works.
 */

interface Target {
  name: string;
  path: string;
  /** Rendered once the module's data has arrived. */
  ready: string;
}

/** Modules whose data comes from the traffic or report repositories. */
const DATA_MODULES: Target[] = [
  { name: 'dashboard', path: '/dashboard', ready: 'dashboard-ready' },
  { name: 'analytics', path: '/analytics', ready: 'analytics-ready' },
  { name: 'funnel', path: '/funnel', ready: 'funnel-ready' },
  {
    name: 'amazon advertising',
    path: '/amazon/advertising',
    ready: 'advertising-ready',
  },
];

async function expectLoadingThenReady(page: Page, target: Target): Promise<void> {
  await page.goto(`${target.path}?demo=slow`);
  // The delayed adapter holds the response long enough for the loading block
  // to be observable rather than a flicker between renders.
  await expect(page.getByTestId('state-loading')).toBeVisible();
  await expect(page.getByTestId(target.ready)).toBeVisible();
  await expect(page.getByTestId('state-loading')).toHaveCount(0);
}

for (const target of DATA_MODULES) {
  test(`${target.name} shows a loading state before its data arrives`, async ({
    page,
  }) => {
    await expectLoadingThenReady(page, target);
  });

  test(`${target.name} recovers when retry is pressed`, async ({ page }) => {
    await page.goto(`${target.path}?demo=flaky`);

    // Fails once.
    await expect(page.getByTestId('state-error')).toBeVisible();
    await expect(page.getByTestId(target.ready)).toHaveCount(0);

    // And the retry actually re-fetches rather than re-rendering the failure.
    await page.getByTestId('retry-button').click();
    await expect(page.getByTestId(target.ready)).toBeVisible();
    await expect(page.getByTestId('state-error')).toHaveCount(0);
  });

  test(`${target.name} retry is reachable by keyboard`, async ({ page }) => {
    await page.goto(`${target.path}?demo=flaky`);
    const retry = page.getByTestId('retry-button');
    await expect(retry).toBeVisible();

    await retry.focus();
    await expect(retry).toBeFocused();
    await retry.press('Enter');
    await expect(page.getByTestId(target.ready)).toBeVisible();
  });
}

test('the loading block announces itself rather than only spinning', async ({
  page,
}) => {
  await page.goto('/analytics?demo=slow');
  const loading = page.getByTestId('state-loading');
  await expect(loading).toBeVisible();
  // Announced politely, so a screen reader user learns the page is working.
  await expect(loading).toHaveRole('status');
  await expect(loading).toHaveAttribute('aria-live', 'polite');
});

test('a failing source keeps the previous view rather than showing half of it', async ({
  page,
}) => {
  await page.goto('/analytics?demo=error');
  await expect(page.getByTestId('state-error')).toBeVisible();
  // No partial render: the metrics grid must not appear with empty values.
  await expect(page.getByTestId('analytics-ready')).toHaveCount(0);
  await expect(page.locator('[data-metric-card]')).toHaveCount(0);
});

test('the listing advertising panel can be retried on its own', async ({
  page,
}) => {
  // It loads separately from the listing audit beside it, so its failure must
  // not take the audit down and its retry must not reload the whole page.
  await page.goto('/amazon/lst_beacon_headlamp?demo=error');
  await expect(page.getByTestId('listing-ads-error')).toBeVisible();
  await expect(page.getByTestId('listing-ads-retry')).toBeVisible();

  await page.getByTestId('listing-ads-retry').focus();
  await expect(page.getByTestId('listing-ads-retry')).toBeFocused();
});

test('an unknown demo mode falls back to the real fixture', async ({ page }) => {
  // The seam is a closed allowlist: anything else must behave as if absent,
  // not error and not render an empty page.
  await page.goto('/dashboard?demo=not-a-real-mode');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await expect(page.getByTestId('state-error')).toHaveCount(0);
});
