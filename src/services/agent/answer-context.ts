import type {
  AnswerContext,
  CitableAudit,
  CitableComparison,
  CitableRef,
  KnownFinding,
} from '@/domain/agent/answer';
import { formatDateRange } from '@/domain/format';
import { CHANNELS, type Product } from '@/domain/types';
import type { RunToolOutcome } from '@/services/agent-tools/registry';

/**
 * Collects everything citable from the tool outcomes of one turn.
 *
 * The answer validator only accepts what is in here, so the collector is the
 * boundary between "a tool returned this" and "the model said this".
 */

/** A gap in GrowthOS's own words, with links to the raw figures behind it. */
export interface ToolGap {
  message: string;
  links: Array<{ label: string; href: string }>;
}

export class AnswerContextBuilder {
  private readonly refs = new Map<string, CitableRef>();
  private readonly comparisons = new Map<string, CitableComparison>();
  private readonly audits = new Map<string, CitableAudit>();
  private readonly findings = new Map<string, KnownFinding>();
  private readonly gaps: ToolGap[] = [];
  private readonly products: Map<string, string>;

  constructor(products: readonly Product[]) {
    this.products = new Map(products.map((product) => [product.id, product.title]));
  }

  add(outcome: RunToolOutcome): void {
    if (outcome.status !== 'ok' && outcome.status !== 'empty') return;
    for (const ref of outcome.meta.refs) {
      this.refs.set(ref.refId, {
        refId: ref.refId,
        label: ref.label,
        value: ref.value,
        unit: ref.unit,
        channel: ref.channel,
        productId: ref.productId,
        window: { start: ref.window.start, end: ref.window.end },
        funnel: ref.refId.startsWith('funnel:'),
        href: ref.href,
      });
    }
    for (const audit of outcome.meta.auditRefs) {
      this.audits.set(audit.refId, {
        refId: audit.refId,
        ruleId: audit.ruleId,
        status: audit.status,
        evidence: audit.evidence,
        productId: audit.productId,
        href: audit.href,
      });
    }
    for (const finding of outcome.findings) {
      this.findings.set(finding.id, {
        id: finding.id,
        title: finding.title,
        priority: finding.priority,
        strength: finding.strength,
        affectedSessions: finding.affectedSessions,
        observed: finding.observed,
        howToVerify: finding.howToVerify,
        refIds: finding.refIds,
        href: finding.href,
      });
    }
    for (const gap of outcome.meta.gaps) {
      if (this.gaps.some((existing) => existing.message === gap.message)) continue;
      const links = (gap.refIds ?? [])
        .map((id) => this.refs.get(id))
        .filter((ref): ref is CitableRef => ref !== undefined)
        .map((ref) => ({ label: `${ref.label}, ${formatDateRange(ref.window.start, ref.window.end)}`, href: ref.href }))
        .filter((link, index, all) => all.findIndex((other) => other.href === link.href) === index);
      this.gaps.push({ message: gap.message, links });
    }
    collectComparisons(outcome.data, this.comparisons);
  }

  toolGaps(): ToolGap[] {
    return this.gaps.map((gap) => ({ message: gap.message, links: [...gap.links] }));
  }

  build(): AnswerContext {
    return {
      refs: new Map(this.refs),
      comparisons: new Map(this.comparisons),
      audits: new Map(this.audits),
      findings: new Map(this.findings),
      products: new Map(this.products),
      channels: [...CHANNELS],
    };
  }
}

function isComparedMetric(value: unknown): value is {
  currentRefId: string;
  previousRefId: string | null;
  current: number | null;
  previous: number | null;
  relativeChange: number | null;
  direction: CitableComparison['direction'];
  evidence: { supportsConclusion: boolean };
} {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['currentRefId'] === 'string' &&
    typeof record['evidence'] === 'object' &&
    record['evidence'] !== null &&
    typeof (record['evidence'] as Record<string, unknown>)['supportsConclusion'] === 'boolean'
  );
}

/** Every two-period comparison a tool returns has a currentRefId and an evidence verdict. */
function collectComparisons(value: unknown, into: Map<string, CitableComparison>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectComparisons(item, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (isComparedMetric(value)) {
    into.set(value.currentRefId, {
      currentRefId: value.currentRefId,
      previousRefId: value.previousRefId,
      current: value.current,
      previous: value.previous,
      relativeChange: value.relativeChange,
      direction: value.direction,
      supportsConclusion: value.evidence.supportsConclusion,
    });
    return;
  }
  for (const item of Object.values(value)) collectComparisons(item, into);
}
