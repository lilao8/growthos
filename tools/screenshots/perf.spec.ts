import { test, type Page } from '@playwright/test';

/**
 * Performance measurement against the production build.
 *
 * Deliberately not a gate: it prints numbers for the report rather than
 * asserting thresholds, because a timing assertion on a developer laptop would
 * be flaky and would tell nobody anything useful. It measures what the browser
 * itself reports — navigation timing, transferred bytes and the largest
 * contentful paint — not a synthetic score.
 *
 * Run with: npm run perf
 */

/* eslint-disable no-console -- printing the table IS this script's output; it
   is not application code and never runs as part of the quality gates. */

const ROUTES = [
  '/dashboard',
  '/products',
  '/products/prd_ridgeline_2p_tent',
  '/seo',
  '/geo',
  '/content',
  '/analytics',
  '/funnel',
  '/recommendations',
  '/about-project',
];

interface Sample {
  route: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  lcpMs: number | null;
  transferredKb: number;
  requests: number;
}

async function measure(page: Page, route: string): Promise<Sample> {
  let requests = 0;
  const onResponse = async (): Promise<void> => {
    requests += 1;
  };
  page.on('response', onResponse);

  await page.goto(route, { waitUntil: 'load' });
  // Give client rendering and LCP a moment to settle before reading.
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const result = await page.evaluate(async () => {
    const nav = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming | undefined;

    const lcp = await new Promise<number | null>((resolve) => {
      const entries = performance.getEntriesByType('largest-contentful-paint');
      const last = entries[entries.length - 1];
      if (last !== undefined) {
        resolve(last.startTime);
        return;
      }
      const observer = new PerformanceObserver((list) => {
        const items = list.getEntries();
        const latest = items[items.length - 1];
        if (latest !== undefined) {
          observer.disconnect();
          resolve(latest.startTime);
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 1500);
    });

    const bytes = performance
      .getEntriesByType('resource')
      .reduce(
        (sum, entry) => sum + (entry as PerformanceResourceTiming).transferSize,
        0,
      );

    return {
      ttfb: nav?.responseStart ?? 0,
      dcl: nav?.domContentLoadedEventEnd ?? 0,
      load: nav?.loadEventEnd ?? 0,
      lcp,
      bytes: bytes + (nav?.transferSize ?? 0),
    };
  });

  page.off('response', onResponse);

  return {
    route,
    ttfbMs: Math.round(result.ttfb),
    domContentLoadedMs: Math.round(result.dcl),
    loadMs: Math.round(result.load),
    lcpMs: result.lcp === null ? null : Math.round(result.lcp),
    transferredKb: Math.round(result.bytes / 1024),
    requests,
  };
}

test('measure every module against the production build', async ({ page }) => {
  test.slow();
  const samples: Sample[] = [];
  for (const route of ROUTES) {
    samples.push(await measure(page, route));
  }

  const pad = (value: string, width: number): string => value.padEnd(width);
  const lines = [
    `${pad('route', 36)}${pad('ttfb', 8)}${pad('dcl', 8)}${pad('load', 8)}${pad('lcp', 8)}${pad('kb', 8)}reqs`,
    ...samples.map(
      (s) =>
        `${pad(s.route, 36)}${pad(String(s.ttfbMs), 8)}${pad(String(s.domContentLoadedMs), 8)}${pad(String(s.loadMs), 8)}${pad(s.lcpMs === null ? 'n/a' : String(s.lcpMs), 8)}${pad(String(s.transferredKb), 8)}${s.requests}`,
    ),
  ];
  console.log(`\n${lines.join('\n')}\n`);
});
