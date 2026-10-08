import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Recommendations: filtering, evidence, completion, persistence and undo, plus
 * the deep links out to the module each finding came from.
 */

function cards(page: Page) {
  return page.locator('[data-testid^="rec-"][data-source]');
}

async function runBothAudits(page: Page): Promise<void> {
  await gotoReady(page, '/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await gotoReady(page, '/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);
}

test('aggregates findings from every module once the audits have run', async ({
  page,
}) => {
  await runBothAudits(page);
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
  await expect(cards(page).first()).toBeVisible();

  await page.getByTestId('rec-filter-source-seo').click();
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
});

test('marking done persists across a refresh, and can be undone', async ({
  page,
}) => {
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-toggle-${recId}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  await runBothAudits(page);

  await gotoReady(page, '/recommendations');
  await expect(page.getByTestId(`rec-${recId}`)).toHaveAttribute(
    'data-status',
    'Done',
  );
});

test('filtering by status finds the completed task', async ({ page }) => {
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
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
  await gotoReady(page, '/recommendations');
  await page.getByTestId('rec-filter-source-funnel').click();
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${recId}`).click();
  await expect(page).toHaveURL(/\/funnel$/);
});

test('a content finding links to the idea it is about', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  await page.getByTestId('rec-filter-source-content').click();
  await expect(cards(page).first()).toBeVisible();

  const id = await cards(page).first().getAttribute('data-testid');
  const recId = (id ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${recId}`).click();
  await expect(page).toHaveURL(/\/content\/idea_/);
});

test('the same rule on two pages stays two separate tasks', async ({ page }) => {
  await runBothAudits(page);
  await gotoReady(page, '/recommendations');
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

  await gotoReady(page, '/recommendations');
  await expect(cards(page).first()).toBeVisible();
  await page.getByTestId('rec-filter-source-funnel').click();
  await expect(cards(page).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoReady(page, '/recommendations');
  await expect(cards(page).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// Ignoring a finding
// ---------------------------------------------------------------------------

async function firstCardId(page: Page): Promise<string> {
  const card = page.locator('[data-testid^="rec-"][data-source]').first();
  await expect(card).toBeVisible();
  return ((await card.getAttribute('data-testid')) ?? '').replace(/^rec-/, '');
}

test('ignoring a finding requires choosing a reason first', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  // There is no way to ignore without going through the reason picker: the
  // button opens a form rather than acting immediately.
  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await expect(page.getByTestId(`rec-ignore-form-${id}`)).toBeVisible();
  await expect(page.getByTestId(`rec-ignore-reason-${id}`)).toBeVisible();
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute('data-status', 'Open');
});

test('cancelling the reason picker changes nothing', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page.getByTestId(`rec-ignore-cancel-${id}`).click();
  await expect(page.getByTestId(`rec-ignore-form-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute('data-status', 'Open');
});

test('an ignored finding stays listed, with its reason, across a reload', async ({
  page,
}) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);
  const openBefore = Number(
    (await page.getByTestId('rec-open-value').innerText()).replace(/,/g, ''),
  );

  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page
    .getByTestId(`rec-ignore-reason-${id}`)
    .selectOption('rule-disputed');
  await page.getByTestId(`rec-ignore-note-${id}`).fill('The rule misreads this page.');
  await page.getByTestId(`rec-ignore-confirm-${id}`).click();

  await expect(page.getByTestId('rec-message')).toContainText(/Set aside/i);
  await expect(page.getByTestId('rec-ignored-value')).toHaveText('1');

  await page.reload();
  // Still on the list — ignoring narrows the view, it does not delete.
  const card = page.getByTestId(`rec-${id}`);
  await expect(card).toHaveAttribute('data-status', 'Ignored');
  await expect(page.getByTestId(`rec-ignore-${id}`)).toContainText(
    'The rule is wrong in this case',
  );
  await expect(page.getByTestId(`rec-ignore-${id}`)).toContainText(
    'The rule misreads this page.',
  );

  const openAfter = Number(
    (await page.getByTestId('rec-open-value').innerText()).replace(/,/g, ''),
  );
  expect(openAfter).toBe(openBefore - 1);
});

/**
 * The counts in the header row all describe the same population.
 *
 * They previously did not: Open was status-scoped while Critical and Quick
 * wins counted the whole list, so closing every task left "Open 0" beside a
 * non-zero Critical. The row is read left to right as one set of numbers, so
 * that reads as a contradiction rather than as two different questions.
 */
test('closing a critical finding takes it out of the Critical count too', async ({
  page,
}) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  // Assert the fixture still puts a Critical finding first. Without this the
  // test would quietly stop exercising the behaviour if the ordering changed,
  // and would pass with the fix reverted.
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute(
    'data-priority',
    'Critical',
  );

  const countOf = async (testId: string): Promise<number> =>
    Number((await page.getByTestId(testId).innerText()).replace(/,/g, ''));

  const openBefore = await countOf('rec-open-value');
  const criticalBefore = await countOf('rec-critical-value');
  expect(criticalBefore).toBeGreaterThan(0);

  await page.getByTestId(`rec-toggle-${id}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  expect(await countOf('rec-open-value')).toBe(openBefore - 1);
  expect(await countOf('rec-critical-value')).toBe(criticalBefore - 1);

  // And the same after a reload, so this is the stored decision rather than
  // an optimistic update that a refresh would undo.
  await page.reload();
  expect(await countOf('rec-open-value')).toBe(openBefore - 1);
  expect(await countOf('rec-critical-value')).toBe(criticalBefore - 1);
});

test('no band in the header row can exceed the open count', async ({ page }) => {
  await gotoReady(page, '/recommendations');

  const countOf = async (testId: string): Promise<number> =>
    Number((await page.getByTestId(testId).innerText()).replace(/,/g, ''));

  const open = await countOf('rec-open-value');
  expect(await countOf('rec-critical-value')).toBeLessThanOrEqual(open);
  expect(await countOf('rec-quick-wins-value')).toBeLessThanOrEqual(open);
});

test('an ignored finding says nothing re-checks it automatically', async ({
  page,
}) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page.getByTestId(`rec-ignore-confirm-${id}`).click();
  await expect(page.getByTestId(`rec-ignore-${id}`)).toContainText(
    /Nothing re-checks this automatically/i,
  );
});

test('an ignored finding can be put back on the list', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page.getByTestId(`rec-ignore-confirm-${id}`).click();
  await expect(page.getByTestId('rec-ignored-value')).toHaveText('1');

  await page.getByTestId(`rec-reopen-${id}`).click();
  await expect(page.getByTestId('rec-message')).toContainText(/Back on the list/i);
  await page.reload();
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute('data-status', 'Open');
  await expect(page.getByTestId('rec-ignored-value')).toHaveText('0');
});

test('ignored findings can be filtered to', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page.getByTestId(`rec-ignore-confirm-${id}`).click();

  await page.getByTestId('rec-filter-status-ignored').click();
  await expect(page.locator('[data-testid^="rec-"][data-source]')).toHaveCount(1);
  await expect(page.getByTestId(`rec-${id}`)).toBeVisible();
});

test('the ignore flow is operable by keyboard alone', async ({ page }) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  const start = page.getByTestId(`rec-ignore-start-${id}`);
  await start.focus();
  await expect(start).toHaveAttribute('aria-expanded', 'false');
  await start.press('Enter');
  await expect(start).toHaveAttribute('aria-expanded', 'true');

  const select = page.getByTestId(`rec-ignore-reason-${id}`);
  await select.focus();
  await expect(select).toBeFocused();
  await select.selectOption('wont-fix');

  const confirm = page.getByTestId(`rec-ignore-confirm-${id}`);
  await confirm.focus();
  await confirm.press('Enter');
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute(
    'data-status',
    'Ignored',
  );
});

test('a done finding offers no ignore button, and vice versa', async ({
  page,
}) => {
  await gotoReady(page, '/recommendations');
  const id = await firstCardId(page);

  // Done and Ignored are alternatives, not a combination.
  await page.getByTestId(`rec-toggle-${id}`).click();
  await expect(page.getByTestId(`rec-${id}`)).toHaveAttribute('data-status', 'Done');
  await expect(page.getByTestId(`rec-ignore-start-${id}`)).toHaveCount(0);

  await page.getByTestId(`rec-toggle-${id}`).click();
  await page.getByTestId(`rec-ignore-start-${id}`).click();
  await page.getByTestId(`rec-ignore-confirm-${id}`).click();
  await expect(page.getByTestId(`rec-toggle-${id}`)).toHaveCount(0);
});
