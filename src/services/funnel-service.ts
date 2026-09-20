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

export interface FunnelView {
  range: AnalyticsRange;
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
): Promise<FunnelState> {
  const window = windowForRange(range);

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

  const report = buildFunnel({ sessions: traffic.sessions, window });
  const view: FunnelView = {
    range,
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
