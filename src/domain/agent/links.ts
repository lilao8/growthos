import { DEMO_AS_OF, type DemoRangeDays } from '../demo-window';
import type { Channel, IsoDate } from '../types';
import { CHANNEL_PARAM, END_PARAM, RANGE_PARAM } from '../url-params';

/**
 * Evidence links.
 *
 * Every link names the window and scope its figure was computed for, using the
 * same parameter names the pages parse. Opening one is therefore a re-run of
 * the same calculation on the same data, not a pointer to a page that happens
 * to show a similar number.
 */

function withQuery(path: string, params: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) query.set(key, value);
  }
  // Every caller passes at least a range, so the query is never empty.
  return `${path}?${query.toString()}`;
}

/** The demo end date is the pages' default, so it is left out of the URL. */
function endValue(end: IsoDate): string | null {
  return end === DEMO_AS_OF ? null : end;
}

export function analyticsHref(
  range: DemoRangeDays,
  end: IsoDate = DEMO_AS_OF,
): string {
  return withQuery('/analytics', {
    [RANGE_PARAM]: String(range),
    [END_PARAM]: endValue(end),
  });
}

export function funnelHref(
  range: DemoRangeDays,
  channel: Channel | null,
  end: IsoDate = DEMO_AS_OF,
): string {
  return withQuery('/funnel', {
    [RANGE_PARAM]: String(range),
    [CHANNEL_PARAM]: channel,
    [END_PARAM]: endValue(end),
  });
}

export function productHref(
  productId: string,
  range: DemoRangeDays,
  channel: Channel | null = null,
): string {
  return withQuery(`/products/${encodeURIComponent(productId)}`, {
    [RANGE_PARAM]: String(range),
    [CHANNEL_PARAM]: channel,
  });
}

export function auditHref(kind: 'seo' | 'geo', pageId: string): string {
  return `/${kind}/${encodeURIComponent(pageId)}`;
}
