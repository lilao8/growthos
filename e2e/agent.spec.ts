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
  await expect(turn.getByTestId('agent-summary')).toContainText('只能读取和分析数据', { timeout: 15_000 });
  await expect(turn.getByTestId('agent-finding')).toHaveCount(0);
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
