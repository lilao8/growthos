import { expect, test, type Page } from '@playwright/test';

/**
 * Recommendations: filtering, evidence, completion, persistence and undo, plus
 * the deep links out to the module each finding came from.
 */

function cards(page: Page) {
  return page.locator('[data-testid^="rec-"][data-source]');
}

async function runBothAudits(page: Page): Promise<void> {
  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await page.goto('/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);
}

test('aggregates findings from every module once the audits have run', async ({
  page,
}) => {
  await runBothAudits(page);
  await page.goto('/recommendations');
  await expect(page.getByTestId('recommendations-ready')).toBeVisible();
  await expect(cards(page).first()).toBeVisible();

  for (const source of ['seo', 'geo', 'content', 'funnel']) {
    await expect(
      page.locator(`[data-source="${source}"]`).first(),
      `expected a ${source} recommendation`,
    ).toBeVisible();
  }
});

test('says which modules are reporting nothing rather than staying blank', async ({
  page,
}) => {
  await page.goto('/recommendations');
  await expect(page.getByTestId('recommendations-ready')).toBeVisible();

  // No audit has run in this browser, so SEO and GEO legitimately contribute
  // nothing — and the page says so instead of implying a clean bill of health.
  await expect(page.getByText(/produced no findings/i)).toBeVisible();
  await expect(
    page.getByText(/not the same as a clean bill of health/i),
  ).toBeVisible();
});

test('shows the counts, the evidence and the estimate behind each item', async ({
  page,
}) => {
  await runBothAudits(page);
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  await expect(page.getByTestId('rec-open-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('rec-critical-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('rec-quick-wins-value')).toHaveText(/^[\d,]+$/);
  await expect(page.getByTestId('rec-done-value')).toHaveText('0');

  const first = cards(page).first();
  await expect(first).toContainText('Suggested action:');
  await expect(first).toContainText('Evidence:');
  await expect(first).toContainText(/Impact \d\/5 · Effort \d\/5/);
});

test('states that impact and effort are estimates, not promises', async ({
  page,
}) => {
  await page.goto('/recommendations');
  await expect(page.getByTestId('recommendations-ready')).toBeVisible();

  await expect(page.getByText(/never a promise of revenue/i)).toBeVisible();
  await expect(page.getByText(/1–5 estimates/i)).toBeVisible();
  await expect(
    page.getByText(/Nothing is recalculated here/i),
  ).toBeVisible();
});

test('filters by source and by priority, and clearing restores the list', async ({
  page,
}) => {
  await runBothAudits(page);
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();
  const total = await cards(page).count();

  await page.getByTestId('rec-filter-source-seo').click();
  await expect(cards(page).first()).toBeVisible();
  const seoOnly = await cards(page).count();
  expect(seoOnly).toBeLessThan(total);
  expect(await page.locator('[data-source="geo"]').count()).toBe(0);

  await page.getByTestId('rec-filter-priority-critical').click();
  await expect(page.locator('[data-priority="Low"]')).toHaveCount(0);

  await page.getByTestId('rec-clear-filters').click();
  await expect(cards(page)).toHaveCount(total);
  await expect(page.getByTestId('rec-clear-filters')).toBeDisabled();
});

test('an impossible filter combination is explained, not silently empty', async ({
  page,
}) => {
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  await page.getByTestId('rec-filter-source-seo').click();
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
});

test('marking done persists across a refresh, and can be undone', async ({
  page,
}) => {
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  expect(id).not.toBeNull();
  const recId = (id ?? '').replace(/^rec-/, '');

  await page.getByTestId(`rec-toggle-${recId}`).click();
  await expect(page.getByTestId('rec-message')).toContainText(/survives a refresh/i);
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  await page.reload();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');
  await expect(page.getByTestId(`rec-${recId}`)).toHaveAttribute(
    'data-status',
    'Done',
  );

  await page.getByTestId(`rec-toggle-${recId}`).click();
  await expect(page.getByTestId('rec-message')).toContainText(/back to open/i);
  await page.reload();
  await expect(page.getByTestId('rec-done-value')).toHaveText('0');
  await expect(page.getByTestId(`rec-${recId}`)).toHaveAttribute(
    'data-status',
    'Open',
  );
});

test('a completed task survives running the audits afterwards', async ({ page }) => {
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-toggle-${recId}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  await runBothAudits(page);

  await page.goto('/recommendations');
  await expect(page.getByTestId(`rec-${recId}`)).toHaveAttribute(
    'data-status',
    'Done',
  );
});

test('filtering by status finds the completed task', async ({ page }) => {
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-toggle-${recId}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  await page.getByTestId('rec-filter-status-done').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute('data-status', 'Done');
});

test('a page-level finding deep links to its audit and to its product', async ({
  page,
}) => {
  await runBothAudits(page);
  await page.goto('/recommendations');
  await page.getByTestId('rec-filter-source-seo').click();
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');

  await page.getByTestId(`rec-product-${recId}`).click();
  await expect(page).toHaveURL(/\/products\/prd_/);

  await page.goBack();
  await page.getByTestId(`rec-link-${recId}`).click();
  await expect(page).toHaveURL(/\/seo\/snap_/);
});

test('a funnel finding links to the funnel module', async ({ page }) => {
  await page.goto('/recommendations');
  await page.getByTestId('rec-filter-source-funnel').click();
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${recId}`).click();
  await expect(page).toHaveURL(/\/funnel$/);
});

test('a content finding links to the idea it is about', async ({ page }) => {
  await page.goto('/recommendations');
  await page.getByTestId('rec-filter-source-content').click();
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${recId}`).click();
  await expect(page).toHaveURL(/\/content\/idea_/);
});

test('the same rule on two pages stays two separate tasks', async ({ page }) => {
  await runBothAudits(page);
  await page.goto('/recommendations');
  await page.getByTestId('rec-filter-source-seo').click();
  await expect(cards(page).first()).toBeVisible();

  const ids = await cards(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')),
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBeGreaterThan(5);
});

test('a failing source offers a retry', async ({ page }) => {
  await page.goto('/recommendations?demo=error');
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();
  await page.getByTestId('rec-filter-source-funnel').click();
  await expect(cards(page).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
