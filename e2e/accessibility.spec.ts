import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility.
 *
 * What this file is and is not, stated plainly because the distinction matters
 * and is easy to blur:
 *
 * - It runs **axe-core**, the standard automated rule set, against every route
 *   at WCAG 2.1 A and AA. That catches contrast failures, missing names,
 *   broken landmark and heading structure, invalid ARIA and unlabelled
 *   controls. It is real, and it is what the project asserts.
 * - It then checks the **accessibility tree** — the structure a screen reader
 *   actually navigates — for the properties this project claims: one main
 *   landmark, one h1, named navigation regions, a current-page marker, tables
 *   with captions, and status regions that announce.
 * - It is **not a screen reader test**. Automated rules catch perhaps a third
 *   of real barriers. Nobody has listened to this app with VoiceOver or NVDA,
 *   so this project does not claim the experience is good — only that these
 *   specific, checkable properties hold.
 */

/**
 * The sentinel each route renders once its client data has arrived.
 *
 * Waiting on the <h1> is not enough: it is server-rendered, so it is visible
 * before any table or chart exists. Counting then finds zero — a race that
 * happened to pass in Chromium and failed in WebKit.
 */
const READY: Record<string, string> = {
  '/dashboard': 'dashboard-ready',
  '/analytics': 'analytics-ready',
  '/funnel': 'funnel-ready',
  '/amazon/advertising': 'advertising-ready',
  '/amazon': 'amazon-overview',
  '/recommendations': 'recommendations-ready',
};

const ROUTES = [
  '/dashboard',
  '/products',
  '/products/prd_ridgeline_2p_tent',
  '/seo',
  '/seo/snap_ridgeline_2p_tent',
  '/geo',
  '/geo/snap_ridgeline_2p_tent',
  '/content',
  '/content/idea_r-value-faq',
  '/analytics',
  '/funnel',
  '/amazon',
  '/amazon/lst_trailcell_lantern',
  '/amazon/advertising',
  '/recommendations',
  '/about-project',
] as const;

/** Navigates and waits for the route's content, not just its heading. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const sentinel = READY[route];
  if (sentinel !== undefined) {
    await expect(page.getByTestId(sentinel)).toBeVisible();
  }
}

function audit(page: Page) {
  return new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
}

/** Readable failure output: rule, impact and the elements it fired on. */
function describeViolations(
  violations: Awaited<ReturnType<ReturnType<typeof audit>['analyze']>>['violations'],
): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n` +
        violation.nodes
          .slice(0, 4)
          .map((node) => `    ${node.target.join(' ')}`)
          .join('\n'),
    )
    .join('\n');
}

for (const route of ROUTES) {
  test(`${route} has no automatically detectable WCAG A/AA violations`, async ({
    page,
  }) => {
    await open(page, route);

    const results = await audit(page).analyze();
    expect(
      results.violations,
      `${route}\n${describeViolations(results.violations)}`,
    ).toEqual([]);
  });
}

test('the audited pages are checked with audits actually run', async ({
  page,
}) => {
  // Scores, issue tables and evidence only exist after an audit. Checking the
  // empty state alone would skip most of the markup these pages render.
  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  await expect(page.getByTestId('run-all-message')).toContainText(/Audited/);
  await page.goto('/geo');
  await page.getByTestId('run-all-geo-audits').click();
  await expect(page.getByTestId('run-all-geo-message')).toContainText(/Audited/);
  await page.goto('/amazon');
  await page.getByTestId('run-all-listing-audits').click();
  await expect(page.getByTestId('run-all-listing-message')).toContainText(
    /Audited/,
  );

  for (const route of ['/seo', '/geo', '/amazon', '/recommendations']) {
    await open(page, route);
    const results = await audit(page).analyze();
    expect(
      results.violations,
      `${route} (post-audit)\n${describeViolations(results.violations)}`,
    ).toEqual([]);
  }
});

test('the mobile navigation panel is accessible when open', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  await page.getByTestId('menu-toggle').click();
  await expect(page.getByTestId('mobile-nav')).toBeVisible();

  const results = await audit(page).analyze();
  expect(
    results.violations,
    `mobile nav open\n${describeViolations(results.violations)}`,
  ).toEqual([]);
});

test('error and empty states are accessible too', async ({ page }) => {
  for (const url of [
    '/dashboard?demo=error',
    '/dashboard?demo=empty',
    '/amazon/advertising?demo=error',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await audit(page).analyze();
    expect(
      results.violations,
      `${url}\n${describeViolations(results.violations)}`,
    ).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// Accessibility tree: the structure a screen reader navigates
// ---------------------------------------------------------------------------

test('every route exposes exactly one main landmark and one h1', async ({
  page,
}) => {
  for (const route of ROUTES) {
    await open(page, route);
    await expect(page.getByRole('main'), route).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 }), route).toHaveCount(1);
  }
});

test('navigation regions are named, so they are distinguishable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  // Two navs in the sidebar; unnamed, a screen reader would announce both as
  // "navigation" and give no way to tell them apart.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'About' })).toHaveCount(1);
});

test('the current page is marked in the navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/funnel');

  // Playwright's role selector has no `current` option, so this asserts the
  // attribute a screen reader actually reads.
  const current = page
    .getByRole('navigation', { name: 'Main' })
    .locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/Funnel/);
});

test('data tables carry a caption naming what they contain', async ({
  page,
}) => {
  // A table without a caption is announced as "table, N rows" and nothing else.
  for (const route of ['/analytics', '/funnel', '/amazon/advertising']) {
    await open(page, route);

    const captions = await page.locator('table > caption').count();
    const tables = await page.locator('table').count();
    expect(tables, route).toBeGreaterThan(0);
    expect(captions, `${route}: ${tables} tables, ${captions} captions`).toBe(
      tables,
    );
  }
});

test('no chart is the only way to reach its numbers', async ({ page }) => {
  for (const route of ['/dashboard', '/analytics', '/amazon/advertising']) {
    await open(page, route);

    // Line drawings are hidden rather than exposed as unnamed images.
    const lines = page.getByTestId('trend-chart');
    for (let index = 0; index < (await lines.count()); index += 1) {
      await expect(lines.nth(index), route).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }

    // Bar charts keep their list semantics, because their labels are text.
    const bars = page.getByTestId('bar-chart');
    for (let index = 0; index < (await bars.count()); index += 1) {
      await expect(bars.nth(index), route).toHaveRole('list');
    }

    // And in every case the figures also exist as text on the page.
    expect(await page.locator('table').count(), route).toBeGreaterThan(0);
  }
});

test('loading, error and success states announce themselves', async ({
  page,
}) => {
  await page.goto('/dashboard?demo=error');
  // Scoped to the app's own alert: Next injects a route announcer that also
  // carries role="alert", so an unscoped query matches two elements.
  await expect(page.getByTestId('state-error')).toHaveRole('alert');

  await page.goto('/seo');
  await page.getByTestId('run-all-audits').click();
  const status = page.getByTestId('run-all-message');
  await expect(status).toContainText(/Audited/);
  // role="status" is an implicit polite live region, so the result is spoken
  // without stealing focus. Asserting the role rather than aria-live checks
  // the thing that actually governs the behaviour.
  await expect(status).toHaveRole('status');
});

test('every form control has an accessible name', async ({ page }) => {
  for (const route of [
    '/products/prd_ridgeline_2p_tent',
    '/content/idea_r-value-faq',
    '/amazon/lst_trailcell_lantern',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const controls = page.locator(
      'input:not([type="hidden"]), textarea, select',
    );
    const count = await controls.count();
    expect(count, route).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const name = await control.evaluate((node) => {
        const el = node as HTMLElement;
        const id = el.getAttribute('id');
        const labelled = el.getAttribute('aria-label');
        if (labelled !== null && labelled.trim() !== '') return labelled;
        const describedBy = el.getAttribute('aria-labelledby');
        if (describedBy !== null) {
          return document.getElementById(describedBy)?.textContent ?? '';
        }
        if (id !== null) {
          return document.querySelector(`label[for="${id}"]`)?.textContent ?? '';
        }
        return el.closest('label')?.textContent ?? '';
      });
      expect(
        name.trim(),
        `${route}: control ${index} has no accessible name`,
      ).not.toBe('');
    }
  }
});

test('the whole task list is reachable and operable by keyboard', async ({
  page,
}) => {
  await page.goto('/recommendations');
  const card = page.locator('[data-testid^="rec-"][data-source]').first();
  await expect(card).toBeVisible();

  const id = ((await card.getAttribute('data-testid')) ?? '').replace(
    /^rec-/,
    '',
  );
  const toggle = page.getByTestId(`rec-toggle-${id}`);

  await toggle.focus();
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(page.getByTestId('rec-done-value')).toHaveText('1');

  // And back again, without a mouse.
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.getByTestId('rec-done-value')).toHaveText('0');
});

test('filters are real buttons that report their pressed state', async ({
  page,
}) => {
  await page.goto('/recommendations');
  const filter = page.getByTestId('rec-filter-source-seo');

  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await filter.focus();
  await filter.press('Enter');
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
});
