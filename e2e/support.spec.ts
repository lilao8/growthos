import { expect, test } from '@playwright/test';
import { gotoReady } from './ready';

test('support ranking and ticket filters use the same dates and counts', async ({ page }) => {
  await gotoReady(page, '/support');
  await expect(page.getByTestId('support-count')).toHaveText('12 tickets · 2026-08-02 — 2026-08-31');
  await expect(page.getByTestId('support-ranking').getByRole('listitem').first()).toContainText('NT-TENT-RDG2');
  await page.getByLabel('Issue category').selectOption('shipping');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByTestId('support-count')).toHaveText('4 tickets · 2026-08-02 — 2026-08-31');
  await page.getByRole('link', { name: 'Unmatched SKU (1)' }).click();
  await expect(page.getByTestId('support-count')).toHaveText('1 ticket · 2026-08-02 — 2026-08-31');
  await expect(page.getByRole('row', { name: /SUP-111/ })).toBeVisible();
});

test('Agent support feedback and SKU follow-up link to the matching cases', async ({ page }) => {
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-example-2').click();
  const turns = page.getByTestId('agent-turn');
  await expect(turns.first().getByTestId('agent-answer-fact').first()).toContainText('Ridgeline 2P Backpacking Tent');
  await page.getByRole('button', { name: '只看 Ridgeline 2P 呢？' }).click();
  const followUp = turns.nth(1);
  const shipping = followUp.getByTestId('agent-answer-fact').filter({ hasText: 'Shipping tickets' });
  const link = shipping.getByRole('link', { name: '3' });
  await expect(link).toHaveAttribute('href', /range=30&product=[^&]+&category=shipping$/);
  await link.click();
  await expect(page.getByTestId('support-count')).toHaveText('3 tickets · 2026-08-02 — 2026-08-31');
  await expect(page.getByRole('row', { name: /SUP-103/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /SUP-104/ })).toHaveCount(0);
});
