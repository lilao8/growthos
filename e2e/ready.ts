import { expect, type Page } from '@playwright/test';

/**
 * Navigate, then wait until the page is actually interactive.
 *
 * `page.goto` resolves on the server's HTML. For these routes that is not the
 * same thing as being ready: every view is a client component that renders a
 * loading block, fetches, and only then renders its content. Worse, the parts
 * a test reaches for first — a search box, a filter — are inside the client
 * component's server-rendered output, so they exist in the DOM *before* React
 * hydrates and attaches their handlers.
 *
 * That gap produced a real CI failure. On WebKit, `fill()` ran before
 * hydration: it set the input's DOM value, no handler was listening, and
 * hydration then reset the controlled input to its empty state. The product
 * list stayed unfiltered permanently, so `toHaveCount(1)`'s five seconds of
 * polling just re-read a DOM that had settled on the wrong answer. Retrying an
 * assertion cannot fix a page that has stopped changing.
 *
 * Each sentinel below renders only inside its view's resolved branch, which
 * makes it proof of both hydration and the finished fetch.
 */
const SENTINELS: ReadonlyArray<readonly [RegExp, string]> = [
  // Longest-prefix first: /products/x must not match the /products rule.
  [/^\/products\/[^/]+$/, 'product-detail-ready'],
  [/^\/seo\/[^/]+$/, 'seo-page-ready'],
  [/^\/geo\/[^/]+$/, 'geo-page-ready'],
  [/^\/content\/[^/]+$/, 'content-detail-ready'],
  [/^\/amazon\/advertising$/, 'advertising-ready'],
  [/^\/amazon\/[^/]+$/, 'listing-detail'],
  [/^\/products$/, 'products-ready'],
  [/^\/seo$/, 'seo-overview'],
  [/^\/geo$/, 'geo-overview'],
  [/^\/content$/, 'content-ready'],
  [/^\/amazon$/, 'amazon-overview'],
  [/^\/dashboard$/, 'dashboard-ready'],
  [/^\/analytics$/, 'analytics-ready'],
  [/^\/funnel$/, 'funnel-ready'],
  [/^\/recommendations$/, 'recommendations-ready'],
];

export function sentinelFor(path: string): string | null {
  const route = path.split('?')[0] ?? path;
  for (const [pattern, testId] of SENTINELS) {
    if (pattern.test(route)) return testId;
  }
  return null;
}

/**
 * Wait for the current route's sentinel.
 *
 * Two cases are a deliberate no-op rather than an error, so that callers need
 * no special-casing:
 *
 * - A route with no sentinel, such as the server-rendered About page, which
 *   has no data to wait for.
 * - Any URL carrying a `demo=` seam. Those exist to force loading, error,
 *   empty and storage-failure states, and in most of them the resolved branch
 *   never renders, so waiting for it could only ever time out. Rather than
 *   copying a table of which seams settle and which do not — a second place
 *   to keep in step with the seam itself — the rule is simply that a demo URL
 *   is the test's own business. A test that drives a seam to completion waits
 *   for what it expects explicitly.
 *
 * This is encoded here instead of at the call sites because the first attempt
 * at it was a filter over `page.goto`'s *argument text*: it skipped URLs with
 * a literal `?`, which silently failed for `goto(url)` inside a loop whose
 * values all carried one. A rule that reads the real URL cannot miss that way.
 */
export async function waitForReady(page: Page, path: string): Promise<void> {
  if (/[?&]demo=/.test(path)) return;
  const testId = sentinelFor(path);
  if (testId === null) return;
  await expect(page.getByTestId(testId)).toBeVisible();
}

/**
 * The default way to open a page in these tests.
 *
 * A demo seam skips the wait, so those URLs are safe to pass. Keep plain
 * `page.goto` for the other two cases: a deliberately unknown id, where the
 * route still matches a sentinel the not-found branch never renders, and a
 * test that needs the Response object back.
 */
export async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForReady(page, path);
}
