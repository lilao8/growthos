import type { AuditCheck } from './types';

/**
 * Scoring shared by every status-weighted audit engine.
 *
 * Extracted from the SEO engine in Dispatch 10, when a third engine needed the
 * same arithmetic. The project rule is that a scoring formula is defined once;
 * copying this into each engine would let the definitions drift apart silently,
 * which is the exact failure the rule exists to prevent.
 *
 * What is shared is the *arithmetic*, not the *meaning*. Each engine still
 * decides its own rules, thresholds and version, and what its number claims.
 * GEO deliberately does not use this: it bands each rule 0/5/10 instead, which
 * is a different formula and lives with the GEO engine.
 */

/** Points earned per status. `unknown` earns nothing and is not counted at all. */
const STATUS_POINTS = { pass: 1, warning: 0.5, error: 0 } as const;

export interface ScoreSummary {
  /** 0–100, or null when nothing could be evaluated. */
  score: number | null;
  /** Evaluable checks ÷ total checks, 0–1. */
  coverage: number;
  evaluableCount: number;
  totalCount: number;
}

/**
 * Evaluable checks are weighted equally. A check that could not be evaluated is
 * excluded from both the numerator and the denominator, and shows up as reduced
 * coverage instead — scoring an unknown as either a pass or a failure would be
 * inventing a verdict.
 */
export function scoreChecks(checks: readonly AuditCheck[]): ScoreSummary {
  const evaluable = checks.filter((item) => item.status !== 'unknown');
  const totalCount = checks.length;

  if (evaluable.length === 0) {
    return {
      score: null,
      coverage: 0,
      evaluableCount: 0,
      totalCount,
    };
  }

  const earned = evaluable.reduce(
    (sum, item) =>
      sum + (STATUS_POINTS[item.status as keyof typeof STATUS_POINTS] ?? 0),
    0,
  );

  return {
    score: Math.round((100 * earned) / evaluable.length),
    coverage: totalCount === 0 ? 0 : evaluable.length / totalCount,
    evaluableCount: evaluable.length,
    totalCount,
  };
}

/** Counts used by every overview and by the dashboard, from one shared source. */
export interface CheckTally {
  critical: number;
  warnings: number;
  passed: number;
  unknown: number;
}

export function tallyChecks(checks: readonly AuditCheck[]): CheckTally {
  let critical = 0;
  let warnings = 0;
  let passed = 0;
  let unknown = 0;

  for (const item of checks) {
    if (item.status === 'error') critical += 1;
    else if (item.status === 'warning') warnings += 1;
    else if (item.status === 'pass') passed += 1;
    else unknown += 1;
  }

  return { critical, warnings, passed, unknown };
}

export function addTallies(a: CheckTally, b: CheckTally): CheckTally {
  return {
    critical: a.critical + b.critical,
    warnings: a.warnings + b.warnings,
    passed: a.passed + b.passed,
    unknown: a.unknown + b.unknown,
  };
}

export const EMPTY_TALLY: CheckTally = {
  critical: 0,
  warnings: 0,
  passed: 0,
  unknown: 0,
};

/**
 * Average across audited entities.
 *
 * This is a mean of per-entity scores, so every audited entity counts once
 * regardless of how many checks it had. Entities with a null score (nothing
 * evaluable) are excluded, and the count of contributors is returned so the UI
 * can state exactly what the average covers.
 */
export function averageScore(scores: readonly (number | null)[]): {
  average: number | null;
  pagesCounted: number;
} {
  const usable = scores.filter((score): score is number => score !== null);
  if (usable.length === 0) return { average: null, pagesCounted: 0 };
  const total = usable.reduce((sum, score) => sum + score, 0);
  return {
    average: Math.round(total / usable.length),
    pagesCounted: usable.length,
  };
}
