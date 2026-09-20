import { expect, test } from '@playwright/test';

/**
 * Navigation, active state, keyboard operation and layout at the three widths
 * named in the acceptance criteria.
 */

const ROUTES = [
  { path: '/dashboard', label: 'Dashboard', implemented: true },
  { path: '/products', label: 'Products', implemented: true },
  { path: '/seo', label: 'SEO Audit', implemented: false },
  { path: '/geo', label: 'GEO Audit', implemented: false },
  { path: '/content', label: 'Content', implemented: false },
  { path: '/analytics', label: 'Analytics', implemented: false },
  { path: '/funnel', label: 'Funnel', implemented: false },
  { path: '/recommendations', label: 'Recommendations', implemented: false },
] as const;

test('every route is reachable and pending modules say so', async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} should return 200`).toBe(200);
    await expect(
      page.getByRole('heading', { name: route.label, level: 1 }),
    ).toBeVisible();

    if (route.implemented) {
      await expect(page.getByTestId('not-implemented')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('not-implemented')).toBeVisible();
    }
  }
});

test('the current route is marked with aria-current in the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analytics');

  const sidebar = page.getByRole('navigation', { name: 'Main' });
  await expect(sidebar.getByTestId('nav-analytics')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(sidebar.getByTestId('nav-dashboard')).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('sidebar links navigate between modules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  await page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-funnel').click();
  await expect(page).toHaveURL(/\/funnel$/);
  await expect(page.getByRole('heading', { name: 'Funnel', level: 1 })).toBeVisible();
});

test('navigation is operable by keyboard alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const link = page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-products');
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/products$/);
});

test('mobile menu toggles, reports its state and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');

  const toggle = page.getByTestId('menu-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('mobile-nav')).toHaveCount(0);

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('mobile-nav')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
});

test('mobile menu closes after navigating', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');

  await page.getByTestId('menu-toggle').click();
  await page.getByTestId('mobile-nav').getByTestId('nav-seo-audit').click();

  await expect(page).toHaveURL(/\/seo$/);
  await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
});

for (const width of [375, 768, 1440]) {
  test(`no page-level horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-ready')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the sidebar is visible on desktop and hidden on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByTestId('menu-toggle')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-dashboard'),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('menu-toggle')).toBeVisible();
});

test('a skip link is the first thing keyboard focus reaches', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
});
