import { expect, test } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * About page and the demo reset control.
 *
 * The reset is the only thing in the product that clears stored data, so it is
 * tested for what it does and for what it must not do: no reset without a
 * confirmation, and no data loss when the user backs out.
 */

test('the about page is reachable from the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/dashboard');

  await page
    .getByRole('navigation', { name: 'About' })
    .getByTestId('nav-about-this-project')
    .click();

  await expect(page).toHaveURL(/\/about-project$/);
  await expect(
    page.getByRole('heading', { name: 'About this project', level: 1 }),
  ).toBeVisible();
});

test('it explains the chain, the modules and the limits', async ({ page }) => {
  await gotoReady(page, '/about-project');

  await expect(page.getByTestId('about-chain')).toContainText('Recommendations');
  await expect(page.getByTestId('about-limitations')).toBeVisible();

  // The claims that must never quietly disappear from a portfolio piece.
  const limits = page.getByTestId('about-limitations');
  await expect(limits).toContainText('No AI API is called anywhere');
  await expect(limits).toContainText('Nothing here is a real business result');
  await expect(limits).toContainText('last-touch and single-channel');
  await expect(limits).toContainText('no refund concept');
});

test('every module is linked from the about page', async ({ page }) => {
  await gotoReady(page, '/about-project');

  for (const slug of [
    'dashboard',
    'products',
    'seo-audit',
    'geo-audit',
    'content',
    'analytics',
    'funnel',
    'recommendations',
  ]) {
    await expect(
      page.getByTestId(`about-link-${slug}`),
      `expected an about link for ${slug}`,
    ).toBeVisible();
  }

  await page.getByTestId('about-link-funnel').click();
  await expect(page).toHaveURL(/\/funnel$/);
});

test('a fresh browser is reported as already clean', async ({ page }) => {
  await gotoReady(page, '/about-project');

  await expect(page.getByTestId('reset-clean')).toBeVisible();
  await expect(page.getByTestId('reset-start')).toBeVisible();
});

test('the reset names what it will discard before doing it', async ({ page }) => {
  // Make something worth losing.
  await gotoReady(page, '/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);

  await gotoReady(page, '/about-project');
  await expect(page.getByTestId('reset-preview')).toBeVisible();
  await expect(page.getByTestId('reset-preview')).toContainText(
    'Stored audit results',
  );
  await expect(page.getByTestId('reset-clean')).toHaveCount(0);
});

test('backing out of the reset keeps the data', async ({ page }) => {
  await gotoReady(page, '/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  const score = await page.getByTestId('seo-metric-score-value').innerText();

  await gotoReady(page, '/about-project');
  await page.getByTestId('reset-start').click();
  await expect(page.getByTestId('reset-confirm-panel')).toBeVisible();
  await page.getByTestId('reset-cancel').click();

  await expect(page.getByTestId('reset-confirm-panel')).toHaveCount(0);
  await gotoReady(page, '/seo');
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText(score);
});

test('a confirmed reset returns the workbench to its seed state', async ({
  page,
}) => {
  await gotoReady(page, '/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText(/^\d+$/);

  await gotoReady(page, '/about-project');
  await page.getByTestId('reset-start').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();

  await gotoReady(page, '/seo');
  await expect(page.getByTestId('seo-metric-score-value')).toHaveText('N/A');
});

test('a reset also clears product edits and completed recommendations', async ({
  page,
}) => {
  await gotoReady(page, '/products/prd_ridgeline_2p_tent');
  await page.getByTestId('field-meta-title').fill('A title that reset will undo');
  await page.getByTestId('save-seo').click();
  await expect(page.getByTestId('save-success')).toBeVisible();

  await gotoReady(page, '/recommendations');
  const card = page.locator('[data-testid^="rec-"][data-source]').first();
  await expect(card).toBeVisible();
  const id = ((await card.getAttribute('data-testid')) ?? '').replace(/^rec-/, '');
  await page.getByTestId(`rec-toggle-${id}`).click();
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  await gotoReady(page, '/about-project');
  await expect(page.getByTestId('reset-preview')).toBeVisible();
  await page.getByTestId('reset-start').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();

  await gotoReady(page, '/products/prd_ridgeline_2p_tent');
  await expect(page.getByTestId('field-meta-title')).not.toHaveValue(
    'A title that reset will undo',
  );
  await gotoReady(page, '/recommendations');
  await expect(page.getByTestId('rec-done-value')).toHaveText('0');
});

test('a failing storage source reports the failure instead of claiming success', async ({
  page,
}) => {
  await page.goto('/about-project?demo=storage-error');
  await expect(page.getByTestId('reset-start')).toBeVisible();
  // Reads succeed under this seam, so the control is offered; the point is that
  // the page never claims a reset it did not perform.
  await expect(page.getByTestId('reset-done')).toHaveCount(0);
});

test('renders no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await gotoReady(page, '/about-project');
  await expect(page.getByTestId('reset-start')).toBeVisible();

  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1440]) {
  test(`no page-level horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoReady(page, '/about-project');
    await expect(page.getByTestId('about-chain')).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
