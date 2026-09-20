import type { DateWindow } from './demo-window';
import { isWithinWindow } from './demo-window';
import { safeRatio, type MetricValue } from './metrics';
import { sumCents } from './money';
import { ORGANIC_CHANNEL } from './dashboard-summary';
import type { Cents, Order, OrderItem, SessionFact } from './types';

/**
 * Per-product derived metrics.
 *
 * Definition note, because this one is easy to get wrong: a product's conversion
 * rate is `sessions that purchased this product ÷ sessions that viewed this
 * product`. Its denominator is therefore product-specific, and the rates of two
 * products cannot be added or averaged — one session can view several products
 * and so appear in several denominators. The UI states this.
 *
 * Revenue is apportioned by order line, so the revenue of all products sums
 * exactly to order revenue.
 */

export interface ProductMetrics {
  productId: string;
  /** Sessions that viewed this product. The conversion denominator. */
  viewSessions: number;
  /** Of those, sessions attributed to Organic Search. */
  organicSessions: number;
  purchaseSessions: number;
  conversionRate: MetricValue;
  revenueCents: Cents;
  unitsSold: number;
}

export function emptyProductMetrics(productId: string): ProductMetrics {
  return {
    productId,
    viewSessions: 0,
    organicSessions: 0,
    purchaseSessions: 0,
    conversionRate: null,
    revenueCents: 0,
    unitsSold: 0,
  };
}

export function computeProductMetrics(
  sessions: readonly SessionFact[],
  orders: readonly Order[],
  orderItems: readonly OrderItem[],
  window: DateWindow,
): Map<string, ProductMetrics> {
  const windowSessions = sessions.filter((session) =>
    isWithinWindow(session.date, window),
  );
  const windowOrderIds = new Set(
    orders
      .filter((order) => isWithinWindow(order.date, window))
      .map((order) => order.id),
  );
  const windowItems = orderItems.filter((item) =>
    windowOrderIds.has(item.orderId),
  );

  const productsByOrder = new Map<string, Set<string>>();
  for (const item of windowItems) {
    const existing = productsByOrder.get(item.orderId);
    if (existing === undefined) {
      productsByOrder.set(item.orderId, new Set([item.productId]));
    } else {
      existing.add(item.productId);
    }
  }

  const viewSessions = new Map<string, Set<string>>();
  const organicSessions = new Map<string, Set<string>>();
  const purchaseSessions = new Map<string, Set<string>>();

  const addTo = (
    map: Map<string, Set<string>>,
    productId: string,
    sessionId: string,
  ): void => {
    const existing = map.get(productId);
    if (existing === undefined) map.set(productId, new Set([sessionId]));
    else existing.add(sessionId);
  };

  for (const session of windowSessions) {
    for (const productId of session.viewedProductIds) {
      addTo(viewSessions, productId, session.sessionId);
      if (session.channel === ORGANIC_CHANNEL) {
        addTo(organicSessions, productId, session.sessionId);
      }
    }

    if (session.orderId === null) continue;
    const purchased = productsByOrder.get(session.orderId);
    if (purchased === undefined) continue;
    for (const productId of purchased) {
      addTo(purchaseSessions, productId, session.sessionId);
    }
  }

  const revenue = new Map<string, Cents[]>();
  const units = new Map<string, number>();
  for (const item of windowItems) {
    const lineTotal = item.unitPriceCents * item.quantity - item.discountCents;
    const existing = revenue.get(item.productId);
    if (existing === undefined) revenue.set(item.productId, [lineTotal]);
    else existing.push(lineTotal);
    units.set(item.productId, (units.get(item.productId) ?? 0) + item.quantity);
  }

  const productIds = new Set<string>([
    ...viewSessions.keys(),
    ...purchaseSessions.keys(),
    ...revenue.keys(),
  ]);

  const result = new Map<string, ProductMetrics>();
  for (const productId of productIds) {
    const views = viewSessions.get(productId)?.size ?? 0;
    const purchases = purchaseSessions.get(productId)?.size ?? 0;
    result.set(productId, {
      productId,
      viewSessions: views,
      organicSessions: organicSessions.get(productId)?.size ?? 0,
      purchaseSessions: purchases,
      conversionRate: safeRatio(purchases, views),
      revenueCents: sumCents(revenue.get(productId) ?? []),
      unitsSold: units.get(productId) ?? 0,
    });
  }
  return result;
}
