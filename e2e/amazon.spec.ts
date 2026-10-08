import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Amazon listings: overview, audit run, detail, edit → stale → re-run, and the
 * channel-separation guarantee.
 */

const SUPPRESSED = 'lst_trailcell_lantern';
const CLEAN = 'lst_emberlite_stove';

async function runAll(page: Page): Promise<void> {
  await gotoReady(page, '/amazon');
  await page.getByTestId('run-all-listing-audits').click();
  await expect(page.getByTestId('run-all-listing-message')).toContainText(
    /Audited/,
  );
}

function rows(page: Page) {
  return page.locator('[data-testid^="listing-link-"]');
}

test('the overview lists every ASIN with no score before an audit', async ({
  page,
}) => {
  await gotoReady(page, '/amazon');
  await expect(page.getByTestId('amazon-overview')).toBeVisible();
  await expect(rows(page).first()).toBeVisible();

  expect(await rows(page).count()).toBeGreaterThanOrEqual(15);
  await expect(page.getByTestId('amazon-metric-score-value')).toHaveText('N/A');
  await expect(page.getByTestId('amazon-no-issues')).toContainText(
    /not the same as a clean catalogue/i,
  );
});

test('the suppressed count is known before any audit runs', async ({ page }) => {
  await gotoReady(page, '/amazon');
  await expect(page.getByTestId('amazon-metric-suppressed-value')).toHaveText('1');
});

test('running the audit produces scores and issues', async ({ page }) => {
  await runAll(page);

  await expect(page.getByTestId('amazon-metric-score-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('amazon-metric-critical-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('amazon-metric-warnings-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('amazon-no-issues')).toHaveCount(0);
});

test('it states its limits and that the channels are never mixed', async ({
  page,
}) => {
  await gotoReady(page, '/amazon');

  await expect(page.getByTestId('amazon-disclaimer').first()).toContainText(
    /never calls SP-API and never crawls/i,
  );
  await expect(page.getByTestId('amazon-disclaimer').first()).toContainText(
    /does not predict search rank/i,
  );
  await expect(
    page.getByTestId('channel-separation-note').first(),
  ).toContainText(/never added together/i);
});

test('a listing detail shows every check with its evidence', async ({ page }) => {
  await runAll(page);
  await gotoReady(page, `/amazon/${SUPPRESSED}`);
  await expect(page.getByTestId('listing-detail')).toBeVisible();

  await expect(page.getByTestId('listing-detail-score')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('listing-check-listing-status')).toBeVisible();
  await expect(
    page.getByTestId('listing-check-main-image-compliance'),
  ).toBeVisible();
  await expect(page.getByTestId('listing-check-backend-search-terms')).toBeVisible();
});

test('an unaudited listing says so rather than showing a zero', async ({
  page,
}) => {
  await gotoReady(page, `/amazon/${CLEAN}`);
  await expect(page.getByTestId('listing-detail-score')).toHaveText('Not audited');
});

test('editing a listing makes its audit stale, and re-running clears it', async ({
  page,
}) => {
  await runAll(page);
  await gotoReady(page, `/amazon/${CLEAN}`);
  await expect(page.getByTestId('listing-stale-notice')).toHaveCount(0);

  await page
    .getByTestId('listing-field-title')
    .fill('NorthTrail Emberlite Canister Stove, a rewritten title for this test');
  await page.getByTestId('save-listing').click();
  await expect(page.getByTestId('listing-save-success')).toBeVisible();
  await expect(page.getByTestId('listing-stale-notice')).toBeVisible();

  await page.getByTestId('run-listing-audit').click();
  await expect(page.getByTestId('run-listing-message')).toContainText(/re-run/i);
  await expect(page.getByTestId('listing-stale-notice')).toHaveCount(0);
});

test('an edit survives a reload', async ({ page }) => {
  const title =
    'NorthTrail Emberlite Canister Stove, a persisted title for this test case';
  await gotoReady(page, `/amazon/${CLEAN}`);
  await page.getByTestId('listing-field-title').fill(title);
  await page.getByTestId('save-listing').click();
  await expect(page.getByTestId('listing-save-success')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('listing-field-title')).toHaveValue(title);
});

test('backend terms are counted in bytes, and an over-budget value is refused', async ({
  page,
}) => {
  await gotoReady(page, `/amazon/${CLEAN}`);

  // 246 characters but 261 bytes: a character-based check would accept this.
  const overBudget =
    'chaqueta impermeable montaña senderismo cortavientos montañismo excursión impermeável técnica respirável capucha ajustável costuras seladas à prova d água corta-vento montanhismo caminhada trilha leve señora niño pequeño árbol otoño verão inverno';
  expect(overBudget.length).toBeLessThan(250);

  await page.getByTestId('listing-field-terms').fill(overBudget);
  await expect(page.getByTestId('listing-terms-bytes')).toContainText(
    /261 of 250 bytes/,
  );
  await expect(page.getByTestId('listing-terms-bytes')).toContainText(
    /Over the limit/i,
  );

  await page.getByTestId('save-listing').click();
  await expect(page.getByTestId('listing-field-terms-error')).toContainText(
    /bytes, not characters/i,
  );
  await expect(page.getByTestId('listing-save-success')).toHaveCount(0);
  // The input the user typed is still there.
  await expect(page.getByTestId('listing-field-terms')).toHaveValue(overBudget);
});

test('a failed save keeps the typed input and says nothing was saved', async ({
  page,
}) => {
  await page.goto(`/amazon/${CLEAN}?demo=storage-error`);
  await page.getByTestId('listing-field-title').fill('This will not be saved');
  await page.getByTestId('save-listing').click();

  await expect(page.getByTestId('listing-save-failure')).toContainText(
    /still here/i,
  );
  await expect(page.getByTestId('listing-save-success')).toHaveCount(0);
  await expect(page.getByTestId('listing-field-title')).toHaveValue(
    'This will not be saved',
  );
});

test('a listing links to its storefront product and back to the list', async ({
  page,
}) => {
  await gotoReady(page, `/amazon/${CLEAN}`);
  await page.getByTestId('listing-product-link').click();
  await expect(page).toHaveURL(/\/products\/prd_/);

  await page.goBack();
  await page.getByTestId('back-to-amazon').click();
  await expect(page).toHaveURL(/\/amazon$/);
});

test('an unknown listing id is reported, not crashed on', async ({ page }) => {
  const response = await page.goto('/amazon/lst_not_a_real_listing');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('listing-not-found')).toBeVisible();
});

test('Amazon findings reach the recommendations list', async ({ page }) => {
  await runAll(page);
  await gotoReady(page, '/recommendations');
  await page.getByTestId('rec-filter-source-amazon').click();
  await expect(
    page.locator('[data-source="amazon"]').first(),
  ).toBeVisible();

  // Scoped by category: the Amazon source now covers listing-quality AND
  // advertising tasks, so "first Amazon card" is no longer a listing task.
  const card = page
    .locator('[data-testid^="rec-"][data-category="Amazon listing"]')
    .first();
  await expect(card).toBeVisible();
  const id = ((await card.getAttribute('data-testid')) ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${id}`).click();
  await expect(page).toHaveURL(/\/amazon\/lst_/);
});

test('auditing listings does not move a single storefront number', async ({
  page,
}) => {
  const read = async (): Promise<string[]> => {
    await gotoReady(page, '/dashboard');
    await expect(page.getByTestId('dashboard-ready')).toBeVisible();
    return page
      .locator('[data-metric-card] [data-testid$="-value"]')
      .allInnerTexts();
  };

  const before = await read();
  await runAll(page);
  const after = await read();

  expect(after).toEqual(before);
});

test('a failing source offers a retry', async ({ page }) => {
  await page.goto('/amazon?demo=storage-error');
  // Reads succeed under this seam, so the page renders; the point is that it
  // does not claim a score it does not have.
  await expect(page.getByTestId('amazon-overview')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await gotoReady(page, '/amazon');
  await expect(rows(page).first()).toBeVisible();
  await gotoReady(page, `/amazon/${SUPPRESSED}`);
  await expect(page.getByTestId('listing-detail')).toBeVisible();

  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const route of ['/amazon', `/amazon/${SUPPRESSED}`]) {
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
