import type { DateWindow } from '../demo-window';
import { isWithinWindow } from '../demo-window';
import {
  conversionRate,
  distinctCount,
  dropOffRate,
  stageConversion,
  type MetricValue,
} from '../metrics';
import { FUNNEL_STAGES } from '../types';
import type { FunnelStage, SessionFact } from '../types';

/**
 * Conversion funnel over one population of sessions.
 *
 * Rules that keep the numbers honest:
 *
 * - **Every layer counts sessions, de-duplicated.** Not page views, and not
 *   people. A session appears at most once per stage, and the labels say
 *   "sessions" everywhere so the three are never conflated.
 * - **Stages must occur in order.** `stages` is required to be an ordered
 *   prefix of FUNNEL_STAGES. A session that claims checkout without add-to-cart
 *   is not quietly truncated to fit — it is excluded and reported, because
 *   silently repairing it would inflate the layers above.
 * - **Counts are monotonically non-increasing** by construction, and that is
 *   asserted rather than assumed.
 */

export const STAGE_LABELS: Record<FunnelStage, string> = {
  session: 'Sessions',
  product_view: 'Product View',
  add_to_cart: 'Add to Cart',
  checkout: 'Checkout',
  purchase: 'Purchase',
};

export type InvalidReason = 'out-of-order' | 'duplicate-stage' | 'empty';

export interface InvalidSession {
  sessionId: string;
  reason: InvalidReason;
  stages: FunnelStage[];
}

export interface FunnelStageRow {
  stage: FunnelStage;
  label: string;
  /** De-duplicated sessions that reached this stage. */
  sessions: number;
  /** This stage ÷ the first stage. Null when there are no sessions at all. */
  shareOfSessions: MetricValue;
}

export interface FunnelTransition {
  from: FunnelStage;
  to: FunnelStage;
  label: string;
  fromSessions: number;
  toSessions: number;
  /** Null when the upper stage is empty — there is no rate to report. */
  conversion: MetricValue;
  dropOffRate: MetricValue;
  dropOffSessions: number;
  /** False when the upper stage is empty, so this pair cannot be compared. */
  comparable: boolean;
}

export interface FunnelReport {
  window: DateWindow;
  stages: FunnelStageRow[];
  transitions: FunnelTransition[];
  /** Purchasing sessions ÷ all sessions. */
  overallConversion: MetricValue;
  totalSessions: number;
  purchaseSessions: number;
  /**
   * The comparable transition losing the largest share. Null when nothing is
   * comparable, or when no stage loses anyone at all.
   */
  largestDropOff: FunnelTransition | null;
  /** Sessions excluded for having an impossible stage sequence. */
  invalidSessions: InvalidSession[];
  /** Always true for a well-formed report; asserted, not assumed. */
  monotonic: boolean;
}

/** An ordered prefix with no repeats, starting at `session`. */
export function validateStageSequence(
  stages: readonly FunnelStage[],
): InvalidReason | null {
  if (stages.length === 0) return 'empty';
  if (new Set(stages).size !== stages.length) return 'duplicate-stage';
  for (let index = 0; index < stages.length; index += 1) {
    if (stages[index] !== FUNNEL_STAGES[index]) return 'out-of-order';
  }
  return null;
}

export interface FunnelInput {
  sessions: readonly SessionFact[];
  window: DateWindow;
}

export function buildFunnel({ sessions, window }: FunnelInput): FunnelReport {
  const inWindow = sessions.filter((session) =>
    isWithinWindow(session.date, window),
  );

  const invalidSessions: InvalidSession[] = [];
  const valid: SessionFact[] = [];
  for (const session of inWindow) {
    const reason = validateStageSequence(session.stages);
    if (reason === null) {
      valid.push(session);
    } else {
      invalidSessions.push({
        sessionId: session.sessionId,
        reason,
        stages: [...session.stages],
      });
    }
  }

  const stageCounts = FUNNEL_STAGES.map((stage) =>
    distinctCount(
      valid.filter((session) => session.stages.includes(stage)),
      (session) => session.sessionId,
    ),
  );

  const totalSessions = stageCounts[0] ?? 0;
  const purchaseSessions = stageCounts[FUNNEL_STAGES.length - 1] ?? 0;

  const stages: FunnelStageRow[] = FUNNEL_STAGES.map((stage, index) => ({
    stage,
    label: STAGE_LABELS[stage],
    sessions: stageCounts[index] ?? 0,
    shareOfSessions: stageConversion(stageCounts[index] ?? 0, totalSessions),
  }));

  const transitions: FunnelTransition[] = [];
  for (let index = 1; index < FUNNEL_STAGES.length; index += 1) {
    const from = FUNNEL_STAGES[index - 1];
    const to = FUNNEL_STAGES[index];
    if (from === undefined || to === undefined) continue;

    const fromSessions = stageCounts[index - 1] ?? 0;
    const toSessions = stageCounts[index] ?? 0;

    transitions.push({
      from,
      to,
      label: `${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`,
      fromSessions,
      toSessions,
      conversion: stageConversion(toSessions, fromSessions),
      dropOffRate: dropOffRate(toSessions, fromSessions),
      dropOffSessions: Math.max(0, fromSessions - toSessions),
      comparable: fromSessions > 0,
    });
  }

  const monotonic = stageCounts.every(
    (count, index) => index === 0 || count <= (stageCounts[index - 1] ?? 0),
  );

  return {
    window,
    stages,
    transitions,
    overallConversion: conversionRate(purchaseSessions, totalSessions),
    totalSessions,
    purchaseSessions,
    largestDropOff: findLargestDropOff(transitions),
    invalidSessions,
    monotonic,
  };
}

/**
 * The biggest loss, by share rather than by count — a stage that loses 60% of a
 * small group is a worse leak than one losing 20% of a large one, even if the
 * headcount is lower. The count is shown alongside so both readings are
 * available.
 *
 * Transitions whose upper stage is empty cannot be compared and are skipped
 * entirely. Ties go to the earliest stage, because fixing an earlier leak also
 * feeds every stage below it. When nothing is lost anywhere, there is no
 * largest drop-off and the answer is null rather than an arbitrary first row.
 */
export function findLargestDropOff(
  transitions: readonly FunnelTransition[],
): FunnelTransition | null {
  let best: FunnelTransition | null = null;
  for (const transition of transitions) {
    if (!transition.comparable) continue;
    const rate = transition.dropOffRate;
    if (rate === null || rate <= 0) continue;
    if (best === null || rate > (best.dropOffRate ?? 0)) {
      best = transition;
    }
  }
  return best;
}
