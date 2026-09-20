import { DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import {
  summarizeDashboard,
  type DashboardSummary,
} from '@/domain/dashboard-summary';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';

/**
 * Dashboard service: loads facts, delegates the arithmetic to the pure
 * summariser, and classifies the outcome. The component renders whatever comes
 * back and owns none of this logic.
 */

export type DashboardState =
  | { status: 'ready'; summary: DashboardSummary }
  | { status: 'empty'; summary: DashboardSummary }
  | { status: 'error'; message: string };

export async function loadDashboard(
  repository: TrafficRepository = createFixtureTrafficRepository(),
  window: DateWindow = DEMO_WINDOW,
): Promise<DashboardState> {
  let sessions;
  let orders;
  try {
    const data = await repository.load();
    sessions = data.sessions;
    orders = data.orders;
  } catch (cause) {
    return {
      status: 'error',
      message:
        cause instanceof Error
          ? cause.message
          : 'Could not load demo traffic data.',
    };
  }

  const summary = summarizeDashboard(sessions, orders, window);
  // No sessions in the window is an empty result, not a failure: the screen
  // should explain there is nothing to report rather than show zeros as fact.
  return summary.sessions === 0
    ? { status: 'empty', summary }
    : { status: 'ready', summary };
}
