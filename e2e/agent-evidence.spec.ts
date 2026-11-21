import { expect, test } from '@playwright/test';
import { gotoReady } from './ready';
import { runTool, type RunToolOutcome } from '../src/services/agent-tools/registry';
import type { ToolContext } from '../src/services/agent-tools/types';
import { createFixtureTrafficRepository } from '../src/repositories/traffic-repository';
import { buildDemoSeedState } from '../src/fixtures/demo-seed';
import { formatInteger } from '../src/domain/format';

/**
 * Evidence links: a figure an agent tool returns must be the figure the page
 * behind its link shows. The tools run here, in the test process, on the same
 * fixture the app serves; the page is then opened at the ref's own href.
 */

function context(): ToolContext {
  return {
    traffic: createFixtureTrafficRepository(),
    state: { source: 'seed', value: buildDemoSeedState() },
    now: () => '2026-09-01T00:00:00.000Z',
  };
}

type Ok = Extract<RunToolOutcome, { status: 'ok' }>;

async function call(name: string, input: Record<string, unknown>): Promise<Ok> {
  const outcome = await runTool(name, input, context());
  if (outcome.status !== 'ok') throw new Error(`${name} returned ${outcome.status}`);
  return outcome;
}

function ref(outcome: Ok, predicate: (refId: string) => boolean) {
  const found = outcome.meta.refs.find((candidate) => predicate(candidate.refId));
  if (found === undefined) throw new Error('ref not found');
  return found;
}

test('a channel figure opens on Analytics with the same number, for the same window', async ({ page }) => {
  const outcome = await call('get_channel_performance', { range: 30 });
  const sessions = ref(outcome, (id) => id === 'channels:2026-08-02..2026-08-31:Organic Search:all:sessions');
  const orders = ref(outcome, (id) => id === 'channels:2026-08-02..2026-08-31:Organic Search:all:orders');
  expect(sessions.href).toBe('/analytics?range=30');

  await gotoReady(page, sessions.href);
  await expect(page.getByTestId('range-30')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sessions-Organic Search')).toHaveText(formatInteger(sessions.value));
  await expect(page.getByTestId('orders-Organic Search')).toHaveText(formatInteger(orders.value));
  await expect(page.getByTestId('analytics-comparison-note')).toHaveCount(0);
});

test('a previous-period figure opens on the comparison window, labelled as such', async ({ page }) => {
  const outcome = await call('get_channel_performance', { range: 30 });
  const previous = ref(outcome, (id) => id === 'channels:2026-07-03..2026-08-01:Organic Search:all:sessions');
  expect(previous.href).toBe('/analytics?range=30&end=2026-08-01');

  await gotoReady(page, previous.href);
  await expect(page.getByTestId('analytics-comparison-note')).toContainText('2026-08-01');
  await expect(page.getByTestId('sessions-Organic Search')).toHaveText(formatInteger(previous.value));
});

test('picking a range returns to the latest window and keeps the URL honest', async ({ page }) => {
  await gotoReady(page, '/analytics?range=30&end=2026-08-01');
  await page.getByTestId('range-7').click();
  await expect(page.getByTestId('analytics-comparison-note')).toHaveCount(0);
  await expect(page).toHaveURL(/\/analytics\?range=7$/);
});

test('a channel funnel figure opens on the Funnel page filtered to that channel', async ({ page }) => {
  const outcome = await call('get_funnel', { range: 30, channel: 'Organic Search' });
  const stage = ref(outcome, (id) => id.endsWith(':Organic Search:all:stage:session') && id.includes('2026-08-02'));
  const purchase = ref(outcome, (id) => id.endsWith(':Organic Search:all:stage:purchase') && id.includes('2026-08-02'));
  expect(stage.href).toBe('/funnel?range=30&channel=Organic+Search');

  await gotoReady(page, stage.href);
  await expect(page.getByTestId('funnel-channel')).toHaveValue('Organic Search');
  await expect(page.getByTestId('funnel-channel-note')).toBeVisible();
  await expect(page.getByTestId('stage-session')).toContainText(formatInteger(stage.value));
  await expect(page.getByTestId('stage-purchase')).toContainText(formatInteger(purchase.value));
});

test('changing the funnel channel updates the URL, and All channels clears it', async ({ page }) => {
  await gotoReady(page, '/funnel?range=30');
  await page.getByTestId('funnel-channel').selectOption('Email');
  await expect(page).toHaveURL(/channel=Email/);
  await expect(page.getByTestId('funnel-scope')).toHaveText('Scope: Email sessions only');
  await page.getByTestId('funnel-channel').selectOption('');
  await expect(page).not.toHaveURL(/channel=/);
  await expect(page.getByTestId('funnel-scope')).toHaveText('Scope: All channels');
});

test('a product figure opens on the product page for the same window and channel', async ({ page }) => {
  const outcome = await call('get_product_performance', { range: 30, channel: 'Organic Search', products: ['NT-TENT-RDG2'] });
  const views = ref(outcome, (id) => id.endsWith(':view_sessions'));
  expect(views.href).toBe('/products/prd_ridgeline_2p_tent?range=30&channel=Organic+Search');

  await gotoReady(page, views.href);
  await expect(page.getByTestId('detail-view-sessions')).toHaveText(formatInteger(views.value));
  await expect(page.getByTestId('detail-metrics-scope')).toBeVisible();
});

test('an audit computed on request matches what the audit page shows once run there', async ({ page }) => {
  const outcome = await call('get_audit_findings', { kind: 'seo', products: ['NT-TENT-RDG2'] });
  const data = outcome.data as { pages: { pageId: string; score: number | null; origin: string; href: string }[] };
  const summary = data.pages[0];
  if (summary === undefined) throw new Error('no page');
  expect(summary.origin).toBe('computed-on-request');

  await gotoReady(page, summary.href);
  await expect(page.getByTestId('never-audited')).toBeVisible();
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('page-score')).toHaveText(String(summary.score));
  for (const auditRef of outcome.meta.auditRefs) {
    await expect(page.getByTestId(`check-${auditRef.ruleId}`)).toHaveAttribute('data-status', auditRef.status);
  }
});
