import { expect, test, type Page } from '@playwright/test';

/**
 * Amazon advertising: metrics, search terms, harvest and negation, and the
 * two separations this module exists to keep — search term versus target, and
 * Amazon versus storefront.
 */

const LOW_ORGANIC = 'lst_beacon_headlamp';
const NOT_ADVERTISED = 'lst_waypoint_compass';

function termRows(page: Page) {
  return page.locator('[data-testid^="term-"]');
}

test('the advertising page reports in Amazon’s own metrics', async ({ page }) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();

  for (const key of ['acos', 'tacos', 'ctr', 'cvr', 'cpc', 'organic', 'usp']) {
    await expect(
      page.getByTestId(`ad-metric-${key}-value`),
      `expected a value for ${key}`,
    ).not.toHaveText('');
  }
  // ACOS on plausible marketplace data is a double-digit percentage.
  await expect(page.getByTestId('ad-metric-acos-value')).toHaveText(/^\d\d\.\d+%$/);
});

test('it explains why ACOS and ROAS are not interchangeable', async ({ page }) => {
  await page.goto('/amazon/advertising');

  await expect(page.getByTestId('acos-vs-roas-note')).toContainText(
    /not comparable figures/i,
  );
  await expect(page.getByTestId('acos-vs-roas-note')).toContainText(
    /never converts one into the other/i,
  );
  await expect(page.getByTestId('cvr-denominator-note')).toContainText(
    /orders ÷ clicks/i,
  );
  await expect(page.getByTestId('cvr-denominator-note')).toContainText(
    /never be read side by side/i,
  );
  await expect(page.getByTestId('ad-disclaimer')).toContainText(
    /never calls the Amazon Advertising API/i,
  );
});

test('a search term and the target that matched it are separate columns', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(termRows(page).first()).toBeVisible();

  const header = page.getByRole('columnheader', {
    name: 'Customer search term',
  });
  await expect(header.first()).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Matched by target' }).first(),
  ).toBeVisible();

  // A broad target serving a query it does not literally contain is the whole
  // reason the two columns exist.
  const row = page
    .getByRole('row')
    .filter({ hasText: 'freestanding 2 person tent' })
    .first();
  await expect(row).toContainText('backpacking tent');
  await expect(row).toContainText('broad');
});

test('harvest candidates are suggestions with evidence, not instructions', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('harvest-list')).toBeVisible();

  const first = page.getByTestId('harvest-list').getByRole('listitem').first();
  await expect(first).toContainText('Suggested action:');
  await expect(first).toContainText(/may/i);
  await expect(first).toContainText(/clicks/);
});

test('a term with an exact target of its own is never offered for harvest', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('harvest-list')).toBeVisible();

  // "2 person tent" converts well through the broad target but already has an
  // exact target, so harvesting it would duplicate an existing bid.
  await expect(termRows(page).first()).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: '2 person tent' }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId('harvest-list').getByText('2 person tent', { exact: true }),
  ).toHaveCount(0);
});

test('negation candidates warn that the listing may be the problem', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('negation-list')).toBeVisible();

  const first = page.getByTestId('negation-list').getByRole('listitem').first();
  await expect(first).toContainText('Read the term before acting');
  await expect(first).toContainText(/listing copy may be the problem/i);
});

test('terms with too few clicks are shown as set aside, not dropped', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();

  await expect(page.getByText(/Looked at, no verdict/i)).toBeVisible();
  await expect(page.getByText(/not yet evidence of anything/i).first()).toBeVisible();
});

test('the ASIN table flags the listing carried by advertising', async ({
  page,
}) => {
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId(`ad-asin-${LOW_ORGANIC}`)).toBeVisible();

  // Scoped to the ASIN table: "Beacon 400 — Exact" is also a campaign name,
  // and the campaigns table appears first on the page.
  const row = page
    .getByRole('table', { name: /per-ASIN sales/i })
    .getByRole('row')
    .filter({ hasText: 'Beacon 400' })
    .first();
  await expect(row).toContainText('carried by ads');

  await page.getByTestId(`ad-asin-${LOW_ORGANIC}`).click();
  await expect(page).toHaveURL(new RegExp(`/amazon/${LOW_ORGANIC}$`));
});

test('a listing page shows its own advertising figures', async ({ page }) => {
  await page.goto(`/amazon/${LOW_ORGANIC}`);
  await expect(page.getByTestId('listing-ads-panel')).toBeVisible();

  await expect(page.getByTestId('listing-ads-acos')).toHaveText(/%$/);
  await expect(page.getByTestId('listing-ads-tacos')).toHaveText(/%$/);
  await expect(page.getByTestId('listing-ads-low-organic')).toBeVisible();

  await page.getByTestId('listing-ads-link').click();
  await expect(page).toHaveURL(/\/amazon\/advertising$/);
});

test('an unadvertised listing says so rather than showing zeros', async ({
  page,
}) => {
  await page.goto(`/amazon/${NOT_ADVERTISED}`);
  await expect(page.getByTestId('listing-ads-none')).toContainText(
    /not the same as performing badly/i,
  );
});

test('the advertising route is not swallowed by the listing route', async ({
  page,
}) => {
  // /amazon/[listingId] would match "advertising" as an id if Next did not
  // give the static segment precedence.
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();
  await expect(page.getByTestId('listing-not-found')).toHaveCount(0);
});

test('only the most specific nav entry is marked current', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/amazon/advertising');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByTestId('nav-amazon-ads')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByTestId('nav-amazon')).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('advertising findings reach the recommendations list', async ({ page }) => {
  await page.goto('/recommendations');
  await page.getByTestId('rec-filter-source-amazon').click();
  await expect(page.locator('[data-source="amazon"]').first()).toBeVisible();

  const card = page
    .locator('[data-testid^="rec-"][data-category="Amazon advertising"]')
    .first();
  await expect(card).toBeVisible();
  const id = ((await card.getAttribute('data-testid')) ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-link-${id}`).click();
  await expect(page).toHaveURL(/\/amazon\/advertising$/);
});

test('advertising does not move a single storefront number', async ({ page }) => {
  const read = async (): Promise<string[]> => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-ready')).toBeVisible();
    return page
      .locator('[data-metric-card] [data-testid$="-value"]')
      .allInnerTexts();
  };

  const before = await read();
  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();
  const after = await read();

  expect(after).toEqual(before);
});

test('an empty report source shows the empty state', async ({ page }) => {
  await page.goto('/amazon/advertising?demo=empty');
  await expect(page.getByTestId('state-empty')).toBeVisible();
});

test('a failing report source offers a retry', async ({ page }) => {
  await page.goto('/amazon/advertising?demo=error');
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/amazon/advertising');
  await expect(page.getByTestId('advertising-ready')).toBeVisible();
  await page.goto(`/amazon/${LOW_ORGANIC}`);
  await expect(page.getByTestId('listing-ads-panel')).toBeVisible();

  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/amazon/advertising');
    await expect(page.getByTestId('advertising-ready')).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
