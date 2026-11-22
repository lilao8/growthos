import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

test('a figure from the real-model replay opens on its page with the same number', async ({ page }) => {
  await gotoReady(page, '/agent/replays/live-review');
  await expect(page.getByTestId('replay-source')).toContainText('Real model run');
  // The count shown is the exact rule applied to the recording itself:
  // answered, with exactly one submitted answer that had no issues.
  const recorded = JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures/agent-replays/live-review.json'), 'utf8')) as {
    turns: Array<{ result: { status: string; validation: Array<{ issueCodes: string[] }> } }>;
  };
  const turns = recorded.turns.length;
  const firstPass = recorded.turns.filter(({ result }) => result.status === 'answered' && result.validation.length === 1 && result.validation[0]?.issueCodes.length === 0).length;
  await expect(page.getByTestId('replay-validation')).toContainText(`Answer checks: ${firstPass} of ${turns} turns were answered on the first attempt`);
  const followUp = page.getByTestId('agent-turn').nth(1);
  const fact = followUp.getByTestId('agent-fact').filter({ hasText: 'Add to Cart → Checkout conversion (Organic Search), 2026-08-02 — 2026-08-31' }).first();
  await expect(fact).toContainText('39.49%');
  await fact.getByTestId('agent-figure').click();
  await expect(page).toHaveURL(/\/funnel\?range=30&channel=Organic\+Search$/);
  await expect(page.getByTestId('funnel-window')).toHaveText('2026-08-02 — 2026-08-31 · 30 days · UTC');
  await expect(page.getByTestId('funnel-scope')).toHaveText('Scope: Organic Search sessions only');
  await expect(page.getByTestId('stage-add_to_cart')).toContainText('195');
  await expect(page.getByTestId('conversion-add_to_cart-checkout')).toHaveText('39.49%');
});

test('a two-period change in a real replay links each period to its own window', async ({ page }) => {
  await gotoReady(page, '/agent/replays/live-review');
  const change = page.getByTestId('agent-turn').nth(1).getByTestId('agent-answer-fact').filter({ hasText: '→' }).first();
  const hrefs = await change.getByTestId('agent-figure').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toEqual(['/analytics?range=30&end=2026-08-01', '/analytics?range=30']);
  await expect(change).toContainText('2026-07-03 — 2026-08-01');
  await expect(change).toContainText('2026-08-02 — 2026-08-31');
});

test('the real support replay opens the three matching shipping tickets without calling the agent API', async ({ page }) => {
  const agentCalls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/agent') agentCalls.push(request.url());
  });
  await gotoReady(page, '/agent/replays');
  await page.getByTestId('replay-link-live-support-feedback').click();
  await expect(page.getByTestId('replay-source')).toContainText('Real model run');
  await expect(page.getByTestId('replay-validation')).toContainText('Answer checks: 1 of 2');
  const turns = page.getByTestId('agent-turn');
  await expect(turns).toHaveCount(2);
  await expect(turns.first().getByTestId('agent-fallback')).toBeVisible();
  await expect(turns.first().getByTestId('agent-answer-fact').first()).toContainText('Ridgeline 2P Backpacking Tent');
  await expect(turns.nth(1).getByTestId('agent-turn-scope')).toContainText('30 days');
  const shipping = turns.nth(1).getByTestId('agent-answer-fact').filter({ hasText: 'Shipping tickets' });
  await shipping.getByRole('link', { name: '3' }).click();
  await expect(page).toHaveURL(/\/support\?range=30&product=prd_ridgeline_2p_tent&category=shipping$/);
  await expect(page.getByTestId('support-count')).toHaveText('3 tickets · 2026-08-02 — 2026-08-31');
  for (const id of ['SUP-101', 'SUP-102', 'SUP-103']) {
    await expect(page.getByRole('cell', { name: id, exact: true })).toBeVisible();
  }
  expect(agentCalls).toEqual([]);
});
