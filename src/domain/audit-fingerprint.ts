import type { AuditKind, PageSnapshot } from './types';

/**
 * Staleness detection.
 *
 * An audit records a fingerprint of the snapshot it graded. When the snapshot
 * changes — because someone edited the product's metadata, say — the
 * fingerprint no longer matches and the result is shown as stale instead of
 * quietly continuing to report a score for content that no longer exists.
 *
 * The hash is FNV-1a: small, fast and deterministic. It is not a security
 * primitive and does not need to be.
 */

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Only the fields an audit actually reads take part, so an unrelated change
 * (a new capture date, for instance) does not invalidate a still-valid result.
 */
function snapshotFingerprint(snapshot: PageSnapshot): string {
  const material = JSON.stringify([
    snapshot.url,
    snapshot.metaTitle,
    snapshot.metaDescription,
    snapshot.h1,
    snapshot.headings,
    snapshot.bodyText,
    snapshot.images,
    snapshot.internalLinks,
    snapshot.canonical,
    snapshot.indexability,
    snapshot.structuredData,
    snapshot.directAnswer,
    snapshot.faq,
    snapshot.facts,
    snapshot.evidence,
    snapshot.originalityClaim,
  ]);
  return fnv1a(material);
}

/**
 * Each engine fingerprints exactly what it reads.
 *
 * The SEO engine reads the product's primary keyword as well as the snapshot,
 * so changing the keyword must make an SEO result stale. The GEO engine never
 * looks at the keyword, so a keyword edit must NOT invalidate a GEO result —
 * marking it stale would tell the user to redo work that cannot change.
 */
export function auditInputFingerprint(
  kind: AuditKind,
  snapshot: PageSnapshot,
  primaryKeyword: string,
): string {
  const base = snapshotFingerprint(snapshot);
  return kind === 'seo'
    ? `${base}-${fnv1a(primaryKeyword.trim().toLowerCase())}`
    : base;
}
