import { scoreChecks } from '../audit-scoring';
import { stableHash } from '../stable-id';
import type {
  AmazonListing,
  ListingAudit,
  ListingAuditResult,
  Product,
} from '../types';
import {
  AMAZON_RULE_VERSION,
  DEFAULT_AMAZON_CONFIG,
  type AmazonListingConfig,
} from './config';
import { AMAZON_RULES } from './rules';

/**
 * The Amazon listing audit engine.
 *
 * Pure: the listing, its product, the config and the clock all come in as
 * arguments, so a result is reproducible and the same inputs always give the
 * same score.
 *
 * It shares `scoreChecks` with the SEO engine because the arithmetic is the
 * same — copying a scoring formula is what lets two definitions drift apart.
 * It shares nothing else: the rules, the thresholds, the version and the claim
 * the number makes are all its own.
 */

/**
 * Fingerprint of exactly the listing fields the rules read.
 *
 * Changing a field a rule looks at must make a stored audit stale; changing
 * one no rule reads must not, or the UI would tell the user to redo work that
 * cannot change its own result.
 */
export function listingFingerprint(
  listing: AmazonListing,
  product: Product | null,
): string {
  return stableHash(
    JSON.stringify([
      listing.title,
      listing.bullets,
      listing.aPlusModules,
      listing.backendSearchTerms,
      listing.imageCount,
      listing.mainImageWhiteBackground,
      listing.hasVideo,
      listing.browseNode,
      listing.brandRegistered,
      listing.variationParentAsin,
      listing.expectedVariationSiblings,
      listing.reviewCount,
      listing.averageRating,
      listing.buyBoxPercentage,
      listing.status,
      // The title-structure rule reads the brand from the product, so a
      // product rename must invalidate the audit too.
      product?.title ?? null,
    ]),
  );
}

export interface RunListingAuditInput {
  listing: AmazonListing;
  product: Product | null;
  /** Injected so results are reproducible in tests. */
  now: string;
  config?: AmazonListingConfig;
}

export function runListingAudit({
  listing,
  product,
  now,
  config = DEFAULT_AMAZON_CONFIG,
}: RunListingAuditInput): ListingAuditResult {
  const checks = AMAZON_RULES.map((rule) => rule({ listing, product, config }));
  const summary = scoreChecks(checks);

  return {
    id: `audit_amazon_${listing.id}`,
    listingId: listing.id,
    ruleVersion: AMAZON_RULE_VERSION,
    checks,
    score: summary.score,
    coverage: summary.coverage,
    auditedAt: now,
    inputFingerprint: listingFingerprint(listing, product),
  };
}

// ---------------------------------------------------------------------------
// Reading stored listing audits back
// ---------------------------------------------------------------------------

export function findStoredListingAudit(
  results: readonly ListingAuditResult[],
  listingId: string,
): ListingAuditResult | null {
  return results.find((result) => result.listingId === listingId) ?? null;
}

/**
 * Staleness is always derived here rather than read from storage, so a result
 * cannot claim to be current after the listing it graded has changed.
 */
export function readListingAudit(
  results: readonly ListingAuditResult[],
  listing: AmazonListing,
  product: Product | null,
): ListingAudit | null {
  const stored = findStoredListingAudit(results, listing.id);
  if (stored === null) return null;
  return {
    ...stored,
    stale: stored.inputFingerprint !== listingFingerprint(listing, product),
  };
}

/** Re-running supersedes the previous result rather than accumulating copies. */
export function upsertListingAudit(
  results: readonly ListingAuditResult[],
  next: ListingAuditResult,
): ListingAuditResult[] {
  const others = results.filter(
    (result) => result.listingId !== next.listingId,
  );
  return [...others, next];
}
