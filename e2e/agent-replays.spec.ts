import { expect, test } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Replay pages: a recorded run, shown as it ran, without any model call.
 */

test('the replay list says which runs are real and which are the scripted stand-in', async ({ page }) => {
  await gotoReady(page, '/agent/replays');
  const cards = page.getByTestId('replay-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  const review = cards.filter({ hasText: '30-day storefront review' }).first();
  await expect(review).toContainText('过去 30 天，独立站最该优先排查什么？');
  await expect(review).toContainText('只看自然搜索呢？');
  await expect(review.getByText(/Real model run|Scripted stand-in/)).toBeVisible();
});

test('a replay shows the questions, the tool calls in order and the answer, and calls no model', async ({ page }) => {
  const agentCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/agent')) agentCalls.push(request.url());
  });
  await gotoReady(page, '/agent/replays/scripted-review');
  await expect(page.getByTestId('replay-source')).toContainText('Scripted stand-in run');

  const turns = page.getByTestId('agent-turn');
  await expect(turns).toHaveCount(2);
  await expect(page.locator('#turn-0')).toHaveText('过去 30 天，独立站最该优先排查什么？');
  await expect(page.locator('#turn-1')).toHaveText('只看自然搜索呢？');
  await expect(turns.nth(1).getByTestId('agent-turn-scope')).toContainText('Organic Search');

  await turns.nth(0).getByTestId('agent-tool-log').locator('summary').click();
  const order = await turns.nth(0).getByTestId('agent-tool-call').evaluateAll((items) => items.map((item) => item.getAttribute('data-tool')));
  expect(order).toEqual(['get_channel_performance', 'get_funnel', 'get_funnel', 'get_audit_findings']);

  const findings = turns.nth(0).getByTestId('agent-finding');
  expect(await findings.count()).toBeGreaterThan(0);
  await expect(findings.first()).toContainText('1.');
  await expect(turns.nth(0)).not.toContainText('{{');
  await expect(page.getByTestId('replay-provenance')).toContainText('agent-priority-1.0.0');

  // A recorded figure still opens the page it came from.
  const href = await findings.first().getByTestId('agent-evidence-link').first().getAttribute('href');
  expect(href).toMatch(/^\/(analytics|funnel|products|seo|geo)/);
  expect(agentCalls).toEqual([]);
});

test('the recorded write request shows that nothing was done', async ({ page }) => {
  await gotoReady(page, '/agent/replays/scripted-write-request');
  await expect(page.getByTestId('agent-refused')).toContainText('No action was taken');
});

test('an unknown replay is a 404', async ({ page }) => {
  const response = await page.goto('/agent/replays/does-not-exist');
  expect(response?.status()).toBe(404);
});
