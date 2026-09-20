import { expect, test, type Page } from '@playwright/test';

/**
 * Products: catalogue, search and filters, detail, and the SEO metadata edit
 * round trip including persistence across a reload.
 */

const TENT_ID = 'prd_ridgeline_2p_tent';

const VALID_TITLE = 'Ridgeline 2P — Two Person Tent For Backcountry Trips';
const VALID_DESCRIPTION =
  'A freestanding two-person backpacking tent at 3.9 lb with a 1800 mm rainfly and two vestibules, built for three-season use.';

function rows(page: Page) {
  return page.locator('tbody tr');
}

test('lists the whole catalogue with at least 15 SKUs', async ({ page }) => {
  await page.goto('/products');

  await expect(page.getByTestId('result-count')).toBeVisible();
  const count = await rows(page).count();
  expect(count).toBeGreaterThanOrEqual(15);

  await expect(page.getByRole('columnheader', { name: 'SKU' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Conv. rate' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Revenue' })).toBeVisible();
});

test('shows Not audited instead of a score, since no audit has run', async ({ page }) => {
  await page.goto('/products');
  await expect(rows(page).first()).toBeVisible();

  const notAudited = await page.getByText('Not audited', { exact: true }).count();
  const rowCount = await rows(page).count();
  // One for the SEO column and one for GEO, on every row.
  expect(notAudited).toBe(rowCount * 2);
});

test('search narrows the catalogue and tolerates case and spacing', async ({ page }) => {
  await page.goto('/products');
  const total = await rows(page).count();

  await page.getByTestId('product-search').fill('  RIDGELINE  ');
  await expect(rows(page)).not.toHaveCount(total);
  const narrowed = await rows(page).count();
  expect(narrowed).toBeGreaterThan(0);
  expect(narrowed).toBeLessThan(total);

  await expect(page.getByTestId('result-count')).toHaveText(
    `${narrowed} / ${total}`,
  );
});

test('search matches SKU as well as title', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('product-search').fill('NT-LGT-BCN4');

  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText('Beacon 400 Rechargeable Headlamp')).toBeVisible();
});

test('category and status filters intersect', async ({ page }) => {
  await page.goto('/products');

  await page.getByTestId('filter-category-tents-shelters').click();
  const tents = await rows(page).count();
  expect(tents).toBeGreaterThan(1);

  await page.getByTestId('filter-status-archived').click();
  await expect(page.getByTestId('filter-status-archived')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText('Trailhead 1P Tent')).toBeVisible();
});

test('an impossible combination shows an explained empty state', async ({ page }) => {
  await page.goto('/products');

  await page.getByTestId('product-search').fill('headlamp');
  await page.getByTestId('filter-category-cooking').click();

  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No products match these filters')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
});

test('clear filters restores the full catalogue', async ({ page }) => {
  await page.goto('/products');
  const total = await rows(page).count();

  await page.getByTestId('product-search').fill('tarp');
  await page.getByTestId('filter-status-active').click();
  await expect(rows(page)).toHaveCount(1);

  await page.getByTestId('clear-filters').click();

  await expect(rows(page)).toHaveCount(total);
  await expect(page.getByTestId('product-search')).toHaveValue('');
  await expect(page.getByTestId('clear-filters')).toBeDisabled();
});

test('opens a product from the list and shows its record', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('product-link-NT-TENT-RDG2').click();

  await expect(page).toHaveURL(new RegExp(`/products/${TENT_ID}$`));
  await expect(
    page.getByRole('heading', { name: 'Ridgeline 2P Backpacking Tent', level: 1 }),
  ).toBeVisible();

  await expect(page.getByTestId('detail-sku')).toHaveText('NT-TENT-RDG2');
  await expect(page.getByTestId('detail-price')).toHaveText('$329.00');
  await expect(page.getByTestId('detail-seo-score')).toHaveText('Not audited');
  await expect(page.getByTestId('detail-geo-score')).toHaveText('Not audited');
  await expect(page.getByTestId('detail-revenue')).toHaveText(/^\$[\d,]+\.\d{2}$/);
});

test('an unknown product id shows not found rather than an error', async ({ page }) => {
  const response = await page.goto('/products/prd_not_a_real_product');
  expect(response?.status()).toBe(200);

  await expect(page.getByTestId('product-not-found')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to all products' }),
  ).toBeVisible();
});

test('a valid SEO edit saves and survives a reload', async ({ page }) => {
  await page.goto(`/products/${TENT_ID}`);

  await page.getByTestId('field-primary-keyword').fill('two person tent');
  await page.getByTestId('field-meta-title').fill(VALID_TITLE);
  await page.getByTestId('field-meta-description').fill(VALID_DESCRIPTION);
  await page.getByTestId('save-seo').click();

  await expect(page.getByTestId('save-success')).toBeVisible();

  await page.reload();

  await expect(page.getByTestId('field-meta-title')).toHaveValue(VALID_TITLE);
  await expect(page.getByTestId('field-primary-keyword')).toHaveValue(
    'two person tent',
  );
  // The audit input moved with it.
  await expect(page.getByTestId('snapshot-meta-title')).toHaveText(VALID_TITLE);
});

test('the edit is visible back on the catalogue list', async ({ page }) => {
  await page.goto(`/products/${TENT_ID}`);
  await page.getByTestId('field-primary-keyword').fill('bivvy shelter');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();

  await page.goto('/products');
  await page.getByTestId('product-search').fill('bivvy shelter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText('Ridgeline 2P Backpacking Tent')).toBeVisible();
});

test('an invalid edit is rejected, keeps the input and writes nothing', async ({ page }) => {
  await page.goto(`/products/${TENT_ID}`);

  await page.getByTestId('field-primary-keyword').fill('keyword worth keeping');
  await page.getByTestId('field-meta-title').fill('   ');
  await page.getByTestId('save-seo').click();

  await expect(page.getByTestId('save-failure')).toBeVisible();
  await expect(page.getByTestId('field-meta-title-error')).toBeVisible();
  await expect(page.getByTestId('save-success')).toHaveCount(0);

  // Nothing typed was discarded.
  await expect(page.getByTestId('field-primary-keyword')).toHaveValue(
    'keyword worth keeping',
  );

  await page.reload();
  // And nothing was persisted.
  await expect(page.getByTestId('field-primary-keyword')).toHaveValue(
    '2 person backpacking tent',
  );
});

test('a storage failure is reported and the typed values are kept', async ({ page }) => {
  await page.goto(`/products/${TENT_ID}?demo=storage-error`);

  await page.getByTestId('field-primary-keyword').fill('will not save');
  await page.getByTestId('save-seo').click();

  await expect(page.getByTestId('save-failure')).toBeVisible();
  await expect(page.getByTestId('save-failure')).toContainText(/try again/i);
  await expect(page.getByTestId('field-primary-keyword')).toHaveValue(
    'will not save',
  );
});

test('the form is labelled and reachable by keyboard', async ({ page }) => {
  await page.goto(`/products/${TENT_ID}`);

  const keyword = page.getByLabel('Primary keyword');
  await expect(keyword).toBeVisible();
  await expect(page.getByLabel('Meta title')).toBeVisible();
  await expect(page.getByLabel('Meta description')).toBeVisible();

  await keyword.focus();
  await expect(keyword).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Meta title')).toBeFocused();
});

test('the catalogue reports a load failure with a retry', async ({ page }) => {
  await page.goto('/products?demo=error');

  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/products');
  await expect(rows(page).first()).toBeVisible();
  await page.getByTestId('product-link-NT-TENT-RDG2').click();
  await expect(page.getByTestId('detail-sku')).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on the catalogue at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/products');
  await expect(rows(page).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
