import { z } from 'zod';
import { auditHref } from '@/domain/agent/links';
import { readAudit } from '@/domain/audit-lookup';
import { DEMO_AS_OF, type DateWindow, type DemoRangeDays } from '@/domain/demo-window';
import { runGeoAudit } from '@/domain/geo-audit/engine';
import { computeProductMetrics } from '@/domain/product-metrics';
import {
  geoRecommendations,
  seoRecommendations,
  type AuditedPage,
} from '@/domain/recommendations/aggregate';
import { trafficBands } from '@/domain/recommendations/config';
import { runSeoAudit } from '@/domain/seo-audit/engine';
import {
  SEVERITIES,
  type AuditKind,
  type AuditResult,
  type PageSnapshot,
  type Product,
  type Severity,
  type StoredAuditResult,
} from '@/domain/types';
import { DEMO_BRAND } from '@/fixtures/demo-catalogue';
import { windowForRange } from '@/services/analytics-service';
import { messageFrom, rangeSchema, TRAFFIC_SOURCE } from './shared';
import type {
  AgentFinding,
  AgentTool,
  AuditOrigin,
  AuditRef,
  Gap,
  ToolOutcome,
} from './types';

/**
 * SEO and GEO audit findings from the visitor's own catalogue.
 *
 * Where the visitor has already audited a page and nothing has changed since,
 * that stored audit is used as-is — it is what their audit page shows. Where a
 * page was never audited, or was edited after its audit, the same versioned
 * engine runs on their current snapshot for this answer only. Nothing is
 * written back: the result is labelled `computed-on-request`, and running the
 * audit on that page yields the same checks.
 *
 * Findings and priorities come from the existing recommendation aggregators;
 * page traffic for weighting comes from the requested window.
 */

const AUDIT_KINDS = ['seo', 'geo'] as const;

export const auditFindingsInput = z.object({
  kind: z.enum(['seo', 'geo', 'both']).default('both'),
  range: rangeSchema.describe('Window used to weight findings by page traffic. Default 30.'),
  products: z
    .array(z.string().min(1).max(80))
    .max(20)
    .default([])
    .describe('Product ids or SKUs to restrict to. Empty = every page.'),
  minSeverity: z.enum(SEVERITIES).default('info'),
});

export type AuditFindingsInput = z.infer<typeof auditFindingsInput>;

export interface PageAuditSummary {
  pageId: string;
  productId: string | null;
  title: string;
  kind: AuditKind;
  score: number | null;
  ruleVersion: string;
  origin: AuditOrigin;
  /** Why it was computed: never audited, or edited since its audit. */
  computedBecause: 'not-audited' | 'stale' | null;
  inputFingerprint: string;
  href: string;
}

export interface AuditFindingsData {
  range: DemoRangeDays;
  pages: PageAuditSummary[];
  notFound: string[];
}

interface ResolvedAudit {
  audit: AuditResult;
  origin: AuditOrigin;
  computedBecause: PageAuditSummary['computedBecause'];
}

function resolveAudit(
  kind: AuditKind,
  snapshot: PageSnapshot,
  product: Product | null,
  storedResults: readonly StoredAuditResult[],
  now: string,
): ResolvedAudit {
  const keyword = kind === 'seo' ? (product?.primaryKeyword ?? '') : '';
  const existing = readAudit(storedResults, snapshot, keyword, kind);
  if (existing !== null && !existing.stale) {
    return { audit: existing, origin: 'stored', computedBecause: null };
  }
  const fresh =
    kind === 'seo'
      ? runSeoAudit({ snapshot, primaryKeyword: keyword, now })
      : runGeoAudit({ snapshot, brand: DEMO_BRAND, now });
  const audit = readAudit([fresh], snapshot, keyword, kind);
  if (audit === null) throw new Error('An audit that was just run could not be read back.');
  return {
    audit,
    origin: 'computed-on-request',
    computedBecause: existing === null ? 'not-audited' : 'stale',
  };
}

function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

function auditRefId(kind: AuditKind, pageId: string, ruleId: string, fingerprint: string): string {
  return `audits:${kind}:${pageId}:${ruleId}:${fingerprint}`;
}

export const auditFindingsTool: AgentTool<AuditFindingsInput, AuditFindingsData> = {
  name: 'get_audit_findings',
  description:
    "SEO and/or GEO rule findings for product pages, from the visitor's own catalogue: their stored audit where current, otherwise the same engine run on their current page snapshot for this answer only. Each finding carries the rule, severity, evidence and rule version. GEO checks page structure only; it does not measure real AI rankings. Read-only.",
  readOnly: true,
  input: auditFindingsInput,
  async execute(input, context): Promise<ToolOutcome<AuditFindingsData>> {
    if (context.state === null) {
      return { status: 'error', message: 'No page snapshots were provided, so there is nothing to audit.' };
    }
    const state = context.state.value;
    const window: DateWindow = windowForRange(input.range, DEMO_AS_OF);

    let traffic;
    try {
      traffic = await context.traffic.load();
    } catch (cause) {
      return { status: 'error', message: messageFrom(cause, 'Could not load traffic for page weighting.') };
    }

    const notFound: string[] = [];
    let wanted: Set<string> | null = null;
    if (input.products.length > 0) {
      wanted = new Set();
      for (const key of input.products) {
        const product = state.products.find(
          (candidate) => candidate.id === key || candidate.sku.toLowerCase() === key.toLowerCase(),
        );
        if (product === undefined) notFound.push(key);
        else wanted.add(product.id);
      }
    }

    const metrics = computeProductMetrics(traffic.sessions, traffic.orders, traffic.orderItems, window);
    const viewSessions = new Map<string, number>();
    for (const product of state.products) {
      viewSessions.set(product.id, metrics.get(product.id)?.viewSessions ?? 0);
    }
    const bands = trafficBands(viewSessions);

    const kinds: readonly AuditKind[] = input.kind === 'both' ? AUDIT_KINDS : [input.kind];
    const pages: PageAuditSummary[] = [];
    const auditRefs: AuditRef[] = [];
    const findings: AgentFinding[] = [];
    let now: string;
    try {
      now = context.now();
    } catch (cause) {
      return { status: 'error', message: messageFrom(cause, 'Could not timestamp the audit.') };
    }

    for (const snapshot of state.pageSnapshots) {
      const product = state.products.find((candidate) => candidate.id === snapshot.productId) ?? null;
      if (wanted !== null && (product === null || !wanted.has(product.id))) continue;

      for (const kind of kinds) {
        const resolved = resolveAudit(kind, snapshot, product, state.auditResults, now);
        const { audit } = resolved;
        const href = auditHref(kind, snapshot.id);
        const title = product?.title ?? snapshot.url;
        pages.push({
          pageId: snapshot.id,
          productId: product?.id ?? null,
          title,
          kind,
          score: audit.score,
          ruleVersion: audit.ruleVersion,
          origin: resolved.origin,
          computedBecause: resolved.computedBecause,
          inputFingerprint: audit.inputFingerprint,
          href,
        });

        const page: AuditedPage = {
          pageId: snapshot.id,
          productId: product?.id ?? null,
          productTitle: title,
          productStatus: product?.status ?? null,
          audit,
          trafficBand: product === null ? 'unknown' : (bands.get(product.id) ?? 'unknown'),
          viewSessions: product === null ? null : (viewSessions.get(product.id) ?? null),
        };
        const items = kind === 'seo' ? seoRecommendations([page]) : geoRecommendations([page]);
        for (const item of items) {
          const check = audit.checks.find((candidate) => candidate.ruleId === item.ruleId);
          if (check === undefined) continue;
          if (severityRank(check.severity) > severityRank(input.minSeverity)) continue;

          const ref: AuditRef = {
            refId: auditRefId(kind, snapshot.id, check.ruleId, audit.inputFingerprint),
            kind,
            pageId: snapshot.id,
            productId: product?.id ?? null,
            ruleId: check.ruleId,
            status: check.status,
            severity: check.severity,
            points: check.points,
            evidence: check.evidence,
            ruleVersion: audit.ruleVersion,
            origin: resolved.origin,
            inputFingerprint: audit.inputFingerprint,
            href,
          };
          auditRefs.push(ref);
          const sessions = page.viewSessions;
          findings.push({
            id: `${item.id}@${window.start}..${window.end}`,
            source: item.source,
            ruleId: item.ruleId,
            title: item.title,
            priority: item.priority,
            // The verdict is a deterministic rule result; what can be thin is
            // the observed input behind it.
            strength: check.evidence === null ? 'limited' : 'sufficient',
            affectedSessions: sessions,
            observed: item.reason,
            howToVerify: item.suggestedAction,
            ruleVersion: item.ruleVersion,
            refIds: [ref.refId],
            href,
          });
        }
      }
    }

    const gaps: Gap[] = notFound.map((key) => ({
      code: 'product-not-found' as const,
      message: `No product in the catalogue matches "${key}".`,
    }));
    const computed = pages.filter((page) => page.origin === 'computed-on-request');
    if (computed.length > 0) {
      gaps.push({
        code: 'not-audited',
        message: `${computed.length} of ${pages.length} page audits were not current in this browser and were computed for this answer only. Their audit pages will show "Not audited" or "stale" until the audit is run there; running it produces the same checks.`,
      });
    }

    const data: AuditFindingsData = { range: input.range, pages, notFound };
    const meta = {
      window,
      previousWindow: null,
      dataSources: [
        `${context.state.source}:page-snapshots`,
        `${context.state.source}:audit-results`,
        TRAFFIC_SOURCE,
        ...new Set(pages.map((page) => `rules:${page.ruleVersion}`)),
      ],
      refs: [],
      auditRefs,
      gaps,
    };
    return pages.length === 0
      ? { status: 'empty', data, meta, findings: [] }
      : { status: 'ok', data, meta, findings };
  },
};
