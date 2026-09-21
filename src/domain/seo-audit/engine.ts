import { auditInputFingerprint } from '../audit-fingerprint';
import type { PageSnapshot, StoredAuditResult } from '../types';
import { scoreChecks } from '../audit-scoring';
import { DEFAULT_SEO_CONFIG, SEO_RULE_VERSION, type SeoAuditConfig } from './config';
import { SEO_RULES } from './rules';

/**
 * The SEO audit engine.
 *
 * Pure: the snapshot, the keyword, the config and the clock all come in as
 * arguments, so a result is fully reproducible and the same inputs always give
 * the same score.
 */

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
    inputFingerprint: auditInputFingerprint('seo', snapshot, primaryKeyword),
  };
}
