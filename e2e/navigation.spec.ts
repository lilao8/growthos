import { expect, test } from '@playwright/test';
import { gotoReady } from './ready';

/**
 * Navigation, active state, keyboard operation and layout at the three widths
 * named in the acceptance criteria.
 */

const ROUTES = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/products', label: 'Products' },
  { path: '/seo', label: 'SEO Audit' },
  { path: '/geo', label: 'GEO Audit' },
  { path: '/content', label: 'Content' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/funnel', label: 'Funnel' },
  { path: '/amazon', label: 'Amazon Listings' },
  { path: '/amazon/advertising', label: 'Amazon Advertising' },
  { path: '/recommendations', label: 'Recommendations' },
] as const;

test('every route is reachable and renders its own heading', async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} should return 200`).toBe(200);
    await expect(
      page.getByRole('heading', { name: route.label, level: 1 }),
    ).toBeVisible();

  }
});

test('the current route is marked with aria-current in the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/analytics');

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
  await gotoReady(page, '/dashboard');

  await page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-funnel').click();
  await expect(page).toHaveURL(/\/funnel$/);
  await expect(page.getByRole('heading', { name: 'Funnel', level: 1 })).toBeVisible();
});

test('navigation is operable by keyboard alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/dashboard');

  const link = page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-products');
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/products$/);
});

test('mobile menu toggles, reports its state and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoReady(page, '/dashboard');

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
  await gotoReady(page, '/dashboard');

  await page.getByTestId('menu-toggle').click();
  await page.getByTestId('mobile-nav').getByTestId('nav-seo-audit').click();

  await expect(page).toHaveURL(/\/seo$/);
  await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
});

for (const width of [375, 768, 1440]) {
  test(`no page-level horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoReady(page, '/dashboard');
    await expect(page.getByTestId('dashboard-ready')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the sidebar is visible on desktop and hidden on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/dashboard');
  await expect(page.getByTestId('menu-toggle')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByTestId('nav-dashboard'),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('menu-toggle')).toBeVisible();
});

test('a skip link comes first and jumps to the main content', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, '/dashboard');

  const skip = page.getByRole('link', { name: 'Skip to main content' });

  // True on every engine: it is the first focusable thing in the document,
  // and activating it lands on the main landmark.
  await skip.focus();
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.getByRole('main')).toBeVisible();

  // Reaching it with Tab is engine-dependent. Safari does not move focus to
  // links on Tab unless "Press Tab to highlight each item on a webpage" is
  // enabled — a browser preference this app cannot set. VoiceOver reaches the
  // link regardless, so the skip link still does its job there; what is not
  // true is that Tab alone gets you to it.
  if (testInfo.project.name !== 'webkit') {
    await gotoReady(page, '/dashboard');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
  }
});
