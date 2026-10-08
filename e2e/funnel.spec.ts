import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Funnel: the five layers, the largest drop-off, the advice attached to each
 * step, and agreement with Analytics over the same range.
 */

const STEPS_TABLE = 'Stage conversion and drop-off between adjacent layers';

function rowsIn(page: Page, caption: string) {
  return page.locator(`table:has(caption:text-is("${caption}")) tbody tr`);
}

/** Reads the first number in a cell — stage cells read "5,170 (59.1%)". */
async function numberFrom(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText();
  const match = text.match(/[\d,]+/);
  return Number((match?.[0] ?? '0').replace(/,/g, ''));
}

test('shows five layers that only ever fall', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  const stages = [
    'stage-session',
    'stage-product_view',
    'stage-add_to_cart',
    'stage-checkout',
    'stage-purchase',
  ];

  const counts: number[] = [];
  for (const id of stages) {
    await expect(page.getByTestId(id)).toBeVisible();
    counts.push(await numberFrom(page, id));
  }

  for (let index = 1; index < counts.length; index += 1) {
    expect(counts[index] ?? 0).toBeLessThanOrEqual(counts[index - 1] ?? 0);
  }
  expect(counts[0]).toBeGreaterThan(0);
});

test('the step table chains together and can be checked by hand', async ({
  page,
}) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  await expect(rowsIn(page, STEPS_TABLE)).toHaveCount(4);

  const rows = rowsIn(page, STEPS_TABLE);
  const readRow = async (index: number): Promise<number[]> => {
    const cells = await rows.nth(index).locator('td').allInnerTexts();
    return cells.map((text) => Number(text.replace(/[^0-9.]/g, '')) || 0);
  };

  // Columns: in, out, conversion, drop-off, lost, note.
  for (let index = 1; index < 4; index += 1) {
    const previous = await readRow(index - 1);
    const current = await readRow(index);
    expect(current[0]).toBe(previous[1]); // this step's "in" is the last step's "out"
  }
});

test('highlights the largest drop-off and says how it was chosen', async ({
  page,
}) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  const banner = page.getByTestId('largest-drop-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Largest drop-off:');
  await expect(banner).toContainText(/Chosen by share lost, not by headcount/i);

  // The same step is marked in the table.
  await expect(page.getByTestId('largest-drop-badge')).toBeVisible();
});

test('the funnel matches analytics for the same range', async ({ page }) => {
  await gotoReady(page, '/analytics');
  await expect(page.getByTestId('analytics-ready')).toBeVisible();
  const sessions = await page.getByTestId('analytics-sessions-value').innerText();
  const orders = await page.getByTestId('analytics-orders-value').innerText();
  const cvr = await page.getByTestId('analytics-cvr-value').innerText();

  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();
  await expect(page.getByTestId('funnel-sessions-value')).toHaveText(sessions);
  await expect(page.getByTestId('funnel-purchases-value')).toHaveText(orders);
  await expect(page.getByTestId('funnel-overall-value')).toHaveText(cvr);
});

test('switching the range moves every layer together', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();
  const sessions90 = await numberFrom(page, 'stage-session');

  await page.getByTestId('funnel-range-7').click();
  await expect(page.getByTestId('funnel-window')).toHaveText(
    '2026-08-25 — 2026-08-31 · 7 days · UTC',
  );

  const sessions7 = await numberFrom(page, 'stage-session');
  expect(sessions7).toBeLessThan(sessions90);
  expect(await numberFrom(page, 'funnel-sessions-value')).toBe(sessions7);
});

test('advice is attached to the step it belongs to', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  // Checkout to purchase is below threshold in the demo data.
  await expect(
    page.getByTestId('funnel-rec-checkout->purchase:shipping-cost'),
  ).toBeVisible();
  await expect(
    page.getByTestId('funnel-rec-checkout->purchase:payment-methods'),
  ).toBeVisible();
  await expect(
    page.getByTestId('funnel-rec-checkout->purchase:trust-signals'),
  ).toBeVisible();

  // Product view to cart is the largest drop-off, so it is raised too.
  await expect(
    page.getByTestId('funnel-rec-product_view->add_to_cart:price-position'),
  ).toBeVisible();
  await expect(
    page.getByTestId('funnel-rec-product_view->add_to_cart:reviews-missing'),
  ).toBeVisible();
});

test('every item is framed as a hypothesis, not a diagnosis', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  const disclaimer = page.getByTestId('hypothesis-disclaimer');
  await expect(disclaimer).toContainText(/hypotheses to test, not diagnoses/i);
  await expect(disclaimer).toContainText(/It cannot show why/i);
  await expect(disclaimer).toContainText(/correlation as causation/i);
});

test('states the reason each step was raised', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  const belowThreshold = page.getByTestId(
    'funnel-rec-checkout->purchase:shipping-cost',
  );
  await expect(belowThreshold).toContainText(/against a .* threshold/i);

  const largestDrop = page.getByTestId(
    'funnel-rec-product_view->add_to_cart:price-position',
  );
  await expect(largestDrop).toContainText(/loses the largest share/i);
  await expect(largestDrop).toContainText(/not about underperformance/i);
});

test('shows the sample each rate rests on', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  await expect(
    page.getByTestId('funnel-rec-checkout->purchase:shipping-cost'),
  ).toContainText(/on [\d,]+ sessions/);
});

test('flags low confidence when the range shrinks the sample', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await page.getByTestId('funnel-range-7').click();
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  // Over seven days the checkout step has well under 60 sessions.
  const item = page.getByTestId('funnel-rec-checkout->purchase:shipping-cost');
  if ((await item.count()) > 0) {
    await expect(item).toContainText(/treat this as a prompt to look/i);
  }
});

test('explains that layers are sessions, not people or page views', async ({
  page,
}) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  await expect(
    page.getByText(/not page views, and not people/i).first(),
  ).toBeVisible();
  await expect(page.getByText(/de-duplicated sessions/i).first()).toBeVisible();
});

test('the dashboard carries the cart and checkout rates and links to the funnel', async ({
  page,
}) => {
  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('dashboard-ready')).toBeVisible();

  await expect(page.getByTestId('metric-add-to-cart-rate-value')).toHaveText(
    /^\d+\.\d{2}%$/,
  );
  await expect(page.getByTestId('metric-checkout-rate-value')).toHaveText(
    /^\d+\.\d{2}%$/,
  );
  await expect(page.getByTestId('dashboard-largest-drop')).toContainText(
    'Largest drop-off:',
  );
  await expect(page.getByTestId('dashboard-alerts')).toBeVisible();
  // The alert for the largest drop-off says it is about volume, not failure.
  await expect(
    page.getByTestId('dashboard-alert-product_view-add_to_cart'),
  ).toContainText(/about volume, not underperformance/i);
  await expect(
    page.getByTestId('dashboard-alert-checkout-purchase'),
  ).toContainText(/below the .* threshold/i);

  await page.getByTestId('dashboard-funnel-link').click();
  await expect(page).toHaveURL(/\/funnel$/);
});

test('the dashboard alert agrees with the funnel page', async ({ page }) => {
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();
  const banner = await page.getByTestId('largest-drop-banner').innerText();
  const step = banner.split('Largest drop-off: ')[1]?.split('.')[0] ?? '';
  expect(step.length).toBeGreaterThan(0);

  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('dashboard-largest-drop')).toContainText(step);
});

test('an empty source is explained rather than shown as zeros', async ({ page }) => {
  await page.goto('/funnel?demo=empty');
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No sessions in this range')).toBeVisible();
  await expect(page.getByTestId('funnel-ready')).toHaveCount(0);
});

test('a failing source offers a retry and keeps the range picker usable', async ({
  page,
}) => {
  await page.goto('/funnel?demo=error');
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
  await expect(page.getByTestId('funnel-range-30')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();
  await page.getByTestId('funnel-range-30').click();
  await expect(page.getByTestId('funnel-window')).toContainText('30 days');

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on the funnel at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoReady(page, '/funnel');
  await expect(page.getByTestId('funnel-ready')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
