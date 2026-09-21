import {
  addTallies,
  averageScore,
  EMPTY_TALLY,
  tallyChecks,
  type CheckTally,
} from '@/domain/audit-scoring';
import {
  readListingAudit,
  runListingAudit,
  upsertListingAudit,
} from '@/domain/amazon/engine';
import { AMAZON_RULE_VERSION } from '@/domain/amazon/config';
import { validateListingEdit } from '@/domain/amazon/listing-validation';
import type {
  AmazonListing,
  AuditCheck,
  ListingAudit,
  ListingStatus,
  Product,
} from '@/domain/types';
import type { DemoState, DemoStateRepository } from '@/repositories/types';

/**
 * Amazon listing service.
 *
 * Mirrors the SEO audit service deliberately — same read/run/persist shape, so
 * an operator who has used one page already knows how the other behaves. What
 * it does NOT do is mix channels: nothing here reads storefront sessions,
 * orders or spend, and nothing it returns is ever added to a site metric.
 */

export interface AmazonDeps {
  state: DemoStateRepository;
  /** Injected so audit timestamps are deterministic in tests. */
  now?: () => string;
}

export interface ListingRow {
  listing: AmazonListing;
  /** null when the listing points at a product that no longer exists. */
  product: Product | null;
  /** null until an audit has been run for this listing. */
  audit: ListingAudit | null;
  tally: CheckTally;
}

export interface ListingIssue {
  listingId: string;
  asin: string;
  productId: string | null;
  productTitle: string;
  listingStatus: ListingStatus;
  check: AuditCheck;
  stale: boolean;
}

export interface ListingPortfolio {
  /** Mean of audited listing scores. Null when no listing has a score. */
  averageScore: number | null;
  /** How many listings that average covers — stated so it is not mistaken for all. */
  pagesCounted: number;
  listingsTotal: number;
  listingsAudited: number;
  listingsStale: number;
  /** Counted from the listing records, not from an audit: always knowable. */
  suppressed: number;
  inactive: number;
  tally: CheckTally;
  ruleVersion: string;
}

export type AmazonOverviewState =
  | {
      status: 'ready';
      rows: ListingRow[];
      issues: ListingIssue[];
      portfolio: ListingPortfolio;
    }
  | { status: 'empty'; portfolio: ListingPortfolio }
  | { status: 'error'; message: string };

export type ListingDetailState =
  | { status: 'ready'; row: ListingRow }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export type RunListingAuditResult =
  | { status: 'done'; audited: number }
  | { status: 'error'; message: string };

export type SaveListingResult =
  | { status: 'saved'; listing: AmazonListing }
  | { status: 'invalid'; errors: Record<string, string> }
  | { status: 'error'; message: string };

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function productFor(state: DemoState, listing: AmazonListing): Product | null {
  return (
    state.products.find((candidate) => candidate.id === listing.productId) ??
    null
  );
}

function buildRow(state: DemoState, listing: AmazonListing): ListingRow {
  const product = productFor(state, listing);
  const audit = readListingAudit(state.listingAudits, listing, product);
  return {
    listing,
    product,
    audit,
    tally: audit === null ? EMPTY_TALLY : tallyChecks(audit.checks),
  };
}

function buildIssues(rows: readonly ListingRow[]): ListingIssue[] {
  const issues: ListingIssue[] = [];
  for (const row of rows) {
    if (row.audit === null) continue;
    for (const check of row.audit.checks) {
      // Passing checks are not issues; unknowns are reported as coverage gaps
      // on the detail page rather than as findings to act on.
      if (check.status !== 'error' && check.status !== 'warning') continue;
      issues.push({
        listingId: row.listing.id,
        asin: row.listing.asin,
        productId: row.product?.id ?? null,
        productTitle: row.product?.title ?? row.listing.asin,
        listingStatus: row.listing.status,
        check,
        stale: row.audit.stale,
      });
    }
  }

  return issues.sort((a, b) => {
    const bySeverity =
      SEVERITY_ORDER.indexOf(a.check.severity) -
      SEVERITY_ORDER.indexOf(b.check.severity);
    if (bySeverity !== 0) return bySeverity;
    if (a.check.status !== b.check.status) {
      return a.check.status === 'error' ? -1 : 1;
    }
    return (
      a.productTitle.localeCompare(b.productTitle) ||
      a.check.ruleId.localeCompare(b.check.ruleId)
    );
  });
}

function buildPortfolio(rows: readonly ListingRow[]): ListingPortfolio {
  const audited = rows.filter((row) => row.audit !== null);
  const { average, pagesCounted } = averageScore(
    audited.map((row) => row.audit?.score ?? null),
  );

  return {
    averageScore: average,
    pagesCounted,
    listingsTotal: rows.length,
    listingsAudited: audited.length,
    listingsStale: audited.filter((row) => row.audit?.stale === true).length,
    // Status is a property of the listing record, so these counts are correct
    // before any audit has run — which matters, because a suppressed listing
    // is urgent whether or not anyone has audited it yet.
    suppressed: rows.filter((row) => row.listing.status === 'suppressed').length,
    inactive: rows.filter((row) => row.listing.status === 'inactive').length,
    tally: audited.reduce<CheckTally>(
      (sum, row) => addTallies(sum, row.tally),
      EMPTY_TALLY,
    ),
    ruleVersion: AMAZON_RULE_VERSION,
  };
}

export async function loadAmazonOverview(
  deps: AmazonDeps,
): Promise<AmazonOverviewState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load Amazon listing data.'),
    };
  }

  const rows = state.amazonListings
    .map((listing) => buildRow(state, listing))
    .sort((a, b) =>
      (a.product?.title ?? a.listing.asin).localeCompare(
        b.product?.title ?? b.listing.asin,
      ),
    );
  const portfolio = buildPortfolio(rows);

  if (rows.length === 0) {
    return { status: 'empty', portfolio };
  }

  return { status: 'ready', rows, issues: buildIssues(rows), portfolio };
}

export async function loadListing(
  deps: AmazonDeps,
  listingId: string,
): Promise<ListingDetailState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load this listing.'),
    };
  }

  const listing = state.amazonListings.find(
    (candidate) => candidate.id === listingId,
  );
  if (listing === undefined) return { status: 'not-found' };

  return { status: 'ready', row: buildRow(state, listing) };
}

async function persistAudits(
  deps: AmazonDeps,
  listingIds: readonly string[] | null,
): Promise<RunListingAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved listings.'),
    };
  }

  const targets = state.amazonListings.filter(
    (listing) => listingIds === null || listingIds.includes(listing.id),
  );
  if (targets.length === 0) {
    return { status: 'error', message: 'There is no such listing to audit.' };
  }

  let listingAudits = state.listingAudits;
  for (const listing of targets) {
    listingAudits = upsertListingAudit(
      listingAudits,
      runListingAudit({
        listing,
        product: productFor(state, listing),
        now: now(),
      }),
    );
  }

  try {
    await deps.state.save({ ...state, listingAudits });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save the audit results.'),
    };
  }

  return { status: 'done', audited: targets.length };
}

/** Re-running replaces the previous result for that listing rather than adding one. */
export function runAuditForListing(
  deps: AmazonDeps,
  listingId: string,
): Promise<RunListingAuditResult> {
  return persistAudits(deps, [listingId]);
}

export function runAuditForAllListings(
  deps: AmazonDeps,
): Promise<RunListingAuditResult> {
  return persistAudits(deps, null);
}

/**
 * Saves an edit to the listing copy.
 *
 * On an invalid or failed save nothing is written and the caller keeps what the
 * user typed — the same contract the product SEO form follows. A successful
 * save changes the fingerprint, so any stored audit for this listing becomes
 * stale on the next read without anything having to remember to mark it.
 */
export async function saveListingEdit(
  deps: AmazonDeps,
  listingId: string,
  input: unknown,
): Promise<SaveListingResult> {
  const validation = validateListingEdit(input);
  if (!validation.ok) return { status: 'invalid', errors: validation.errors };

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved listings.'),
    };
  }

  const existing = state.amazonListings.find(
    (candidate) => candidate.id === listingId,
  );
  if (existing === undefined) {
    return { status: 'error', message: 'There is no such listing.' };
  }

  const updated: AmazonListing = {
    ...existing,
    title: validation.value.title,
    bullets: validation.value.bullets,
    backendSearchTerms: validation.value.backendSearchTerms,
  };

  const amazonListings = state.amazonListings.map((candidate) =>
    candidate.id === listingId ? updated : candidate,
  );

  try {
    await deps.state.save({ ...state, amazonListings });
  } catch (cause) {
    return {
      status: 'error',
      // The reassurance that nothing was lost belongs to the UI, which is what
      // actually still holds the user's input — same split as the product form.
      message: messageFrom(cause, 'Could not save the listing.'),
    };
  }

  return { status: 'saved', listing: updated };
}
