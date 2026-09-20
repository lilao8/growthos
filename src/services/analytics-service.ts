import { buildWindow, DEMO_AS_OF, type DateWindow } from '@/domain/demo-window';
import {
  analyticsTotals,
  channelRows,
  dailySeries,
  landingPageRows,
  sourceRows,
  type AnalyticsTotals,
  type ChannelRow,
  type DailyPoint,
  type LandingPageRow,
  type SourceRow,
} from '@/domain/analytics/channel-metrics';
import {
  computeProductMetrics,
  type ProductMetrics,
} from '@/domain/product-metrics';
import type { Product } from '@/domain/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import type { DemoStateRepository } from '@/repositories/types';

/**
 * Analytics service.
 *
 * One window is resolved here and passed to every calculation, so the overview,
 * the trend, the channel table and the top lists always describe the same days.
 * Changing the range changes one value, not six.
 */

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = 90;

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  const parsed = Number(value);
  return (ANALYTICS_RANGES as readonly number[]).includes(parsed)
    ? (parsed as AnalyticsRange)
    : DEFAULT_ANALYTICS_RANGE;
}

/** Every range ends on the same fixed demo day, so they are comparable. */
export function windowForRange(range: AnalyticsRange): DateWindow {
  return buildWindow(range, DEMO_AS_OF);
}

export interface AnalyticsDeps {
  traffic: TrafficRepository;
  /** Optional: only needed to name landing pages and top products. */
  state?: DemoStateRepository;
}

export interface TopProductRow {
  product: Product;
  metrics: ProductMetrics;
}

export interface NamedLandingPageRow extends LandingPageRow {
  /** The product behind the landing page, when there is one. */
  productTitle: string | null;
  productId: string | null;
}

export interface AnalyticsView {
  window: DateWindow;
  range: AnalyticsRange;
  totals: AnalyticsTotals;
  channels: ChannelRow[];
  daily: DailyPoint[];
  aiSources: SourceRow[];
  landingPages: NamedLandingPageRow[];
  topProducts: TopProductRow[];
}

export type AnalyticsState =
  | { status: 'ready'; view: AnalyticsView }
  | { status: 'empty'; view: AnalyticsView }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export async function loadAnalytics(
  deps: AnalyticsDeps,
  range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE,
): Promise<AnalyticsState> {
  const window = windowForRange(range);

  let traffic;
  try {
    traffic = await deps.traffic.load();
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load analytics data.'),
    };
  }

  // The catalogue is a nicety here: without it the numbers still work, the
  // labels are just page ids instead of product names.
  let products: Product[] = [];
  let snapshotToProduct = new Map<string, Product>();
  if (deps.state !== undefined) {
    try {
      const state = (await deps.state.load()).state;
      products = state.products;
      snapshotToProduct = new Map(
        state.pageSnapshots
          .map((snapshot): [string, Product] | null => {
            const product = state.products.find(
              (candidate) => candidate.id === snapshot.productId,
            );
            return product === undefined ? null : [snapshot.id, product];
          })
          .filter((entry): entry is [string, Product] => entry !== null),
      );
    } catch {
      // Names are optional; ids remain readable without them.
    }
  }

  const input = {
    sessions: traffic.sessions,
    orders: traffic.orders,
    channelSpend: traffic.channelSpend,
    window,
  };

  const productMetrics = computeProductMetrics(
    traffic.sessions,
    traffic.orders,
    traffic.orderItems,
    window,
  );

  const topProducts: TopProductRow[] = products
    .map((product) => ({
      product,
      metrics: productMetrics.get(product.id),
    }))
    .filter(
      (row): row is TopProductRow => row.metrics !== undefined,
    )
    .sort((a, b) => b.metrics.revenueCents - a.metrics.revenueCents)
    .slice(0, 8);

  const landingPages: NamedLandingPageRow[] = landingPageRows(input)
    .slice(0, 8)
    .map((row) => {
      const product = snapshotToProduct.get(row.landingPageId);
      return {
        ...row,
        productTitle: product?.title ?? null,
        productId: product?.id ?? null,
      };
    });

  const view: AnalyticsView = {
    window,
    range,
    totals: analyticsTotals(input),
    channels: channelRows(input),
    daily: dailySeries(input),
    aiSources: sourceRows(input, 'AI Referral'),
    landingPages,
    topProducts,
  };

  return view.totals.sessions === 0
    ? { status: 'empty', view }
    : { status: 'ready', view };
}
