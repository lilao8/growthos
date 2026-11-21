import { PRIORITIES, type Priority } from '../types';

/**
 * How the agent orders findings.
 *
 * Three inputs, applied in a fixed order so the ranking can be explained in a
 * sentence:
 *
 * 1. **Rule severity** — the priority the existing recommendation engine
 *    already gave the finding. Nothing here re-scores a rule.
 * 2. **Evidence strength** — a finding resting on fewer orders or sessions
 *    than the project's own thresholds is `limited` and drops one priority
 *    level. Below the session floor it is `insufficient` and is not ranked at
 *    all: it becomes a data gap to report, not a conclusion.
 * 3. **Affected sample** — within a level, more affected sessions first, then
 *    the stable id so the order never depends on input order.
 */

export const AGENT_PRIORITY_VERSION = 'agent-priority-1.0.0';

export type EvidenceStrength = 'sufficient' | 'limited' | 'insufficient';

export interface SampleThresholds {
  minimumSessions: number;
  /** null when the finding does not rest on a rate over orders. */
  minimumOrders: number | null;
}

export interface Sample {
  sessions: number;
  /** null when orders are not what the finding is computed over. */
  orders: number | null;
}

export function evidenceStrength(
  sample: Sample,
  thresholds: SampleThresholds,
): EvidenceStrength {
  if (sample.sessions < thresholds.minimumSessions) return 'insufficient';
  if (
    thresholds.minimumOrders !== null &&
    sample.orders !== null &&
    sample.orders < thresholds.minimumOrders
  ) {
    return 'limited';
  }
  return 'sufficient';
}

export interface RankableFinding {
  id: string;
  priority: Priority;
  strength: EvidenceStrength;
  /** Sessions the finding is about. null when unknown; sorts last. */
  affectedSessions: number | null;
}

export interface RankedFinding<T extends RankableFinding> {
  finding: T;
  /** 1-based. */
  rank: number;
  effectivePriority: Priority;
  /** True when limited evidence moved the finding down a level. */
  downgraded: boolean;
}

export interface RankingResult<T extends RankableFinding> {
  ranked: RankedFinding<T>[];
  /** Below the session floor: reported as gaps, never as conclusions. */
  insufficient: T[];
  version: string;
}

function levelOf(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

export function downgrade(priority: Priority): Priority {
  const next = PRIORITIES[levelOf(priority) + 1];
  return next ?? priority;
}

/** Unknown sorts below zero: "nobody" is a fact, "not recorded" is not. */
function sessionKey(finding: RankableFinding): number {
  return finding.affectedSessions ?? -1;
}

export function rankFindings<T extends RankableFinding>(
  findings: readonly T[],
): RankingResult<T> {
  const insufficient: T[] = [];
  const candidates: Omit<RankedFinding<T>, 'rank'>[] = [];

  for (const finding of findings) {
    if (finding.strength === 'insufficient') {
      insufficient.push(finding);
      continue;
    }
    const limited = finding.strength === 'limited';
    const effectivePriority = limited
      ? downgrade(finding.priority)
      : finding.priority;
    candidates.push({
      finding,
      effectivePriority,
      downgraded: effectivePriority !== finding.priority,
    });
  }

  candidates.sort((a, b) => {
    const level = levelOf(a.effectivePriority) - levelOf(b.effectivePriority);
    if (level !== 0) return level;
    const sessions = sessionKey(b.finding) - sessionKey(a.finding);
    if (sessions !== 0) return sessions;
    return a.finding.id < b.finding.id ? -1 : a.finding.id > b.finding.id ? 1 : 0;
  });

  return {
    ranked: candidates.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    })),
    insufficient,
    version: AGENT_PRIORITY_VERSION,
  };
}
