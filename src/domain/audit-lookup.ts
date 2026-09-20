import { auditInputFingerprint } from './audit-fingerprint';
import type {
  AuditKind,
  AuditResult,
  PageSnapshot,
  StoredAuditResult,
} from './types';

/**
 * Reading stored audits back.
 *
 * Staleness is always derived here rather than read from storage, so a result
 * cannot claim to be current after the page it graded has changed underneath it.
 */

export function findStoredAudit(
  results: readonly StoredAuditResult[],
  pageId: string,
  kind: AuditKind,
): StoredAuditResult | null {
  return (
    results.find((result) => result.pageId === pageId && result.kind === kind) ??
    null
  );
}

export function withStaleness(
  stored: StoredAuditResult,
  snapshot: PageSnapshot,
  primaryKeyword: string,
): AuditResult {
  return {
    ...stored,
    stale:
      stored.inputFingerprint !== auditInputFingerprint(snapshot, primaryKeyword),
  };
}

/** Returns the current audit for a page, or null when none has been run. */
export function readAudit(
  results: readonly StoredAuditResult[],
  snapshot: PageSnapshot,
  primaryKeyword: string,
  kind: AuditKind,
): AuditResult | null {
  const stored = findStoredAudit(results, snapshot.id, kind);
  return stored === null
    ? null
    : withStaleness(stored, snapshot, primaryKeyword);
}

/**
 * Replaces any existing result for the same page and kind, so re-running an
 * audit supersedes the previous one instead of accumulating duplicates.
 */
export function upsertAudit(
  results: readonly StoredAuditResult[],
  next: StoredAuditResult,
): StoredAuditResult[] {
  const others = results.filter(
    (result) => !(result.pageId === next.pageId && result.kind === next.kind),
  );
  return [...others, next];
}
