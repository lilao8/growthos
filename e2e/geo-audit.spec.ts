import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * GEO audit: readiness scoring, the mandatory disclaimer, per-rule points and
 * evidence, staleness, and independence from the SEO engine.
 */

const RICH_PAGE = 'snap_ridgeline_2p_tent';
const THIN_PAGE = 'snap_summit_20_bag';
const RICH_PRODUCT = 'prd_ridgeline_2p_tent';

const PAGES_TABLE = 'Page-level GEO readiness';
const RECOMMENDATIONS_TABLE = 'GEO recommendations across audited pages';

function rowsIn(page: Page, caption: string) {
  return page.locator(`table:has(caption:text-is("${caption}")) tbody tr`);
}

async function runAllGeoAudits(page: Page): Promise<void> {
  await gotoReady(page, '/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(
    /Audited \d+ pages/,
  );
}

test('before any audit, nothing claims a readiness score', async ({ page }) => {
  await gotoReady(page, '/geo');

  await expect(page.getByTestId('geo-overview')).toBeVisible();
  await expect(page.getByTestId('geo-metric-score-value')).toHaveText('N/A');
  await expect(page.getByTestId('geo-metric-readiness-value')).toHaveText(
    'Not assessed',
  );
  await expect(page.getByTestId('geo-recommendation-count')).toHaveText(
    '0 recommendation(s)',
  );
});

test('shows the required internal-heuristic disclaimer', async ({ page }) => {
  await gotoReady(page, '/geo');

  const disclaimer = page.getByTestId('geo-disclaimer').first();
  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText(
    'This score is an internal heuristic designed to evaluate content readiness for generative search systems.',
  );
  await expect(disclaimer).toContainText(/does not make citation likely/i);
  await expect(disclaimer).toContainText(/No AI API is called/i);
  await expect(disclaimer).toContainText(/cannot be verified/i);
});

test('running all audits populates scores and recommendations', async ({ page }) => {
  await runAllGeoAudits(page);

  await expect(page.getByTestId('geo-metric-score-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('geo-metric-readiness-value')).not.toHaveText(
    'Not assessed',
  );

  await expect(rowsIn(page, RECOMMENDATIONS_TABLE).first()).toBeVisible();
  const count = await rowsIn(page, RECOMMENDATIONS_TABLE).count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByTestId('geo-recommendation-count')).toHaveText(
    `${count} recommendation(s)`,
  );
});

test('the recommendation count equals the rules not yet met', async ({ page }) => {
  await runAllGeoAudits(page);

  const gaps = Number(
    (await page.getByTestId('geo-metric-gaps-value').innerText()).replace(
      /[^0-9]/g,
      '',
    ),
  );
  await expect(rowsIn(page, RECOMMENDATIONS_TABLE).first()).toBeVisible();
  expect(await rowsIn(page, RECOMMENDATIONS_TABLE).count()).toBe(gaps);
});

test('every catalogue page appears in the readiness table', async ({ page }) => {
  await gotoReady(page, '/geo');
  await expect(rowsIn(page, PAGES_TABLE).first()).toBeVisible();
  expect(await rowsIn(page, PAGES_TABLE).count()).toBeGreaterThanOrEqual(15);
});

test('a page detail shows all ten rules with points, signal and evidence', async ({
  page,
}) => {
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await expect(page.getByTestId('geo-never-audited')).toBeVisible();

  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toBeVisible();

  await expect(page.locator('[data-testid^="geo-check-"]')).toHaveCount(10);
  await expect(page.getByTestId('geo-check-direct-answer')).toBeVisible();
  await expect(page.getByTestId('geo-check-extractability')).toBeVisible();

  const rule = page.getByTestId('geo-check-faq-coverage');
  await expect(rule).toContainText('Signal read:');
  await expect(rule).toContainText('What to add:');
  await expect(rule).toContainText('Evidence:');
  await expect(page.getByTestId('geo-points-faq-coverage')).toHaveText('10 / 10');
});

test('content-rich and marketing-copy pages land in different bands', async ({
  page,
}) => {
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toHaveText(/^\d+$/);
  const richScore = Number(await page.getByTestId('geo-page-score').innerText());
  const richBand = await page.getByTestId('geo-page-readiness').innerText();

  await gotoReady(page, `/geo/${THIN_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toHaveText(/^\d+$/);
  const thinScore = Number(await page.getByTestId('geo-page-score').innerText());
  const thinBand = await page.getByTestId('geo-page-readiness').innerText();

  expect(richScore).toBeGreaterThan(thinScore);
  expect(richBand).not.toBe(thinBand);
});

test('a thin page reports the specific signals it is missing', async ({ page }) => {
  await gotoReady(page, `/geo/${THIN_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toBeVisible();

  for (const ruleId of [
    'direct-answer',
    'faq-coverage',
    'factual-density',
    'source-evidence',
    'original-information',
  ]) {
    await expect(page.getByTestId(`geo-check-${ruleId}`)).toHaveAttribute(
      'data-points',
      '0',
    );
  }

  await expect(page.getByTestId('geo-check-extractability')).toContainText(
    /vague wording|nothing a system could lift/i,
  );
});

test('a missing input is reported as a specific gap, not a silent zero', async ({
  page,
}) => {
  // The draft lantern page has no meta title, so topic clarity is only half met
  // and the evidence names exactly what is absent.
  await gotoReady(page, '/geo/snap_trailcell_lantern');
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toBeVisible();

  const topic = page.getByTestId('geo-check-topic-clarity');
  await expect(topic).toHaveAttribute('data-points', '5');
  await expect(topic).toContainText('no title to corroborate it');
  await expect(topic).toContainText('title: absent');
});

test('coverage is reported and explains how unassessed rules are treated', async ({
  page,
}) => {
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();

  // Every input on this page was captured, so coverage is complete.
  await expect(page.getByTestId('geo-page-coverage')).toHaveText('100%');
  await expect(
    page.getByText(/left out of the score entirely and show as reduced coverage/i),
  ).toBeVisible();
});

test('editing the page makes the GEO audit stale, and re-running clears it', async ({
  page,
}) => {
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toBeVisible();
  await expect(page.getByTestId('geo-stale-notice')).toHaveCount(0);

  await gotoReady(page, `/products/${RICH_PRODUCT}`);
  await page
    .getByTestId('field-meta-description')
    .fill('A rewritten description of the Ridgeline 2P for the GEO staleness check.');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();
  await expect(page.getByTestId('detail-geo-score')).toContainText('(stale)');

  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await expect(page.getByTestId('geo-stale-notice')).toBeVisible();

  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-run-message')).toHaveText('GEO audit complete.');
  await expect(page.getByTestId('geo-stale-notice')).toHaveCount(0);
});

test('GEO results survive a reload', async ({ page }) => {
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await page.getByTestId('run-geo-page-audit').click();
  await expect(page.getByTestId('geo-page-score')).toHaveText(/^\d+$/);
  const score = await page.getByTestId('geo-page-score').innerText();

  await page.reload();
  await expect(page.getByTestId('geo-page-score')).toHaveText(score);
});

test('running GEO does not fabricate an SEO result', async ({ page }) => {
  await runAllGeoAudits(page);

  await gotoReady(page, '/seo');
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText('N/A');
  await expect(page.getByText('Never audited').first()).toBeVisible();
});

test('the two scores are shown separately on the product and the dashboard', async ({
  page,
}) => {
  await runAllGeoAudits(page);

  await gotoReady(page, `/products/${RICH_PRODUCT}`);
  await expect(page.getByTestId('detail-geo-score')).toHaveText(/^\d+$/);
  // SEO has not been run, so it must still read Not audited.
  await expect(page.getByTestId('detail-seo-score')).toHaveText('Not audited');

  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('geo-health-score-value')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('seo-health-score-value')).toHaveText('N/A');
});

test('the dashboard reports the same GEO figures as the GEO module', async ({
  page,
}) => {
  await runAllGeoAudits(page);

  const score = await page.getByTestId('geo-metric-score-value').innerText();
  const readiness = await page.getByTestId('geo-metric-readiness-value').innerText();
  const gaps = await page.getByTestId('geo-metric-gaps-value').innerText();
  const met = await page.getByTestId('geo-metric-met-value').innerText();

  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('geo-health-score-value')).toHaveText(score);
  await expect(page.getByTestId('geo-health-readiness-value')).toHaveText(readiness);
  await expect(page.getByTestId('geo-health-gaps-value')).toHaveText(gaps);
  await expect(page.getByTestId('geo-health-met-value')).toHaveText(met);
});

test('the dashboard links through to the GEO module', async ({ page }) => {
  await gotoReady(page, '/dashboard');
  await page.getByTestId('dashboard-geo-link').click();
  await expect(page).toHaveURL(/\/geo$/);
  await expect(page.getByRole('heading', { name: 'GEO Audit', level: 1 })).toBeVisible();
});

test('a product links to its GEO audit, and the audit links back and across', async ({
  page,
}) => {
  await gotoReady(page, `/products/${RICH_PRODUCT}`);
  await page.getByTestId('link-to-geo-audit').click();
  await expect(page).toHaveURL(new RegExp(`/geo/${RICH_PAGE}$`));

  await page.getByTestId('link-to-seo-page').click();
  await expect(page).toHaveURL(new RegExp(`/seo/${RICH_PAGE}$`));

  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await page.getByTestId('geo-link-to-product').click();
  await expect(page).toHaveURL(new RegExp(`/products/${RICH_PRODUCT}$`));
});

test('an unknown page id shows not found', async ({ page }) => {
  const response = await page.goto('/geo/snap_not_real');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('geo-page-not-found')).toBeVisible();
});

test('a storage failure is reported and leaves the previous result alone', async ({
  page,
}) => {
  await page.goto(`/geo/${RICH_PAGE}?demo=storage-error`);
  await page.getByTestId('run-geo-page-audit').click();

  await expect(page.getByTestId('geo-run-message')).toContainText(
    /previous result is unchanged/i,
  );
  await expect(page.getByTestId('geo-page-score')).toHaveCount(0);
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await runAllGeoAudits(page);
  await gotoReady(page, `/geo/${RICH_PAGE}`);
  await expect(page.getByTestId('geo-page-score')).toBeVisible();

  expect(errors).toEqual([]);
});

test('no page-level horizontal overflow on the GEO overview at 375px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await runAllGeoAudits(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
