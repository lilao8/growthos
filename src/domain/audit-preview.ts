import { readAudit } from './audit-lookup';
import { runGeoAudit } from './geo-audit/engine';
import { runSeoAudit } from './seo-audit/engine';
import type {
  AuditKind,
  AuditResult,
  PageSnapshot,
  StoredAuditResult,
} from './types';

/**
 * The audit to show for a page as it is now, without saving anything.
 *
 * If a stored audit exists and still matches the page, that is the answer. If
 * the page was never audited, or changed after its audit, the same versioned
 * engine runs on the current snapshot and the result is marked as a preview.
 * The agent's audit tool and the audit pages' read-only preview both go
 * through here, so an agent citation and the page it links to are computed by
 * one function from one snapshot.
 */

export type AuditOrigin = 'stored' | 'computed-on-request';

export interface CurrentAudit {
  audit: AuditResult;
  origin: AuditOrigin;
  /** Why it had to be computed. null when the stored audit was current. */
  computedBecause: 'not-audited' | 'stale' | null;
}

export interface CurrentAuditInput {
  kind: AuditKind;
  snapshot: PageSnapshot;
  /** Read by SEO only. */
  primaryKeyword: string;
  brand: string;
  stored: readonly StoredAuditResult[];
  now: string;
}

export function currentAudit(input: CurrentAuditInput): CurrentAudit {
  // The GEO fingerprint does not read the keyword, so passing it is harmless.
  const existing = readAudit(input.stored, input.snapshot, input.primaryKeyword, input.kind);
  if (existing !== null && !existing.stale) {
    return { audit: existing, origin: 'stored', computedBecause: null };
  }
  const fresh =
    input.kind === 'seo'
      ? runSeoAudit({ snapshot: input.snapshot, primaryKeyword: input.primaryKeyword, now: input.now })
      : runGeoAudit({ snapshot: input.snapshot, brand: input.brand, now: input.now });
  return {
    // Computed from this exact snapshot a moment ago, so it cannot be stale.
    audit: { ...fresh, stale: false },
    origin: 'computed-on-request',
    computedBecause: existing === null ? 'not-audited' : 'stale',
  };
}
