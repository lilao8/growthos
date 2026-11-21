import type {
  AnswerContext,
  CitableAudit,
  CitableComparison,
  CitableRef,
  KnownFinding,
} from '@/domain/agent/answer';
import { STAGE_LABELS } from '@/domain/funnel/funnel-metrics';
import { CHANNELS, type Product } from '@/domain/types';
import type { RunToolOutcome } from '@/services/agent-tools/registry';

/**
 * Collects everything citable from the tool outcomes of one turn.
 *
 * The answer validator only accepts what is in here, so the collector is the
 * boundary between "a tool returned this" and "the model said this".
 */

export class AnswerContextBuilder {
  private readonly refs = new Map<string, CitableRef>();
  private readonly comparisons = new Map<string, CitableComparison>();
  private readonly audits = new Map<string, CitableAudit>();
  private readonly findings = new Map<string, KnownFinding>();
  private readonly gaps: string[] = [];
  private readonly phrases = new Set<string>();
  /** The window lengths may be written as words ("last 30 days"). */
  private readonly allowed = new Set<string>(['7', '30', '90']);

  constructor(products: readonly Product[], range: number) {
    for (const product of products) {
      this.phrases.add(product.title);
      this.phrases.add(product.sku);
    }
    for (const channel of CHANNELS) this.phrases.add(channel);
    for (const label of Object.values(STAGE_LABELS)) this.phrases.add(label);
    this.allowed.add(String(range));
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
        href: ref.href,
      });
    }
    for (const audit of outcome.meta.auditRefs) {
      this.audits.set(audit.refId, {
        refId: audit.refId,
        ruleId: audit.ruleId,
        status: audit.status,
        evidence: audit.evidence,
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
      this.phrases.add(finding.title);
    }
    for (const gap of outcome.meta.gaps) {
      if (!this.gaps.includes(gap.message)) this.gaps.push(gap.message);
    }
    collectComparisons(outcome.data, this.comparisons);
  }

  toolGaps(): string[] {
    return [...this.gaps];
  }

  build(): AnswerContext {
    return {
      refs: new Map(this.refs),
      comparisons: new Map(this.comparisons),
      audits: new Map(this.audits),
      findings: new Map(this.findings),
      namedPhrases: [...this.phrases],
      allowedNumbers: new Set(this.allowed),
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
