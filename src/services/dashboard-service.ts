import { DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import {
  analyticsTotals,
  channelRows,
  dailySeries,
  type ChannelRow,
  type DailyPoint,
} from '@/domain/analytics/channel-metrics';
import {
  summarizeDashboard,
  ORGANIC_CHANNEL,
  type DashboardSummary,
} from '@/domain/dashboard-summary';
import { buildFunnel, type FunnelReport } from '@/domain/funnel/funnel-metrics';
import {
  funnelRecommendations,
  type FunnelRecommendation,
} from '@/domain/funnel/recommendations';
import { safeRatio, type MetricValue } from '@/domain/metrics';
import type { Cents } from '@/domain/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';

/**
 * Dashboard service.
 *
 * Since Dispatch 6 this reads the same channel calculations the Analytics
 * module uses, rather than a parallel implementation — the dashboard headline
 * and the analytics table cannot disagree because there is only one sum.
 */

export interface DashboardHeadline extends DashboardSummary {
  /** Revenue attributed to the Organic Search channel. */
  organicRevenueCents: Cents;
  cacCents: MetricValue;
  roas: MetricValue;
  users: number;
  /** Sessions reaching add-to-cart ÷ sessions. */
  addToCartRate: MetricValue;
  /** Sessions reaching checkout ÷ sessions. */
  checkoutRate: MetricValue;
}

export type DashboardState =
  | {
      status: 'ready';
      summary: DashboardHeadline;
      daily: DailyPoint[];
      channels: ChannelRow[];
      funnel: FunnelReport;
      /** The funnel findings worth surfacing on the dashboard. */
      alerts: FunnelRecommendation[];
    }
  | { status: 'empty'; summary: DashboardHeadline }
  | { status: 'error'; message: string };

export async function loadDashboard(
  repository: TrafficRepository = createFixtureTrafficRepository(),
  window: DateWindow = DEMO_WINDOW,
): Promise<DashboardState> {
  let data;
  try {
    data = await repository.load();
  } catch (cause) {
    return {
      status: 'error',
      message:
        cause instanceof Error
          ? cause.message
          : 'Could not load demo traffic data.',
    };
  }

  const input = {
    sessions: data.sessions,
    orders: data.orders,
    channelSpend: data.channelSpend,
    window,
  };

  const base = summarizeDashboard(data.sessions, data.orders, window);
  const totals = analyticsTotals(input);
  const channels = channelRows(input);
  const organic = channels.find((row) => row.channel === ORGANIC_CHANNEL);

  // The funnel is built from the same sessions, so the dashboard's cart and
  // checkout rates and the funnel page cannot disagree.
  const funnel = buildFunnel({ sessions: data.sessions, window });
  const stageSessions = (stage: string): number =>
    funnel.stages.find((row) => row.stage === stage)?.sessions ?? 0;

  const summary: DashboardHeadline = {
    ...base,
    organicRevenueCents: organic?.revenueCents ?? 0,
    cacCents: totals.cacCents,
    roas: totals.roas,
    users: totals.users,
    addToCartRate: safeRatio(stageSessions('add_to_cart'), funnel.totalSessions),
    checkoutRate: safeRatio(stageSessions('checkout'), funnel.totalSessions),
  };

  // No sessions in the window is an empty result, not a failure: the screen
  // should explain there is nothing to report rather than show zeros as fact.
  if (summary.sessions === 0) {
    return { status: 'empty', summary };
  }

  return {
    status: 'ready',
    summary,
    daily: dailySeries(input),
    channels,
    funnel,
    alerts: funnelRecommendations({
      transitions: funnel.transitions,
      largestDropOff: funnel.largestDropOff,
    }),
  };
}
