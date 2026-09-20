import { expect, test } from '@playwright/test';

/**
 * Dashboard: the six metrics, the data window, and the loading / empty / error
 * / retry states driven through the documented `?demo=` QA seam.
 */

const METRIC_IDS = [
  'metric-sessions',
  'metric-revenue',
  'metric-orders',
  'metric-conversion-rate',
  'metric-aov',
  'metric-organic-traffic',
] as const;

test('root redirects to the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
});

test('shows exactly the six Dispatch 1 metrics with real values', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();

  for (const id of METRIC_IDS) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // No seventh metric card has crept in from a later dispatch.
  await expect(page.locator('[data-metric-card]')).toHaveCount(6);

  await expect(page.getByTestId('metric-sessions-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('metric-revenue-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('metric-orders-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('metric-conversion-rate-value')).toHaveText(/^\d+\.\d{2}%$/);
  await expect(page.getByTestId('metric-aov-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('metric-organic-traffic-value')).toHaveText(/^[\d,]+$/);
});

test('organic traffic never exceeds total sessions', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();

  const toNumber = async (testId: string): Promise<number> => {
    const text = await page.getByTestId(testId).innerText();
    return Number(text.replace(/[^0-9.]/g, ''));
  };

  const sessions = await toNumber('metric-sessions-value');
  const organic = await toNumber('metric-organic-traffic-value');
  const orders = await toNumber('metric-orders-value');

  expect(organic).toBeLessThanOrEqual(sessions);
  expect(orders).toBeLessThanOrEqual(sessions);
  expect(sessions).toBeGreaterThan(0);
});

test('states the demo window and the demo-data framing', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByTestId('dashboard-window')).toHaveText(
    '2026-06-03 — 2026-08-31 · 90 days · UTC',
  );
  await expect(page.getByTestId('demo-data-badge')).toHaveText('Demo data');
  await expect(page.getByText(/not live results/i)).toBeVisible();
});

test('empty state explains itself instead of showing zeros as fact', async ({ page }) => {
  await page.goto('/dashboard?demo=empty');

  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No sessions in this window')).toBeVisible();
  await expect(page.locator('[data-metric-card]')).toHaveCount(0);
});

test('error state offers a retry that recovers when the source does', async ({ page }) => {
  // `flaky` fails the first load and succeeds afterwards.
  await page.goto('/dashboard?demo=flaky');

  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('state-error')).toHaveAttribute('role', 'alert');

  await page.getByTestId('retry-button').click();

  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await expect(page.getByTestId('state-error')).toHaveCount(0);
});

test('a persistent failure keeps showing the error after retry', async ({ page }) => {
  await page.goto('/dashboard?demo=error');

  await expect(page.getByTestId('state-error')).toBeVisible();
  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('dashboard-ready')).toHaveCount(0);
});

test('loading state is announced while data is in flight', async ({ page }) => {
  await page.goto('/dashboard?demo=slow');

  const loading = page.getByTestId('state-loading');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('role', 'status');

  await expect(page.getByTestId('dashboard-ready')).toBeVisible({ timeout: 15_000 });
});

test('an unknown demo mode falls back to the real fixture', async ({ page }) => {
  await page.goto('/dashboard?demo=nonsense');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  expect(errors).toEqual([]);
});
