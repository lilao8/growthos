import { auditInputFingerprint } from '../audit-fingerprint';
import type {
  AuditCheck,
  PageSnapshot,
  StoredAuditResult,
} from '../types';
import { DEFAULT_SEO_CONFIG, SEO_RULE_VERSION, type SeoAuditConfig } from './config';
import { SEO_RULES } from './rules';

/**
 * The SEO audit engine.
 *
 * Pure: the snapshot, the keyword, the config and the clock all come in as
 * arguments, so a result is fully reproducible and the same inputs always give
 * the same score.
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
      coverage: totalCount === 0 ? 0 : 0,
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

export interface RunSeoAuditInput {
  snapshot: PageSnapshot;
  /** From the product record. Empty string means no keyword is set. */
  primaryKeyword: string;
  /** Injected so results are reproducible in tests. */
  now: string;
  config?: SeoAuditConfig;
}

export function runSeoAudit({
  snapshot,
  primaryKeyword,
  now,
  config = DEFAULT_SEO_CONFIG,
}: RunSeoAuditInput): StoredAuditResult {
  const checks = SEO_RULES.map((rule) =>
    rule({ snapshot, primaryKeyword, config }),
  );
  const summary = scoreChecks(checks);

  return {
    id: `audit_seo_${snapshot.id}`,
    pageId: snapshot.id,
    kind: 'seo',
    ruleVersion: SEO_RULE_VERSION,
    checks,
    score: summary.score,
    coverage: summary.coverage,
    auditedAt: now,
    inputFingerprint: auditInputFingerprint(snapshot, primaryKeyword),
  };
}

/** Counts used by the overview and by the dashboard, from one shared source. */
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
 * Portfolio score across audited pages.
 *
 * This is a mean of page scores, so every audited page counts once regardless
 * of how many checks it had. Pages with a null score (nothing evaluable) are
 * excluded, and the count of contributing pages is returned so the UI can state
 * exactly which pages the average covers.
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
