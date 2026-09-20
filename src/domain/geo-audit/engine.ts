import { auditInputFingerprint } from '../audit-fingerprint';
import type { AuditCheck, PageSnapshot, StoredAuditResult } from '../types';
import {
  DEFAULT_GEO_CONFIG,
  GEO_MAX_POINTS_PER_RULE,
  GEO_RULE_VERSION,
  type GeoAuditConfig,
} from './config';
import { GEO_RULES } from './rules';

/**
 * The GEO audit engine.
 *
 * Deliberately separate from the SEO engine: different rules, different scoring
 * and a different claim about what the number means. Sharing only the audit
 * record shape means a failure in one cannot present itself as a result from
 * the other.
 */

export interface GeoScoreSummary {
  /** 0–100, or null when nothing could be evaluated. */
  score: number | null;
  earnedPoints: number;
  possiblePoints: number;
  coverage: number;
  evaluableCount: number;
  totalCount: number;
}

/**
 * Each evaluable rule contributes 0, 5 or 10 points out of a possible 10, so
 * every rule carries the same weight. Rules that could not be evaluated are
 * removed from both the earned and the possible totals — never scored as zero,
 * which would be indistinguishable from "the page does not have it".
 */
export function scoreGeoChecks(checks: readonly AuditCheck[]): GeoScoreSummary {
  const evaluable = checks.filter((check) => check.points !== null);
  const totalCount = checks.length;

  if (evaluable.length === 0) {
    return {
      score: null,
      earnedPoints: 0,
      possiblePoints: 0,
      coverage: 0,
      evaluableCount: 0,
      totalCount,
    };
  }

  const earnedPoints = evaluable.reduce(
    (sum, check) => sum + (check.points ?? 0),
    0,
  );
  const possiblePoints = evaluable.length * GEO_MAX_POINTS_PER_RULE;

  return {
    score: Math.round((100 * earnedPoints) / possiblePoints),
    earnedPoints,
    possiblePoints,
    coverage: totalCount === 0 ? 0 : evaluable.length / totalCount,
    evaluableCount: evaluable.length,
    totalCount,
  };
}

export interface RunGeoAuditInput {
  snapshot: PageSnapshot;
  /** The brand the entity rule looks for. */
  brand: string;
  /** Injected so results are reproducible in tests. */
  now: string;
  config?: GeoAuditConfig;
}

export function runGeoAudit({
  snapshot,
  brand,
  now,
  config = DEFAULT_GEO_CONFIG,
}: RunGeoAuditInput): StoredAuditResult {
  const checks = GEO_RULES.map((rule) => rule({ snapshot, brand, config }));
  const summary = scoreGeoChecks(checks);

  return {
    id: `audit_geo_${snapshot.id}`,
    pageId: snapshot.id,
    kind: 'geo',
    ruleVersion: GEO_RULE_VERSION,
    checks,
    score: summary.score,
    coverage: summary.coverage,
    auditedAt: now,
    // The GEO engine never reads the product keyword, so a keyword edit must
    // not make a GEO result stale.
    inputFingerprint: auditInputFingerprint('geo', snapshot, ''),
  };
}
