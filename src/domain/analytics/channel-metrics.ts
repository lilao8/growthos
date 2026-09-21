import type { DateWindow } from '../demo-window';
import { isWithinWindow } from '../demo-window';
import {
  averageOrderValue,
  conversionRate,
  customerAcquisitionCost,
  distinctCount,
  returnOnAdSpend,
  type MetricValue,
} from '../metrics';
import { sumCents } from '../money';
import { CHANNELS } from '../types';
import type {
  Cents,
  Channel,
  ChannelSpend,
  Order,
  SessionFact,
} from '../types';

/**
 * Channel analytics.
 *
 * Two rules govern everything here, and both are easy to get wrong:
 *
 * 1. **Ratios are aggregated, never averaged.** Every rate is computed by
 *    summing numerators and denominators first. Averaging per-day conversion
 *    rates would weight a quiet Tuesday the same as a busy Saturday.
 * 2. **Users are de-duplicated, and channel user counts do not add up.** One
 *    person can arrive from search on Monday and from email on Friday, so they
 *    appear in two channels. The site total is a distinct count over the whole
 *    window, which is why it is smaller than the sum of the channel rows. The
 *    UI says so.
 *
 * Sessions, orders and revenue *do* add up: each session carries exactly one
 * attributed channel, so those columns reconcile against the site total.
 */

/**
 * Below this many orders, a channel's rates swing wildly on one extra sale, so
 * they are flagged rather than presented as if they were settled facts.
 */
export const LOW_VOLUME_ORDER_THRESHOLD = 25;

export interface ChannelRow {
  channel: Channel;
  sessions: number;
  /** Distinct users for this channel. NOT additive across channels. */
  users: number;
  orders: number;
  revenueCents: Cents;
  newCustomers: number;
  acquisitionSpendCents: Cents;
  adSpendCents: Cents;
  conversionRate: MetricValue;
  /** In cents; null when there are no orders. */
  averageOrderValueCents: MetricValue;
  /** In cents; null when nothing was spent acquiring, or nobody was acquired. */
  cacCents: MetricValue;
  /** A multiple; null for any channel with no ad spend. */
  roas: MetricValue;
  /**
   * True when this channel has too few orders for its rates to be trusted.
   * The figures are still shown — hiding them would be worse — but the UI marks
   * them so nobody reads a 0.74% rate off five orders as a settled fact.
   */
  lowVolume: boolean;
}

export interface AnalyticsTotals {
  window: DateWindow;
  sessions: number;
  /** Distinct across the whole window — not the sum of the channel rows. */
  users: number;
  orders: number;
  revenueCents: Cents;
  newCustomers: number;
  acquisitionSpendCents: Cents;
  adSpendCents: Cents;
  conversionRate: MetricValue;
  averageOrderValueCents: MetricValue;
  cacCents: MetricValue;
  /** Paid-attributed revenue ÷ ad spend across channels that bought media. */
  roas: MetricValue;
  paidAttributedRevenueCents: Cents;
}

export interface DailyPoint {
  date: string;
  sessions: number;
  orders: number;
  revenueCents: Cents;
}

export interface SourceRow {
  source: string;
  sessions: number;
  orders: number;
  revenueCents: Cents;
  conversionRate: MetricValue;
}

export interface LandingPageRow {
  landingPageId: string;
  sessions: number;
  orders: number;
  revenueCents: Cents;
  conversionRate: MetricValue;
}

export interface AnalyticsInput {
  sessions: readonly SessionFact[];
  orders: readonly Order[];
  channelSpend: readonly ChannelSpend[];
  window: DateWindow;
}

interface WindowedData {
  sessions: SessionFact[];
  orders: Order[];
  spend: ChannelSpend[];
  ordersById: Map<string, Order>;
}

/** Every filter in the module goes through here, so one window governs all. */
function applyWindow(input: AnalyticsInput): WindowedData {
  const sessions = input.sessions.filter((session) =>
    isWithinWindow(session.date, input.window),
  );
  const orders = input.orders.filter((order) =>
    isWithinWindow(order.date, input.window),
  );
  return {
    sessions,
    orders,
    spend: input.channelSpend.filter((row) =>
      isWithinWindow(row.date, input.window),
    ),
    ordersById: new Map(orders.map((order) => [order.id, order])),
  };
}

function purchased(session: SessionFact): boolean {
  return session.stages.includes('purchase');
}

export function channelRows(input: AnalyticsInput): ChannelRow[] {
  const data = applyWindow(input);

  return CHANNELS.map((channel) => {
    const channelSessions = data.sessions.filter(
      (session) => session.channel === channel,
    );
    const channelOrders = data.orders.filter(
      (order) => order.attributedChannel === channel,
    );
    const channelSpend = data.spend.filter((row) => row.channel === channel);

    const sessions = distinctCount(channelSessions, (s) => s.sessionId);
    const orders = distinctCount(channelOrders, (order) => order.id);
    const revenueCents = sumCents(
      channelOrders.map((order) => order.revenueCents),
    );
    const newCustomers = channelOrders.filter(
      (order) => order.isNewCustomer,
    ).length;
    const acquisitionSpendCents = sumCents(
      channelSpend.map((row) => row.acquisitionSpendCents),
    );
    const adSpendCents = sumCents(channelSpend.map((row) => row.adSpendCents));

    return {
      channel,
      sessions,
      users: distinctCount(channelSessions, (s) => s.userId),
      orders,
      revenueCents,
      newCustomers,
      acquisitionSpendCents,
      adSpendCents,
      conversionRate: conversionRate(
        distinctCount(channelSessions.filter(purchased), (s) => s.sessionId),
        sessions,
      ),
      averageOrderValueCents: averageOrderValue(revenueCents, orders),
      cacCents: customerAcquisitionCost(acquisitionSpendCents, newCustomers),
      // A channel that bought no media has no return on ad spend. Reporting
      // anything here — zero, infinity, the revenue figure — would be a lie.
      roas: returnOnAdSpend(revenueCents, adSpendCents),
      lowVolume: orders < LOW_VOLUME_ORDER_THRESHOLD,
    };
  });
}

export function analyticsTotals(input: AnalyticsInput): AnalyticsTotals {
  const data = applyWindow(input);

  const sessions = distinctCount(data.sessions, (s) => s.sessionId);
  const orders = distinctCount(data.orders, (order) => order.id);
  const revenueCents = sumCents(data.orders.map((order) => order.revenueCents));
  const newCustomers = data.orders.filter((order) => order.isNewCustomer).length;
  const acquisitionSpendCents = sumCents(
    data.spend.map((row) => row.acquisitionSpendCents),
  );
  const adSpendCents = sumCents(data.spend.map((row) => row.adSpendCents));

  // ROAS is revenue attributable to paid media over the money spent on it, so
  // only channels that actually bought media take part on either side.
  const paidChannels = new Set(
    data.spend
      .filter((row) => row.adSpendCents > 0)
      .map((row) => row.channel),
  );
  const paidAttributedRevenueCents = sumCents(
    data.orders
      .filter((order) => paidChannels.has(order.attributedChannel))
      .map((order) => order.revenueCents),
  );

  return {
    window: input.window,
    sessions,
    users: distinctCount(data.sessions, (s) => s.userId),
    orders,
    revenueCents,
    newCustomers,
    acquisitionSpendCents,
    adSpendCents,
    conversionRate: conversionRate(
      distinctCount(data.sessions.filter(purchased), (s) => s.sessionId),
      sessions,
    ),
    averageOrderValueCents: averageOrderValue(revenueCents, orders),
    cacCents: customerAcquisitionCost(acquisitionSpendCents, newCustomers),
    roas: returnOnAdSpend(paidAttributedRevenueCents, adSpendCents),
    paidAttributedRevenueCents,
  };
}

/** One point per day in the window, including days with no traffic at all. */
export function dailySeries(input: AnalyticsInput): DailyPoint[] {
  const data = applyWindow(input);

  const sessionsByDate = new Map<string, Set<string>>();
  for (const session of data.sessions) {
    const existing = sessionsByDate.get(session.date);
    if (existing === undefined) {
      sessionsByDate.set(session.date, new Set([session.sessionId]));
    } else {
      existing.add(session.sessionId);
    }
  }

  const ordersByDate = new Map<string, Order[]>();
  for (const order of data.orders) {
    const existing = ordersByDate.get(order.date);
    if (existing === undefined) ordersByDate.set(order.date, [order]);
    else existing.push(order);
  }

  const points: DailyPoint[] = [];
  const { start, days } = input.window;
  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftDate(start, offset);
    const dayOrders = ordersByDate.get(date) ?? [];
    points.push({
      date,
      sessions: sessionsByDate.get(date)?.size ?? 0,
      orders: dayOrders.length,
      revenueCents: sumCents(dayOrders.map((order) => order.revenueCents)),
    });
  }
  return points;
}

function shiftDate(start: string, offset: number): string {
  const base = new Date(`${start}T00:00:00.000Z`);
  return new Date(base.getTime() + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * AI referral sources. These are demo labels: in reality a large share of
 * assistant-driven visits arrive with no referrer at all and land in Direct,
 * so any figure here undercounts. The UI states that.
 */
export function sourceRows(
  input: AnalyticsInput,
  channel: Channel,
): SourceRow[] {
  const data = applyWindow(input);
  const channelSessions = data.sessions.filter(
    (session) => session.channel === channel,
  );

  const bySource = new Map<string, SessionFact[]>();
  for (const session of channelSessions) {
    const existing = bySource.get(session.source);
    if (existing === undefined) bySource.set(session.source, [session]);
    else existing.push(session);
  }

  return [...bySource.entries()]
    .map(([source, group]) => {
      const sessions = distinctCount(group, (s) => s.sessionId);
      const groupOrders = group
        .map((session) =>
          session.orderId === null
            ? undefined
            : data.ordersById.get(session.orderId),
        )
        .filter((order): order is Order => order !== undefined);

      return {
        source,
        sessions,
        orders: groupOrders.length,
        revenueCents: sumCents(groupOrders.map((order) => order.revenueCents)),
        conversionRate: conversionRate(
          distinctCount(group.filter(purchased), (s) => s.sessionId),
          sessions,
        ),
      };
    })
    .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source));
}

export function landingPageRows(input: AnalyticsInput): LandingPageRow[] {
  const data = applyWindow(input);

  const byPage = new Map<string, SessionFact[]>();
  for (const session of data.sessions) {
    const existing = byPage.get(session.landingPageId);
    if (existing === undefined) byPage.set(session.landingPageId, [session]);
    else existing.push(session);
  }

  return [...byPage.entries()]
    .map(([landingPageId, group]) => {
      const sessions = distinctCount(group, (s) => s.sessionId);
      const groupOrders = group
        .map((session) =>
          session.orderId === null
            ? undefined
            : data.ordersById.get(session.orderId),
        )
        .filter((order): order is Order => order !== undefined);

      return {
        landingPageId,
        sessions,
        orders: groupOrders.length,
        revenueCents: sumCents(groupOrders.map((order) => order.revenueCents)),
        conversionRate: conversionRate(
          distinctCount(group.filter(purchased), (s) => s.sessionId),
          sessions,
        ),
      };
    })
    .sort(
      (a, b) =>
        b.sessions - a.sessions || a.landingPageId.localeCompare(b.landingPageId),
    );
}
