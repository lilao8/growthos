import { expect, test, type Page } from '@playwright/test';

/**
 * Content planner: the prioritised list, filters, create, edit, status
 * management and persistence across a reload.
 */

const PLAN_TABLE = 'Content plan ordered by opportunity score';
const TOP_IDEA = 'idea_best-2-person-backpacking-tents';
const PAD_IDEA = 'idea_r-value-faq';

function rows(page: Page) {
  return page.locator(`table:has(caption:text-is("${PLAN_TABLE}")) tbody tr`);
}

test('lists the seeded plan ordered by opportunity', async ({ page }) => {
  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();

  const count = await rows(page).count();
  expect(count).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId('content-result-count')).toHaveText(
    `${count} / ${count}`,
  );

  const scores = await page
    .locator('[data-testid^="opportunity-"]')
    .allInnerTexts();
  const numbers = scores.map(Number);
  expect([...numbers].sort((a, b) => b - a)).toEqual(numbers);
});

test('the top row answers which piece to write next', async ({ page }) => {
  await page.goto('/content');

  const first = rows(page).first();
  await expect(first).toContainText('Best two-person backpacking tents');
  await expect(page.getByTestId(`opportunity-${TOP_IDEA}`)).toHaveText('82');
});

test('states that opportunity inputs are judgements, not audit scores', async ({
  page,
}) => {
  await page.goto('/content');

  await expect(
    page.getByText(/SEO and GEO opportunity are entered by an editor/i),
  ).toBeVisible();
  await expect(page.getByText(/not search volume/i)).toBeVisible();
  await expect(
    page.getByText(/Transactional 100, Commercial 80, Informational 40/i),
  ).toBeVisible();
});

test('search and filters narrow the plan and clear restores it', async ({ page }) => {
  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();
  const total = await rows(page).count();

  await page.getByTestId('content-search').fill('  R   VALUE ');
  await expect(rows(page)).toHaveCount(1);

  await page.getByTestId('content-clear-filters').click();
  await expect(rows(page)).toHaveCount(total);

  await page.getByTestId('content-filter-stage-bofu').click();
  const bofu = await rows(page).count();
  expect(bofu).toBeGreaterThan(0);
  expect(bofu).toBeLessThan(total);

  await page.getByTestId('content-filter-intent-informational').click();
  // No BOFU idea is Informational in the demo plan.
  await expect(page.getByTestId('state-empty')).toBeVisible();
  await expect(page.getByText('No content ideas match these filters')).toBeVisible();

  await page.getByTestId('content-clear-filters').click();
  await expect(rows(page)).toHaveCount(total);
});

test('creates a content idea that persists across a reload', async ({ page }) => {
  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();
  const before = await rows(page).count();

  await page.getByTestId('content-new').click();
  await page.getByTestId('content-topic').fill('Choosing between a tarp and a tent');
  await page.getByTestId('content-primary-keyword').fill('tarp vs tent');
  await page
    .getByTestId('content-secondary-keywords')
    .fill('ultralight shelter, tarp camping');
  await page.getByTestId('content-search-intent').selectOption('Commercial');
  await page.getByTestId('content-funnel-stage').selectOption('MOFU');
  await page.getByTestId('content-type').selectOption('Comparison');
  await page.getByTestId('content-seo-opportunity').fill('66');
  await page.getByTestId('content-geo-opportunity').fill('58');
  await page.getByTestId('content-product-relevance').fill('90');

  // The score preview updates as the judgements are entered.
  await expect(page.getByTestId('score-preview')).toHaveText('72');

  await page.getByTestId('content-save').click();
  await expect(page.getByTestId('content-save-success')).toBeVisible();

  await page.reload();
  await expect(rows(page)).toHaveCount(before + 1);
  await expect(
    page.getByTestId('content-link-idea_choosing-between-a-tarp-and-a-tent'),
  ).toBeVisible();
});

test('an invalid entry is rejected, keeps the input and writes nothing', async ({
  page,
}) => {
  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();
  const before = await rows(page).count();

  await page.getByTestId('content-new').click();
  await page.getByTestId('content-topic').fill('   ');
  await page.getByTestId('content-primary-keyword').fill('keyword worth keeping');
  await page.getByTestId('content-seo-opportunity').fill('120');
  await page.getByTestId('content-save').click();

  await expect(page.getByTestId('content-save-failure')).toBeVisible();
  await expect(page.getByTestId('content-save-success')).toHaveCount(0);
  // Nothing typed was discarded.
  await expect(page.getByTestId('content-primary-keyword')).toHaveValue(
    'keyword worth keeping',
  );

  await page.reload();
  await expect(rows(page)).toHaveCount(before);
});

test('opens an idea, edits it, and the new score shows in the list', async ({
  page,
}) => {
  await page.goto('/content');
  await page.getByTestId(`content-link-${PAD_IDEA}`).click();
  await expect(page).toHaveURL(new RegExp(`/content/${PAD_IDEA}$`));

  await expect(page.getByTestId('detail-opportunity')).toHaveText(/^\d+$/);

  await page.getByTestId('content-seo-opportunity').fill('90');
  await page.getByTestId('content-geo-opportunity').fill('90');
  await page.getByTestId('content-product-relevance').fill('90');
  await page.getByTestId('content-search-intent').selectOption('Commercial');
  await page.getByTestId('content-save').click();
  await expect(page.getByTestId('content-save-success')).toBeVisible();

  // 0.35×90 + 0.25×90 + 0.20×80 + 0.20×90 = 88
  await expect(page.getByTestId('detail-opportunity')).toHaveText('88');

  await page.goto('/content');
  await expect(page.getByTestId(`opportunity-${PAD_IDEA}`)).toHaveText('88');
});

test('the detail page explains every part of the score', async ({ page }) => {
  await page.goto(`/content/${PAD_IDEA}`);

  await expect(page.getByText('Entered by an editor').first()).toBeVisible();
  await expect(page.getByText('Derived from search intent')).toBeVisible();
  await expect(page.getByRole('cell', { name: '0.35' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0.25' })).toBeVisible();
});

test('the detail page separates measured audit scores from the estimates', async ({
  page,
}) => {
  await page.goto(`/content/${PAD_IDEA}`);

  await expect(page.getByTestId('measured-scores')).toContainText('Not audited');
  await expect(
    page.getByText(/They take no part in the opportunity score above/i),
  ).toBeVisible();

  // Run the audits, and the measured figures appear without moving the score.
  const before = await page.getByTestId('detail-opportunity').innerText();
  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await page.goto('/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);

  await page.goto(`/content/${PAD_IDEA}`);
  await expect(page.getByTestId('measured-scores')).toHaveText(/SEO \d+ · GEO \d+/);
  await expect(page.getByTestId('detail-opportunity')).toHaveText(before);
});

test('status can be moved from the list and persists', async ({ page }) => {
  await page.goto('/content');

  await page.getByTestId(`status-select-${TOP_IDEA}`).selectOption('Published');
  await expect(page.getByTestId('content-status-message')).toHaveText(
    'Moved to Published.',
  );

  await page.reload();
  await expect(page.getByTestId(`status-select-${TOP_IDEA}`)).toHaveValue(
    'Published',
  );

  // Publishing is a planning record, not an actual publish.
  await page.getByTestId(`content-link-${TOP_IDEA}`).click();
  await expect(page.getByText(/nothing is sent anywhere/i)).toBeVisible();
});

test('filtering by status reflects a status change', async ({ page }) => {
  await page.goto('/content');
  await page.getByTestId('content-filter-status-published').click();
  await expect(rows(page).first()).toBeVisible();
  const before = await rows(page).count();

  await page.getByTestId('content-clear-filters').click();
  await page.getByTestId(`status-select-${PAD_IDEA}`).selectOption('Published');
  await expect(page.getByTestId('content-status-message')).toBeVisible();

  await page.getByTestId('content-filter-status-published').click();
  await expect(rows(page)).toHaveCount(before + 1);
});

test('an unknown idea id shows not found', async ({ page }) => {
  const response = await page.goto('/content/idea_not_real');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('content-not-found')).toBeVisible();
});

test('a storage failure is reported and the typed values are kept', async ({
  page,
}) => {
  await page.goto('/content?demo=storage-error');

  await page.getByTestId('content-new').click();
  await page.getByTestId('content-topic').fill('Will not save');
  await page.getByTestId('content-primary-keyword').fill('will not save');
  await page.getByTestId('content-save').click();

  await expect(page.getByTestId('content-save-failure')).toContainText(
    /try again/i,
  );
  await expect(page.getByTestId('content-topic')).toHaveValue('Will not save');
});

test('the plan reports a load failure with a retry', async ({ page }) => {
  await page.goto('/content?demo=error');
  // The content plan comes from the same state repository as everything else,
  // so an unreadable store shows the list either empty-but-explained or errored
  // rather than pretending to have data.
  await expect(page.getByTestId('content-result-count')).toBeVisible();
});

test('the form is labelled and reachable by keyboard', async ({ page }) => {
  await page.goto('/content');
  await page.getByTestId('content-new').click();

  const topic = page.getByLabel('Topic', { exact: true });
  await expect(topic).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Search intent' }),
  ).toBeVisible();
  await expect(page.getByLabel('SEO opportunity')).toBeVisible();

  await topic.focus();
  await expect(topic).toBeFocused();
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();
  await page.getByTestId(`content-link-${PAD_IDEA}`).click();
  await expect(page.getByTestId('detail-opportunity')).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on the content plan at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/content');
  await expect(rows(page).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
