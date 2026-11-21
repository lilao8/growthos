import { buildFunnel, type FunnelReport } from '@/domain/funnel/funnel-metrics';
import {
  funnelRecommendations,
  type FunnelRecommendation,
} from '@/domain/funnel/recommendations';
import {
  windowForRange,
  DEFAULT_ANALYTICS_RANGE,
  type AnalyticsRange,
} from './analytics-service';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import { sessionsForChannel } from '@/domain/analytics/session-filters';
import { DEMO_AS_OF } from '@/domain/demo-window';
import type { Channel, IsoDate } from '@/domain/types';

/**
 * Funnel service.
 *
 * Uses the same ranges and the same session facts as Analytics, so the funnel's
 * first layer and the analytics session count are the same number by
 * construction rather than by coincidence.
 */

export interface FunnelDeps {
  traffic: TrafficRepository;
}

export interface FunnelOptions {
  /** null = every channel. A channel funnel is the same calculation on fewer sessions. */
  channel?: Channel | null;
  /** Validated end date for comparison-period links; defaults to the demo end. */
  end?: IsoDate;
}

export interface FunnelView {
  range: AnalyticsRange;
  channel: Channel | null;
  report: FunnelReport;
  recommendations: FunnelRecommendation[];
}

export type FunnelState =
  | { status: 'ready'; view: FunnelView }
  | { status: 'empty'; view: FunnelView }
  | { status: 'error'; message: string };

export async function loadFunnel(
  deps: FunnelDeps,
  range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE,
  options: FunnelOptions = {},
): Promise<FunnelState> {
  const channel = options.channel ?? null;
  const window = windowForRange(range, options.end ?? DEMO_AS_OF);

  let traffic;
  try {
    traffic = await deps.traffic.load();
  } catch (cause) {
    return {
      status: 'error',
      message:
        cause instanceof Error ? cause.message : 'Could not load funnel data.',
    };
  }

  const report = buildFunnel({
    sessions: sessionsForChannel(traffic.sessions, channel),
    window,
  });
  const view: FunnelView = {
    range,
    channel,
    report,
    recommendations: funnelRecommendations({
      transitions: report.transitions,
      largestDropOff: report.largestDropOff,
    }),
  };

  return report.totalSessions === 0
    ? { status: 'empty', view }
    : { status: 'ready', view };
}
