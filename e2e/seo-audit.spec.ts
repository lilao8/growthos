import { expect, test, type Page } from '@playwright/test';

/**
 * SEO audit: overview, issue list, page detail, and the edit → stale → re-run
 * loop as a user actually performs it.
 */

const TENT_PAGE = 'snap_ridgeline_2p_tent';
const TENT_PRODUCT = 'prd_ridgeline_2p_tent';
const WORST_PAGE = 'snap_summit_20_bag';

function rowsIn(page: Page, caption: string) {
  return page.locator(`table:has(caption:text-is("${caption}")) tbody tr`);
}

const PAGES_TABLE = 'Page-level SEO audit status';
const ISSUES_TABLE = 'SEO issues across audited pages';

async function runAllAudits(page: Page): Promise<void> {
  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited \d+ pages/);
}

test('before any audit, nothing claims a score', async ({ page }) => {
  await page.goto('/seo');

  await expect(page.getByTestId('seo-overview')).toBeVisible();
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText('N/A');
  await expect(page.getByTestId('issue-count')).toHaveText('0 issue(s)');
  await expect(page.getByText('Never audited').first()).toBeVisible();
});

test('states that the score is an internal rule set, not a ranking algorithm', async ({
  page,
}) => {
  await page.goto('/seo');
  await expect(page.getByTestId('seo-disclaimer').first()).toContainText(
    /not any search engine/i,
  );
  await expect(page.getByTestId('seo-disclaimer').first()).toContainText(
    /stored page snapshot, not a live crawl/i,
  );
});

test('running all audits populates scores and the issue list', async ({ page }) => {
  await runAllAudits(page);

  await expect(page.getByTestId('seo-metric-score-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('seo-metric-critical-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('seo-metric-warnings-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('seo-metric-passed-value')).toHaveText(/^\d+$/);

  await expect(rowsIn(page, ISSUES_TABLE).first()).toBeVisible();
  const issues = await rowsIn(page, ISSUES_TABLE).count();
  expect(issues).toBeGreaterThan(0);
  await expect(page.getByTestId('issue-count')).toHaveText(`${issues} issue(s)`);
});

test('the issue count equals the errors plus warnings reported above it', async ({
  page,
}) => {
  await runAllAudits(page);

  const toNumber = async (testId: string): Promise<number> =>
    Number((await page.getByTestId(testId).innerText()).replace(/[^0-9]/g, ''));

  const critical = await toNumber('seo-metric-critical-value');
  const warnings = await toNumber('seo-metric-warnings-value');
  await expect(rowsIn(page, ISSUES_TABLE).first()).toBeVisible();
  const issues = await rowsIn(page, ISSUES_TABLE).count();

  expect(issues).toBe(critical + warnings);
});

test('every page in the catalogue appears in the page table', async ({ page }) => {
  await page.goto('/seo');
  await expect(rowsIn(page, PAGES_TABLE).first()).toBeVisible();
  expect(await rowsIn(page, PAGES_TABLE).count()).toBeGreaterThanOrEqual(15);
});

test('a page detail lists all twelve checks with evidence and a recommendation', async ({
  page,
}) => {
  await page.goto(`/seo/${TENT_PAGE}`);
  await expect(page.getByTestId('never-audited')).toBeVisible();

  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toBeVisible();

  await expect(page.locator('[data-testid^="check-"]')).toHaveCount(12);
  await expect(page.getByTestId('check-meta-title-present')).toBeVisible();
  await expect(page.getByTestId('check-keyword-usage')).toBeVisible();

  const first = page.getByTestId('check-meta-title-present');
  await expect(first).toContainText('Why it matters:');
  await expect(first).toContainText('What to do:');
  await expect(first).toContainText('Evidence:');
});

test('a well-maintained page scores higher than a neglected one', async ({ page }) => {
  await page.goto(`/seo/${TENT_PAGE}`);
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toHaveText(/^\d+$/);
  const good = Number(await page.getByTestId('page-score').innerText());

  await page.goto(`/seo/${WORST_PAGE}`);
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toHaveText(/^\d+$/);
  const bad = Number(await page.getByTestId('page-score').innerText());

  expect(good).toBeGreaterThan(bad);
});

test('an uncaptured robots directive lowers coverage instead of passing', async ({
  page,
}) => {
  await page.goto(`/seo/${WORST_PAGE}`);
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-coverage')).toBeVisible();

  await expect(page.getByTestId('check-indexability')).toHaveAttribute(
    'data-status',
    'unknown',
  );
  await expect(page.getByTestId('check-indexability')).toContainText(
    'Not assessed',
  );

  const coverage = await page.getByTestId('page-coverage').innerText();
  expect(Number(coverage.replace('%', ''))).toBeLessThan(100);
});

test('a noindex page is flagged for confirmation, not changed', async ({ page }) => {
  await page.goto('/seo/snap_trailhead_1p_tent');
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('check-indexability')).toHaveAttribute(
    'data-status',
    'warning',
  );
  await expect(page.getByTestId('check-indexability')).toContainText(
    /will not change it for you/i,
  );
});

test('a canonical pointing elsewhere is reported with both URLs as evidence', async ({
  page,
}) => {
  await page.goto('/seo/snap_emberlite_cookset');
  await page.getByTestId('run-page-audit').click();

  const check = page.getByTestId('check-canonical');
  await expect(check).toHaveAttribute('data-status', 'warning');
  await expect(check).toContainText('collections/cooking');
});

test('editing metadata makes the audit stale, and re-running clears it', async ({
  page,
}) => {
  await page.goto(`/seo/${TENT_PAGE}`);
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toBeVisible();
  await expect(page.getByTestId('stale-notice')).toHaveCount(0);

  // Edit the product's metadata, which moves the snapshot underneath the audit.
  await page.goto(`/products/${TENT_PRODUCT}`);
  await page.getByTestId('field-meta-title').fill('A rewritten title for the Ridgeline tent');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();

  // The product row shows the score as stale rather than silently current.
  await expect(page.getByTestId('detail-seo-score')).toContainText('(stale)');

  await page.goto(`/seo/${TENT_PAGE}`);
  await expect(page.getByTestId('stale-notice')).toBeVisible();

  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('run-message')).toHaveText('Audit complete.');
  await expect(page.getByTestId('stale-notice')).toHaveCount(0);
});

test('the overview warns when audited pages have drifted', async ({ page }) => {
  await runAllAudits(page);
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);

  await page.goto(`/products/${TENT_PRODUCT}`);
  await page.getByTestId('field-meta-title').fill('Another rewritten title for the tent');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();

  await page.goto('/seo');
  await expect(page.getByTestId('stale-banner')).toBeVisible();
  await expect(page.getByTestId('stale-banner')).toContainText('1 audited page(s)');
});

test('audit results survive a reload', async ({ page }) => {
  await page.goto(`/seo/${TENT_PAGE}`);
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toHaveText(/^\d+$/);
  const score = await page.getByTestId('page-score').innerText();

  await page.reload();

  await expect(page.getByTestId('page-score')).toHaveText(score);
  await expect(page.getByTestId('never-audited')).toHaveCount(0);
});

test('the dashboard reports the same SEO figures as the SEO module', async ({
  page,
}) => {
  await runAllAudits(page);

  const read = async (testId: string): Promise<string> =>
    (await page.getByTestId(testId).innerText()).trim();

  const score = await read('seo-metric-score-value');
  const critical = await read('seo-metric-critical-value');
  const warnings = await read('seo-metric-warnings-value');
  const passed = await read('seo-metric-passed-value');

  await page.goto('/dashboard');
  await expect(page.getByTestId('seo-health-score-value')).toHaveText(score);
  await expect(page.getByTestId('seo-health-critical-value')).toHaveText(critical);
  await expect(page.getByTestId('seo-health-warnings-value')).toHaveText(warnings);
  await expect(page.getByTestId('seo-health-passed-value')).toHaveText(passed);
});

test('the dashboard links through to the SEO module', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByTestId('dashboard-seo-link').click();
  await expect(page).toHaveURL(/\/seo$/);
  await expect(page.getByRole('heading', { name: 'SEO Audit', level: 1 })).toBeVisible();
});

test('a product links to its page audit and back', async ({ page }) => {
  await page.goto(`/products/${TENT_PRODUCT}`);
  await page.getByTestId('link-to-seo-audit').click();
  await expect(page).toHaveURL(new RegExp(`/seo/${TENT_PAGE}$`));

  await page.getByTestId('link-to-product').click();
  await expect(page).toHaveURL(new RegExp(`/products/${TENT_PRODUCT}$`));
});

test('an unknown page id shows not found', async ({ page }) => {
  const response = await page.goto('/seo/snap_not_real');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('seo-page-not-found')).toBeVisible();
});

test('a storage failure is reported and leaves the previous result alone', async ({
  page,
}) => {
  await page.goto(`/seo/${TENT_PAGE}?demo=storage-error`);
  await page.getByTestId('run-page-audit').click();

  await expect(page.getByTestId('run-message')).toContainText(
    /previous result is unchanged/i,
  );
  await expect(page.getByTestId('page-score')).toHaveCount(0);
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await runAllAudits(page);
  await page.goto(`/seo/${TENT_PAGE}`);
  await expect(page.getByTestId('page-score')).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on the SEO overview at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await runAllAudits(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
