import { expect, test, type Page } from '@playwright/test';

/**
 * Analytics: range switching, reconciliation on screen, the N/A paths for CAC
 * and ROAS, and the text alternatives that carry every chart's data.
 */

const CHANNEL_TABLE = 'Channel performance for the selected range';
const DAILY_TABLE = 'Sessions, orders and revenue by day';

function rowsIn(page: Page, caption: string) {
  return page.locator(`table:has(caption:text-is("${caption}")) tbody tr`);
}

async function numberFrom(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText();
  return Number(text.replace(/[^0-9.]/g, ''));
}

test('shows the eight headline metrics for the default range', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  await expect(page.getByTestId('analytics-sessions-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('analytics-users-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('analytics-revenue-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('analytics-orders-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('analytics-cvr-value')).toHaveText(/^\d+\.\d{2}%$/);
  await expect(page.getByTestId('analytics-aov-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('analytics-cac-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('analytics-roas-value')).toHaveText(/^\d+\.\d{2}x$/);

  await expect(page.getByTestId('analytics-window')).toHaveText(
    '2026-06-03 — 2026-08-31 · 90 days · UTC',
  );
});

test('channel sessions, orders and revenue reconcile to the site total on screen', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  const channels = [
    'Organic Search',
    'Direct',
    'Paid Search',
    'Meta',
    'Email',
    'TikTok',
    'Referral',
    'AI Referral',
  ];

  let sessions = 0;
  let orders = 0;
  for (const channel of channels) {
    sessions += await numberFrom(page, `sessions-${channel}`);
    orders += await numberFrom(page, `orders-${channel}`);
  }

  expect(sessions).toBe(await numberFrom(page, 'total-sessions'));
  expect(orders).toBe(await numberFrom(page, 'total-orders'));
});

test('users are de-duplicated, so the site total is below the sessions count', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  const users = await numberFrom(page, 'total-users');
  const sessions = await numberFrom(page, 'total-sessions');
  expect(users).toBeLessThan(sessions);

  await expect(
    page.getByText(/Users do not add up across channels/i),
  ).toBeVisible();
});

test('earned channels show N/A for ROAS rather than zero or infinity', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  for (const channel of ['Organic Search', 'Direct', 'Email', 'AI Referral']) {
    await expect(page.getByTestId(`roas-${channel}`)).toHaveText('N/A');
  }
  for (const channel of ['Paid Search', 'Meta', 'TikTok']) {
    await expect(page.getByTestId(`roas-${channel}`)).toHaveText(/^\d+\.\d{2}x$/);
  }
});

test('Email has a CAC but no ROAS, and the page explains a zero CAC', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  await expect(page.getByTestId('cac-Email')).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId('roas-Email')).toHaveText('N/A');

  await expect(page.getByTestId('cac-Organic Search')).toHaveText('$0.00');
  await expect(page.getByText(/A CAC of \$0.00 does not mean free/i)).toBeVisible();
});

test('switching the range updates every view together', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  const sessions90 = await numberFrom(page, 'total-sessions');
  expect(await rowsIn(page, DAILY_TABLE).count()).toBe(90);

  await page.getByTestId('range-7').click();
  await expect(page.getByTestId('analytics-window')).toHaveText(
    '2026-08-25 — 2026-08-31 · 7 days · UTC',
  );
  await expect(rowsIn(page, DAILY_TABLE)).toHaveCount(7);

  const sessions7 = await numberFrom(page, 'total-sessions');
  expect(sessions7).toBeLessThan(sessions90);
  // The headline card moved with the table.
  expect(await numberFrom(page, 'analytics-sessions-value')).toBe(sessions7);

  await page.getByTestId('range-30').click();
  await expect(rowsIn(page, DAILY_TABLE)).toHaveCount(30);
  const sessions30 = await numberFrom(page, 'total-sessions');
  expect(sessions30).toBeGreaterThan(sessions7);
  expect(sessions30).toBeLessThan(sessions90);
});

test('the selected range is announced through aria-pressed', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('range-90')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('range-7')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('range-7').click();
  await expect(page.getByTestId('range-7')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('range-90')).toHaveAttribute('aria-pressed', 'false');
});

test('every chart has a text summary and a data table', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  await expect(page.getByTestId('trend-chart')).toBeVisible();
  await expect(page.getByTestId('trend-summary')).toContainText(/Busiest day/);

  // The full daily data is one disclosure away, not replaced by the picture.
  await page.getByTestId('daily-table-toggle').click();
  await expect(rowsIn(page, DAILY_TABLE).first()).toBeVisible();

  await expect(page.getByTestId('bar-chart')).toBeVisible();
  await expect(page.getByTestId('channel-summary')).toContainText(/leads with/);
  await expect(rowsIn(page, CHANNEL_TABLE)).toHaveCount(9); // 8 channels + total

  // Rates built on very few orders are flagged rather than presented as settled.
  await expect(page.getByTestId('low-volume-TikTok')).toBeVisible();
  await expect(page.getByTestId('low-volume-Organic Search')).toHaveCount(0);

  // The chart points at its summary, so a screen reader gets the numbers.
  await expect(page.getByTestId('trend-chart')).toHaveAttribute(
    'aria-describedby',
    'trend-summary',
  );
});

test('AI referral sources sum to the channel total and state the undercount', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  expect(await numberFrom(page, 'ai-source-total')).toBe(
    await numberFrom(page, 'sessions-AI Referral'),
  );

  await expect(page.getByTestId('ai-limitation')).toContainText(/undercounts/i);
  await expect(page.getByTestId('ai-limitation')).toContainText(
    /not a count of how often an AI system mentioned the brand/i,
  );
});

test('the dashboard and analytics report identical figures', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();
  const sessions = await page.getByTestId('analytics-sessions-value').innerText();
  const revenue = await page.getByTestId('analytics-revenue-value').innerText();
  const cvr = await page.getByTestId('analytics-cvr-value').innerText();
  const cac = await page.getByTestId('analytics-cac-value').innerText();
  const roas = await page.getByTestId('analytics-roas-value').innerText();

  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await expect(page.getByTestId('metric-sessions-value')).toHaveText(sessions);
  await expect(page.getByTestId('metric-revenue-value')).toHaveText(revenue);
  await expect(page.getByTestId('metric-conversion-rate-value')).toHaveText(cvr);
  await expect(page.getByTestId('metric-cac-value')).toHaveText(cac);
  await expect(page.getByTestId('metric-roas-value')).toHaveText(roas);
});

test('the dashboard links through to analytics', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();
  await page.getByTestId('dashboard-analytics-link').click();
  await expect(page).toHaveURL(/\/analytics$/);
});

test('an empty data source is explained rather than shown as zeros', async ({
  page,
}) => {
  await page.goto('/analytics?demo=empty');
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No sessions in this range')).toBeVisible();
  await expect(page.getByTestId('analytics-ready')).toHaveCount(0);
});

test('a failing data source offers a retry', async ({ page }) => {
  await page.goto('/analytics?demo=error');
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
  // The range picker stays usable so the page is not a dead end.
  await expect(page.getByTestId('range-30')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();
  await page.getByTestId('range-7').click();
  await expect(rowsIn(page, DAILY_TABLE)).toHaveCount(7);

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on analytics at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
