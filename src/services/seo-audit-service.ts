import { readAudit, upsertAudit } from '@/domain/audit-lookup';
import {
  addTallies,
  averageScore,
  EMPTY_TALLY,
  tallyChecks,
  type CheckTally,
} from '@/domain/audit-scoring';
import { runSeoAudit } from '@/domain/seo-audit/engine';
import { SEO_RULE_VERSION } from '@/domain/seo-audit/config';
import type { AuditCheck, AuditResult, PageSnapshot, Product } from '@/domain/types';
import type { DemoState, DemoStateRepository } from '@/repositories/types';

/**
 * SEO audit service: reads the persisted catalogue, runs the pure engine on
 * demand, and writes results back. Nothing here decides a verdict — that is the
 * engine's job — and no score is ever produced without an explicit audit run.
 */

export interface SeoAuditDeps {
  state: DemoStateRepository;
  /** Injected so audit timestamps are deterministic in tests. */
  now?: () => string;
}

export interface SeoPageRow {
  snapshot: PageSnapshot;
  /** null for a snapshot with no product behind it. */
  product: Product | null;
  /** null until an audit has been run for this page. */
  audit: AuditResult | null;
  tally: CheckTally;
}

export interface SeoIssue {
  pageId: string;
  pageUrl: string;
  productId: string | null;
  productTitle: string;
  check: AuditCheck;
  stale: boolean;
}

export interface SeoPortfolio {
  /** Mean of audited page scores. Null when no page has a score. */
  averageScore: number | null;
  /** How many pages that average covers — stated so it is not mistaken for all. */
  pagesCounted: number;
  pagesTotal: number;
  pagesAudited: number;
  pagesStale: number;
  tally: CheckTally;
  ruleVersion: string;
}

export type SeoOverviewState =
  | {
      status: 'ready';
      rows: SeoPageRow[];
      issues: SeoIssue[];
      portfolio: SeoPortfolio;
    }
  | { status: 'empty'; portfolio: SeoPortfolio }
  | { status: 'error'; message: string };

export type SeoPageState =
  | { status: 'ready'; row: SeoPageRow }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export type RunAuditResult =
  | { status: 'done'; audited: number }
  | { status: 'error'; message: string };

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function keywordFor(product: Product | null): string {
  return product?.primaryKeyword ?? '';
}

function buildRow(state: DemoState, snapshot: PageSnapshot): SeoPageRow {
  const product =
    state.products.find((candidate) => candidate.id === snapshot.productId) ??
    null;
  const audit = readAudit(
    state.auditResults,
    snapshot,
    keywordFor(product),
    'seo',
  );
  return {
    snapshot,
    product,
    audit,
    tally: audit === null ? EMPTY_TALLY : tallyChecks(audit.checks),
  };
}

function buildIssues(rows: readonly SeoPageRow[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  for (const row of rows) {
    if (row.audit === null) continue;
    for (const check of row.audit.checks) {
      // Passing checks are not issues; unknowns are reported as coverage gaps
      // on the page detail rather than as findings to act on.
      if (check.status !== 'error' && check.status !== 'warning') continue;
      issues.push({
        pageId: row.snapshot.id,
        pageUrl: row.snapshot.url,
        productId: row.product?.id ?? null,
        productTitle: row.product?.title ?? row.snapshot.url,
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
    // Errors before warnings at equal severity, then a stable alphabetical key.
    if (a.check.status !== b.check.status) {
      return a.check.status === 'error' ? -1 : 1;
    }
    return (
      a.productTitle.localeCompare(b.productTitle) ||
      a.check.ruleId.localeCompare(b.check.ruleId)
    );
  });
}

function buildPortfolio(rows: readonly SeoPageRow[]): SeoPortfolio {
  const audited = rows.filter((row) => row.audit !== null);
  const { average, pagesCounted } = averageScore(
    audited.map((row) => row.audit?.score ?? null),
  );

  return {
    averageScore: average,
    pagesCounted,
    pagesTotal: rows.length,
    pagesAudited: audited.length,
    pagesStale: audited.filter((row) => row.audit?.stale === true).length,
    tally: audited.reduce<CheckTally>(
      (sum, row) => addTallies(sum, row.tally),
      EMPTY_TALLY,
    ),
    ruleVersion: SEO_RULE_VERSION,
  };
}

export async function loadSeoOverview(
  deps: SeoAuditDeps,
): Promise<SeoOverviewState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load SEO audit data.'),
    };
  }

  const rows = state.pageSnapshots
    .map((snapshot) => buildRow(state, snapshot))
    .sort((a, b) =>
      (a.product?.title ?? a.snapshot.url).localeCompare(
        b.product?.title ?? b.snapshot.url,
      ),
    );
  const portfolio = buildPortfolio(rows);

  if (rows.length === 0) {
    return { status: 'empty', portfolio };
  }

  return {
    status: 'ready',
    rows,
    issues: buildIssues(rows),
    portfolio,
  };
}

export async function loadSeoPage(
  deps: SeoAuditDeps,
  pageId: string,
): Promise<SeoPageState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load this page audit.'),
    };
  }

  const snapshot = state.pageSnapshots.find(
    (candidate) => candidate.id === pageId,
  );
  if (snapshot === undefined) return { status: 'not-found' };

  return { status: 'ready', row: buildRow(state, snapshot) };
}

async function persistAudits(
  deps: SeoAuditDeps,
  pageIds: readonly string[] | null,
): Promise<RunAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved catalogue.'),
    };
  }

  const targets = state.pageSnapshots.filter(
    (snapshot) => pageIds === null || pageIds.includes(snapshot.id),
  );
  if (targets.length === 0) {
    return { status: 'error', message: 'There is no such page to audit.' };
  }

  let auditResults = state.auditResults;
  for (const snapshot of targets) {
    const product =
      state.products.find((candidate) => candidate.id === snapshot.productId) ??
      null;
    auditResults = upsertAudit(
      auditResults,
      runSeoAudit({
        snapshot,
        primaryKeyword: keywordFor(product),
        now: now(),
      }),
    );
  }

  try {
    await deps.state.save({ ...state, auditResults });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save the audit results.'),
    };
  }

  return { status: 'done', audited: targets.length };
}

/** Re-running replaces the previous result for that page rather than adding one. */
export function runSeoAuditForPage(
  deps: SeoAuditDeps,
  pageId: string,
): Promise<RunAuditResult> {
  return persistAudits(deps, [pageId]);
}

export function runSeoAuditForAllPages(
  deps: SeoAuditDeps,
): Promise<RunAuditResult> {
  return persistAudits(deps, null);
}
