import { expect, test } from '@playwright/test';

/**
 * Dispatch 0 smoke path: the app boots, the start page renders real content
 * from the service layer, and the demo-data framing is visible. Module screens
 * do not exist yet and are shown as explicitly not implemented.
 */

test('start page boots and states the demo data window', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'GrowthOS', level: 1 })).toBeVisible();
  await expect(page.getByTestId('demo-data-badge')).toHaveText(
    /Demo data — fictional brand/,
  );
  await expect(page.getByTestId('demo-window')).toHaveText(
    '2026-06-03 to 2026-08-31 (90 days, UTC)',
  );
});

test('lists all eight modules as not yet implemented', async ({ page }) => {
  await page.goto('/');

  const modules = page.getByRole('heading', { name: 'Modules' });
  await expect(modules).toBeVisible();

  for (const name of [
    'Dashboard',
    'Products',
    'SEO Audit',
    'GEO Audit',
    'Content Planner',
    'Analytics',
    'Conversion Funnel',
    'Recommendations',
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('Not implemented yet', { exact: false })).toHaveCount(8);
});

test('states the heuristic limitation of SEO and GEO scores', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText(/internal heuristics/i),
  ).toBeVisible();
});

test('renders no console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GrowthOS', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
