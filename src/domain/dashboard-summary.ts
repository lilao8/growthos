import type { DateWindow } from './demo-window';
import { isWithinWindow } from './demo-window';
import {
  averageOrderValue,
  conversionRate,
  distinctCount,
  type MetricValue,
} from './metrics';
import { sumCents } from './money';
import type { Cents, Order, SessionFact } from './types';

/**
 * Dashboard aggregation — a pure function over the same session and order facts
 * every other module will use. Injecting the window keeps it testable and keeps
 * "which 90 days" out of the component tree.
 *
 * Dispatch 1 surfaces exactly six metrics. Organic Revenue, CAC, ROAS,
 * add-to-cart rate and checkout rate arrive with Dispatch 6 and 7.
 */

export const ORGANIC_CHANNEL = 'Organic Search';

export interface DashboardSummary {
  window: DateWindow;
  sessions: number;
  revenueCents: Cents;
  orders: number;
  conversionRate: MetricValue;
  /** In cents, possibly fractional. Null when there are no orders. */
  averageOrderValueCents: MetricValue;
  organicSessions: number;
}

function hasPurchased(session: SessionFact): boolean {
  return session.stages.includes('purchase');
}

/**
 * Sessions and orders are filtered by the same window so the six metrics always
 * describe one population. Orders are matched by their own date rather than by
 * their session's, because an order is the revenue event being reported on.
 */
export function summarizeDashboard(
  sessions: readonly SessionFact[],
  orders: readonly Order[],
  window: DateWindow,
): DashboardSummary {
  const windowSessions = sessions.filter((session) =>
    isWithinWindow(session.date, window),
  );
  const windowOrders = orders.filter((order) =>
    isWithinWindow(order.date, window),
  );

  const sessionCount = distinctCount(windowSessions, (s) => s.sessionId);
  const purchaseSessions = distinctCount(
    windowSessions.filter(hasPurchased),
    (s) => s.sessionId,
  );
  const orderCount = distinctCount(windowOrders, (order) => order.id);
  const revenueCents = sumCents(windowOrders.map((order) => order.revenueCents));

  return {
    window,
    sessions: sessionCount,
    revenueCents,
    orders: orderCount,
    conversionRate: conversionRate(purchaseSessions, sessionCount),
    averageOrderValueCents: averageOrderValue(revenueCents, orderCount),
    organicSessions: distinctCount(
      windowSessions.filter((session) => session.channel === ORGANIC_CHANNEL),
      (s) => s.sessionId,
    ),
  };
}
