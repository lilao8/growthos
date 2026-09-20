import { readAudit, upsertAudit } from '@/domain/audit-lookup';
import {
  addTallies,
  averageScore,
  EMPTY_TALLY,
  tallyChecks,
  type CheckTally,
} from '@/domain/seo-audit/engine';
import { runGeoAudit } from '@/domain/geo-audit/engine';
import { GEO_RULE_VERSION, readinessBand } from '@/domain/geo-audit/config';
import { DEMO_BRAND } from '@/fixtures/demo-catalogue';
import type { AuditCheck, AuditResult, PageSnapshot, Product } from '@/domain/types';
import type { DemoState, DemoStateRepository } from '@/repositories/types';

/**
 * GEO audit service.
 *
 * Mirrors the SEO service's shape but keeps its own state and its own failure
 * path: if this service fails, the SEO module still reports its own results and
 * this one reports an error — neither borrows the other's success.
 */

export interface GeoAuditDeps {
  state: DemoStateRepository;
  /** Injected so audit timestamps are deterministic in tests. */
  now?: () => string;
  brand?: string;
}

export interface GeoPageRow {
  snapshot: PageSnapshot;
  product: Product | null;
  audit: AuditResult | null;
  tally: CheckTally;
  /** Readiness band for this page's score. */
  readiness: { label: string; note: string };
}

export interface GeoRecommendation {
  pageId: string;
  productId: string | null;
  productTitle: string;
  check: AuditCheck;
  stale: boolean;
}

export interface GeoPortfolio {
  averageScore: number | null;
  readiness: { label: string; note: string };
  pagesCounted: number;
  pagesTotal: number;
  pagesAudited: number;
  pagesStale: number;
  tally: CheckTally;
  ruleVersion: string;
}

export type GeoOverviewState =
  | {
      status: 'ready';
      rows: GeoPageRow[];
      recommendations: GeoRecommendation[];
      portfolio: GeoPortfolio;
    }
  | { status: 'empty'; portfolio: GeoPortfolio }
  | { status: 'error'; message: string };

export type GeoPageState =
  | { status: 'ready'; row: GeoPageRow }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export type RunGeoAuditResult =
  | { status: 'done'; audited: number }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function buildRow(state: DemoState, snapshot: PageSnapshot): GeoPageRow {
  const product =
    state.products.find((candidate) => candidate.id === snapshot.productId) ??
    null;
  // GEO does not read the keyword, so an empty one is passed deliberately.
  const audit = readAudit(state.auditResults, snapshot, '', 'geo');
  return {
    snapshot,
    product,
    audit,
    tally: audit === null ? EMPTY_TALLY : tallyChecks(audit.checks),
    readiness: readinessBand(audit?.score ?? null),
  };
}

/**
 * Recommendations are the rules that did not score full marks, worst first.
 * A rule that could not be evaluated is not a recommendation — there is nothing
 * to act on until the input exists.
 */
function buildRecommendations(rows: readonly GeoPageRow[]): GeoRecommendation[] {
  const items: GeoRecommendation[] = [];
  for (const row of rows) {
    if (row.audit === null) continue;
    for (const check of row.audit.checks) {
      if (check.points === null || check.points >= 10) continue;
      items.push({
        pageId: row.snapshot.id,
        productId: row.product?.id ?? null,
        productTitle: row.product?.title ?? row.snapshot.url,
        check,
        stale: row.audit.stale,
      });
    }
  }

  return items.sort(
    (a, b) =>
      (a.check.points ?? 0) - (b.check.points ?? 0) ||
      a.productTitle.localeCompare(b.productTitle) ||
      a.check.ruleId.localeCompare(b.check.ruleId),
  );
}

function buildPortfolio(rows: readonly GeoPageRow[]): GeoPortfolio {
  const audited = rows.filter((row) => row.audit !== null);
  const { average, pagesCounted } = averageScore(
    audited.map((row) => row.audit?.score ?? null),
  );

  return {
    averageScore: average,
    readiness: readinessBand(average),
    pagesCounted,
    pagesTotal: rows.length,
    pagesAudited: audited.length,
    pagesStale: audited.filter((row) => row.audit?.stale === true).length,
    tally: audited.reduce<CheckTally>(
      (sum, row) => addTallies(sum, row.tally),
      EMPTY_TALLY,
    ),
    ruleVersion: GEO_RULE_VERSION,
  };
}

export async function loadGeoOverview(
  deps: GeoAuditDeps,
): Promise<GeoOverviewState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load GEO audit data.'),
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

  if (rows.length === 0) return { status: 'empty', portfolio };

  return {
    status: 'ready',
    rows,
    recommendations: buildRecommendations(rows),
    portfolio,
  };
}

export async function loadGeoPage(
  deps: GeoAuditDeps,
  pageId: string,
): Promise<GeoPageState> {
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
  deps: GeoAuditDeps,
  pageIds: readonly string[] | null,
): Promise<RunGeoAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const brand = deps.brand ?? DEMO_BRAND;

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
    auditResults = upsertAudit(
      auditResults,
      runGeoAudit({ snapshot, brand, now: now() }),
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

export function runGeoAuditForPage(
  deps: GeoAuditDeps,
  pageId: string,
): Promise<RunGeoAuditResult> {
  return persistAudits(deps, [pageId]);
}

export function runGeoAuditForAllPages(
  deps: GeoAuditDeps,
): Promise<RunGeoAuditResult> {
  return persistAudits(deps, null);
}
