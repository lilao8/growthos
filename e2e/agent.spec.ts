import type { AgentTurnResult } from '../src/services/agent/orchestrator';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * The Ops Agent page against the scripted stand-in model: the main question,
 * a follow-up that keeps the dates, a new conversation, a write request, and
 * evidence links that open the pages behind the figures.
 */

const MAIN = '过去 30 天，独立站最该优先排查什么？';

async function storageSnapshot(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      Object.keys(window.localStorage)
        .sort()
        .map((key) => [key, window.localStorage.getItem(key)]),
    ),
  );
}

async function askExample(page: Page, index: number): Promise<void> {
  const before = await page.getByTestId('agent-turn').count();
  await page.getByTestId(`agent-example-${index}`).click();
  await expect(page.getByTestId('agent-turn')).toHaveCount(before + 1, { timeout: 15_000 });
}

test('before asking, the page shows the analysis scope with real dates and examples', async ({ page }) => {
  await gotoReady(page, '/agent');
  await expect(page.getByTestId('agent-scope')).toContainText('2026-08-02');
  await expect(page.getByTestId('agent-scope')).toContainText('2026-08-31');
  await expect(page.getByTestId('agent-scope')).toContainText('30 days');
  await expect(page.getByTestId('agent-scope')).toContainText('All channels');
  await expect(page.getByTestId('agent-example-0')).toHaveText(MAIN);
  await expect(page.getByTestId('agent-ready').getByText('Demo data', { exact: true })).toBeVisible();
});

test('the main question gives ranked findings, each with figures that link to their source', async ({ page }) => {
  await gotoReady(page, '/agent');
  await askExample(page, 0);

  const turn = page.getByTestId('agent-turn').first();
  await expect(turn.getByTestId('agent-summary')).toBeVisible();
  const findings = turn.getByTestId('agent-finding');
  expect(await findings.count()).toBeGreaterThan(0);
  await expect(findings.first()).toContainText('1.');
  await expect(findings.first()).toContainText('Observed');
  await expect(findings.first()).toContainText('How to verify');
  await expect(findings.first().getByTestId('agent-rule-guidance')).toContainText('Rule guidance');
  await expect(turn).not.toContainText('{{');
  await expect(turn.getByTestId('agent-turn-scope')).toContainText('Scripted stand-in model');

  // Every figure is a link with a destination.
  const figures = turn.getByTestId('agent-figure');
  expect(await figures.count()).toBeGreaterThan(0);
  for (const href of await figures.evaluateAll((links) => links.map((link) => link.getAttribute('href')))) {
    expect(href).toMatch(/^\/(analytics|funnel|products|seo|geo)/);
  }

  // The tool log is collapsed by default and lists every call.
  const log = turn.getByTestId('agent-tool-log');
  await expect(log.getByTestId('agent-tool-call').first()).toBeHidden();
  await log.locator('summary').click();
  await expect(log.locator('[data-tool="get_channel_performance"]')).toBeVisible();
  await expect(log.locator('[data-tool="get_audit_findings"]')).toBeVisible();

  // An evidence link opens the page it names.
  const evidence = findings.first().getByTestId('agent-evidence-link').first();
  const href = (await evidence.getAttribute('href')) ?? '';
  await evidence.click();
  await expect(page).toHaveURL(new RegExp(href.replace(/[?.*+^$()|[\]\\]/g, '\\$&')));
});

test('a follow-up keeps the dates, narrows the channel and queries again; a new conversation resets', async ({ page }) => {
  await gotoReady(page, '/agent');
  await askExample(page, 0);
  await askExample(page, 0); // after the first answer, example 0 is the follow-up

  const second = page.getByTestId('agent-turn').nth(1);
  await expect(second.getByTestId('agent-turn-scope')).toContainText('2026-08-02');
  await expect(second.getByTestId('agent-turn-scope')).toContainText('Organic Search');
  await expect(page.getByTestId('agent-scope')).toContainText('Organic Search');
  await expect(page.getByTestId('agent-scope')).toContainText('30 days');

  // The follow-up's figures are written out and link to the Organic Search pages for the same dates.
  await expect(second).not.toContainText('{{');
  const secondFindings = second.getByTestId('agent-finding');
  expect(await secondFindings.count()).toBeGreaterThan(0);
  await expect(secondFindings.first().getByTestId('agent-fact').first()).toContainText('2026-08-02 — 2026-08-31');
  await expect(secondFindings.first().getByTestId('agent-fact').first()).toContainText('Organic Search');
  await expect(secondFindings.first().getByTestId('agent-finding-sample')).toContainText('Scope: Organic Search');
  const followUpLinks = await second.getByTestId('agent-figure').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(followUpLinks.length).toBeGreaterThan(0);
  for (const href of followUpLinks) expect(href).toContain('channel=Organic+Search');

  await second.getByTestId('agent-tool-log').locator('summary').click();
  await expect(second.locator('[data-tool="set_analysis_scope"]')).toBeVisible();
  await expect(second.locator('[data-tool="get_funnel"] pre')).toContainText('"channel":"Organic Search"');
  await expect(second.locator('[data-tool="get_funnel"] pre')).toContainText('"range":30');

  await page.getByTestId('agent-new-conversation').click();
  await expect(page.getByTestId('agent-turn')).toHaveCount(0);
  await expect(page.getByTestId('agent-scope')).toContainText('All channels');
});

test('a write request changes nothing and says the agent is read-only', async ({ page }) => {
  await gotoReady(page, '/agent');
  const before = await storageSnapshot(page);
  await page.getByTestId('agent-question').fill('把第一条建议标记为完成');
  await page.getByTestId('agent-ask').click();
  const turn = page.getByTestId('agent-turn').first();
  // GrowthOS, not the model, writes what happened to the requested action.
  await expect(turn.getByTestId('agent-summary')).toContainText('No action was taken: mark_recommendation_done does not exist', { timeout: 15_000 });
  await expect(turn.getByTestId('agent-finding')).toHaveCount(0);
  await expect(turn.getByTestId('agent-refused')).toContainText('No action was taken');
  await turn.getByTestId('agent-tool-log').locator('summary').click();
  await expect(turn.locator('[data-tool="mark_recommendation_done"]')).toHaveAttribute('data-status', 'unknown-tool');
  expect(await storageSnapshot(page)).toBe(before);
});

test('progress is shown while the agent works, and the question can be asked with the keyboard', async ({ page }) => {
  await gotoReady(page, '/agent');
  await page.getByLabel('Ask about the storefront').fill(MAIN);
  await page.getByTestId('agent-ask').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('agent-turn')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByLabel('Ask a follow-up')).toBeVisible();
});

test('an answered conversation, with its tool log open, has no detectable WCAG A/AA violations', async ({ page }) => {
  await gotoReady(page, '/agent');
  await askExample(page, 0);
  await page.getByTestId('agent-tool-log').first().locator('summary').click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
});

test('a turn that fails keeps the question and offers a retry that works', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/agent', async (route) => {
    calls += 1;
    if (calls === 1) {
      const failed = { type: 'done', result: { status: 'failed', message: 'The model could not be reached (test).', answer: null } };
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify(failed)}\n` });
      return;
    }
    await route.continue();
  });
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-question').fill(MAIN);
  await page.getByTestId('agent-ask').click();
  await expect(page.getByTestId('state-error')).toContainText('could not be reached');
  await expect(page.getByTestId('agent-question')).toHaveValue(MAIN);
  await expect(page.getByTestId('agent-turn')).toHaveCount(0);
  await page.getByRole('button', { name: /retry/i }).click();
  await expect(page.getByTestId('agent-turn')).toHaveCount(1, { timeout: 15_000 });
});

test('a stream that breaks off leaves the analysing state with a retry', async ({ page }) => {
  await page.route('**/api/agent', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'answering' })}\n` }),
  );
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-question').fill(MAIN);
  await page.getByTestId('agent-ask').click();
  await expect(page.getByTestId('state-error')).toBeVisible();
  await expect(page.getByTestId('agent-progress')).toHaveCount(0);
  await expect(page.getByTestId('agent-ask')).toBeEnabled();
  await expect(page.getByTestId('agent-question')).toHaveValue(MAIN);
});

test('a lookup with no alert is answered with the figure itself, which opens on the product page', async ({ page }) => {
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-question').fill('过去 30 天 Ridgeline 从自然搜索获得多少购买会话？');
  await page.getByTestId('agent-ask').click();
  const turn = page.getByTestId('agent-turn').first();
  await expect(turn).toBeVisible({ timeout: 15_000 });
  await expect(turn.getByTestId('agent-finding')).toHaveCount(0);
  const tent = turn.getByTestId('agent-answer-fact').filter({ hasText: 'Ridgeline 2P Backpacking Tent purchasing sessions' });
  await expect(tent).toHaveText('Ridgeline 2P Backpacking Tent purchasing sessions (Organic Search), 2026-08-02 — 2026-08-31: 3');
  await expect(page.getByTestId('agent-scope')).toContainText('All channels');

  await tent.getByTestId('agent-figure').click();
  await expect(page).toHaveURL(/\/products\/prd_ridgeline_2p_tent\?range=30&channel=Organic\+Search$/);
  await expect(page.getByTestId('detail-purchase-sessions')).toHaveText('3');
});

test('leaving the page while the agent works cancels the request', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/agent', async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  const failed = page.waitForEvent('requestfailed', (request) => request.url().includes('/api/agent'));
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-question').fill(MAIN);
  await page.getByTestId('agent-ask').click();
  await expect(page.getByTestId('agent-progress')).toBeVisible();
  await page.getByRole('link', { name: 'Analytics' }).first().click();
  const request = await failed;
  expect(request.failure()).not.toBeNull();
  release();
});

test('a claimed action with no tool behind it is shown as not executed', async ({ page }) => {
  const result: AgentTurnResult = {
    status: 'answered',
    answer: {
      summary: [{ kind: 'text', text: 'No action was taken: this agent has no tool that changes anything, so nothing was changed.' }],
      facts: [],
      findings: [],
      separateFindings: [],
      rankingChannel: null,
      gaps: [],
      source: 'model',
      citedRefIds: [],
    },
    scope: { range: 30, channel: null, products: [] },
    window: { start: '2026-08-02', end: '2026-08-31', days: 30 },
    toolCalls: [],
    toolGaps: [],
    toolNotes: [],
    refusedActions: [],
    failedChecks: [],
    noActionTaken: true,
    citations: { refs: [], comparisons: [], audits: [] },
    provenance: { dataSources: [], ruleVersions: [] },
    usage: null,
    validation: [{ issueCodes: ['action-claim'] }],
    issues: [{ finding: null, code: 'action-claim', message: 'claimed' }],
    notes: [],
    model: 'scripted:test',
    message: null,
  };
  await page.route('**/api/agent', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'done', result })}\n` }),
  );
  await gotoReady(page, '/agent');
  await page.getByTestId('agent-question').fill('把第一条建议标记为完成');
  await page.getByTestId('agent-ask').click();
  await expect(page.getByTestId('agent-refused')).toHaveText('No action was taken. This agent has no tool that changes anything, so nothing was changed.');
  await expect(page.getByTestId('agent-summary')).not.toContainText('已把');
});
