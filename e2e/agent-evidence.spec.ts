import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';
import { runTool, type RunToolOutcome } from '../src/services/agent-tools/registry';
import type { ToolContext } from '../src/services/agent-tools/types';
import { createFixtureTrafficRepository } from '../src/repositories/traffic-repository';
import { buildDemoSeedState } from '../src/fixtures/demo-seed';
import { formatInteger, formatMoneyMetric, formatMultiple, formatPercent } from '../src/domain/format';
import { formatCents } from '../src/domain/money';

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

test('every channel figure an agent can cite is on the page it links to', async ({ page }) => {
  const outcome = await call('get_channel_performance', { range: 30, compare: false });
  await gotoReady(page, '/analytics?range=30');
  const cells: Record<string, { testId: (channel: string) => string; format: (value: number | null) => string }> = {
    sessions: { testId: (c) => `sessions-${c}`, format: formatInteger },
    orders: { testId: (c) => `orders-${c}`, format: formatInteger },
    revenue: { testId: (c) => `revenue-${c}`, format: (v) => formatCents(v ?? 0) },
    conversion_rate: { testId: (c) => `cvr-${c}`, format: (v) => formatPercent(v) },
    cac: { testId: (c) => `cac-${c}`, format: formatMoneyMetric },
    roas: { testId: (c) => `roas-${c}`, format: (v) => formatMultiple(v) },
    ad_spend: { testId: (c) => `ad-spend-${c}`, format: (v) => formatCents(v ?? 0) },
  };
  let checked = 0;
  for (const ref of outcome.meta.refs) {
    expect(ref.href).toBe('/analytics?range=30');
    const metric = ref.refId.split(':').pop() ?? '';
    if (ref.channel === null) {
      if (metric === 'average_order_value') {
        await expect(page.getByTestId('analytics-aov-value')).toHaveText(formatMoneyMetric(ref.value));
        checked += 1;
      }
      continue;
    }
    const cell = cells[metric];
    if (cell === undefined) throw new Error(`no page cell for ${metric}`);
    await expect(page.getByTestId(cell.testId(ref.channel))).toContainText(cell.format(ref.value));
    checked += 1;
  }
  expect(checked).toBe(8 * 7 + 1);
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

test('on a slow source, the funnel never shows a new channel label over old numbers', async ({ page }) => {
  const email = await call('get_funnel', { range: 30, channel: 'Email', compare: false });
  const emailSessions = ref(email, (id) => id.endsWith(':Email:all:stage:session'));

  await page.goto('/funnel?demo=slow&range=30');
  await expect(page.getByTestId('funnel-ready')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('funnel-channel').selectOption('Email');

  // While Email is loading, no stage numbers are on screen at all.
  await expect(page.getByTestId('funnel-ready')).toHaveCount(0);
  await expect(page.getByTestId('stage-session')).toHaveCount(0);

  await expect(page.getByTestId('funnel-scope')).toHaveText('Scope: Email sessions only', { timeout: 10_000 });
  await expect(page.getByTestId('stage-session')).toContainText(formatInteger(emailSessions.value));
});

test('a product figure opens on the product page for the same window and channel', async ({ page }) => {
  const outcome = await call('get_product_performance', { range: 30, channel: 'Organic Search', products: ['NT-TENT-RDG2'] });
  const views = ref(outcome, (id) => id.endsWith(':view_sessions'));
  expect(views.href).toBe('/products/prd_ridgeline_2p_tent?range=30&channel=Organic+Search');

  await gotoReady(page, views.href);
  await expect(page.getByTestId('detail-view-sessions')).toHaveText(formatInteger(views.value));
  const purchases = ref(outcome, (id) => id.endsWith(':purchase_sessions'));
  const conversion = ref(outcome, (id) => id.endsWith(':conversion_rate'));
  const revenue = ref(outcome, (id) => id.endsWith(':revenue'));
  await expect(page.getByTestId('detail-purchase-sessions')).toHaveText(formatInteger(purchases.value));
  await expect(page.getByTestId('detail-conversion-rate')).toHaveText(formatPercent(conversion.value));
  await expect(page.getByTestId('detail-revenue')).toHaveText(formatMoneyMetric(revenue.value));
  await expect(page.getByTestId('detail-metrics-scope')).toBeVisible();
});

async function storageSnapshot(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      Object.keys(window.localStorage)
        .sort()
        .map((key) => [key, window.localStorage.getItem(key)]),
    ),
  );
}

// Each product has findings of that kind in the demo data, so there is something to cite.
const AUDIT_CASES = [
  { kind: 'seo', sku: 'NT-TENT-RDG2' },
  { kind: 'geo', sku: 'NT-TENT-TARP1' },
] as const;

for (const { kind, sku } of AUDIT_CASES) {
  test(`a ${kind.toUpperCase()} audit computed on request opens as a read-only preview with the cited checks`, async ({ page }) => {
    const outcome = await call('get_audit_findings', { kind, products: [sku] });
    const data = outcome.data as { pages: { pageId: string; score: number | null; origin: string; href: string }[] };
    const summary = data.pages[0];
    if (summary === undefined) throw new Error('no page');
    expect(summary.origin).toBe('computed-on-request');
    expect(summary.href).toBe(`/${kind}/${summary.pageId}?preview=1`);
    expect(outcome.meta.auditRefs.length).toBeGreaterThan(0);

    const prefix = kind === 'seo' ? '' : 'geo-';
    await gotoReady(page, summary.href);
    const before = await storageSnapshot(page);

    await expect(page.getByTestId(`${prefix}audit-preview-notice`)).toContainText('Preview, not saved');
    await expect(page.getByTestId(`${prefix}never-audited`)).toHaveCount(0);
    if (kind === 'seo') {
      await expect(page.getByTestId('page-score')).toHaveText(String(summary.score));
    }
    for (const auditRef of outcome.meta.auditRefs) {
      const check = page.getByTestId(`${kind === 'seo' ? 'check' : 'geo-check'}-${auditRef.ruleId}`);
      await expect(check).toHaveAttribute('data-status', auditRef.status);
      if (auditRef.evidence !== null) await expect(check).toContainText(auditRef.evidence);
    }

    // Reading the evidence changed nothing the visitor has stored.
    expect(await storageSnapshot(page)).toBe(before);
    await page.reload();
    await expect(page.getByTestId(`${prefix}audit-preview-notice`)).toBeVisible();
    expect(await storageSnapshot(page)).toBe(before);
  });
}

test('saving the audit from a preview replaces the preview with the saved result', async ({ page }) => {
  await gotoReady(page, '/seo/snap_ridgeline_2p_tent?preview=1');
  await expect(page.getByTestId('audit-preview-notice')).toBeVisible();
  const previewScore = await page.getByTestId('page-score').innerText();
  await page.getByTestId('run-page-audit').click();
  await expect(page.getByTestId('audit-preview-notice')).toHaveCount(0);
  await expect(page.getByTestId('page-score')).toHaveText(previewScore);
});

test('without the preview flag an unaudited page still says so', async ({ page }) => {
  await gotoReady(page, '/seo/snap_ridgeline_2p_tent');
  await expect(page.getByTestId('never-audited')).toBeVisible();
  await expect(page.getByTestId('audit-preview-notice')).toHaveCount(0);
});
