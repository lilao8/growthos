import { formatDateRange, formatInteger, formatMoneyMetric, formatMultiple, formatPercent } from '../format';
import type { Priority } from '../types';
import {
  PRODUCT_PLACEHOLDER,
  type AgentAnswer,
  type AnswerContext,
  type AnswerFact,
  type AnswerFinding,
  type CitableRef,
  type KnownFinding,
} from './answer';
import { rankFindings, type EvidenceStrength } from './priority';
import type { MetricUnit } from './refs';

/**
 * Rendering a validated answer. Every fact sentence is written here from the
 * tool result — metric label (which names the channel or product), dates and
 * value — so the model cannot put a figure in the wrong channel, window or
 * direction. Findings are ordered by the agent ranking, and a deterministic
 * fallback can be built from the tool findings alone.
 */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string; title: string };

export function formatValue(value: number | null, unit: MetricUnit): string {
  switch (unit) {
    case 'count':
      return formatInteger(value);
    case 'ratio':
      return formatPercent(value);
    case 'cents':
      return formatMoneyMetric(value);
    case 'multiple':
      return formatMultiple(value);
  }
}

function period(ref: CitableRef): string {
  return formatDateRange(ref.window.start, ref.window.end);
}

/**
 * The metric label with its channel scope made explicit. Channel figures
 * already name their channel; funnel and site figures do not, and a funnel
 * rate read without its scope is exactly how a Meta figure gets mistaken for
 * an Organic Search one.
 */
function describe(ref: CitableRef, scope: FindingScope | null = null): string {
  if (ref.channel !== null) return ref.label.includes(ref.channel) ? ref.label : `${ref.label} (${ref.channel})`;
  // A site figure inside a channel finding is a point of comparison, not the channel's own figure.
  if (scope !== null && scope.channel !== null && !ref.funnel) return `${ref.label} (site-wide benchmark)`;
  return `${ref.label} (all channels)`;
}

type FindingScope = { channel: string | null; productId: string | null };

function figure(ref: CitableRef, scope: FindingScope | null = null): Segment {
  return { kind: 'link', text: formatValue(ref.value, ref.unit), href: ref.href, title: `${describe(ref, scope)}, ${period(ref)}` };
}

function relativeText(relative: number | null): string {
  if (relative === null) return '';
  const sign = relative > 0 ? '+' : relative < 0 ? '−' : '±';
  return `, ${sign}${formatPercent(Math.abs(relative), 1)}`;
}

/** The previous-period figure a comparison points at, when both exist. */
function previousRef(currentRefId: string, context: AnswerContext): CitableRef | undefined {
  const previousRefId = context.comparisons.get(currentRefId)?.previousRefId ?? null;
  return previousRefId === null ? undefined : context.refs.get(previousRefId);
}

/**
 * One fact, written out. Validated input only; an unresolvable fact renders as
 * nothing. `scope` is the finding's, when the fact sits inside one.
 */
export function renderFact(fact: AnswerFact, context: AnswerContext, scope: FindingScope | null = null): Segment[] {
  if (fact.kind === 'audit') {
    const audit = context.audits.get(fact.refId);
    if (audit === undefined) return [];
    const evidence = audit.evidence === null ? '' : ` (${audit.evidence})`;
    // A verdict says which page it is about. A site page cited on a product
    // card is background, not that product's own verdict, and says so.
    const background = scope !== null && scope.productId !== null && audit.productId === null ? ' (site-level page, not this product)' : '';
    return [
      { kind: 'text', text: `${audit.pageLabel}${background}: ` },
      { kind: 'link', text: `${audit.ruleId}: ${audit.status}${evidence}`, href: audit.href, title: `Open the audit evidence for ${audit.pageLabel}` },
    ];
  }
  const ref = context.refs.get(fact.refId);
  if (ref === undefined) return [];
  if (fact.kind === 'value') {
    return [{ kind: 'text', text: `${describe(ref, scope)}, ${period(ref)}: ` }, figure(ref, scope)];
  }
  const comparison = context.comparisons.get(fact.refId);
  const previous = previousRef(fact.refId, context);
  if (comparison === undefined || previous === undefined) return [];
  return [
    { kind: 'text', text: `${describe(ref, scope)}: ` },
    figure(previous, scope),
    { kind: 'text', text: ` (${period(previous)}) → ` },
    figure(ref, scope),
    { kind: 'text', text: ` (${period(ref)})${relativeText(comparison.relativeChange)}` },
  ];
}

/** Prose with `{{product:<id>}}` replaced by the product's name, linked to its page. */
export function renderProse(source: string, context: AnswerContext): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of source.matchAll(PRODUCT_PLACEHOLDER)) {
    if (match.index > cursor) segments.push({ kind: 'text', text: source.slice(cursor, match.index) });
    cursor = match.index + match[0].length;
    const productId = match[1] ?? '';
    const name = context.products.get(productId);
    segments.push(
      name === undefined
        ? { kind: 'text', text: match[0] }
        : { kind: 'link', text: name, href: `/products/${encodeURIComponent(productId)}`, title: name },
    );
  }
  if (cursor < source.length) segments.push({ kind: 'text', text: source.slice(cursor) });
  return segments;
}

export interface RenderedFinding {
  rank: number;
  basedOn: string;
  /** From the tool finding, never from the model. */
  title: string;
  facts: Segment[][];
  whyPriority: Segment[];
  howToVerify: Segment[];
  /** The rule's own guidance, verbatim, thresholds included. */
  ruleGuidance: string;
  scope: { channel: string | null; productId: string | null };
  priority: Priority;
  effectivePriority: Priority;
  downgraded: boolean;
  strength: EvidenceStrength;
  affectedSessions: number | null;
  /** The finding's own page first, then each cited figure's page, de-duplicated. */
  evidence: Array<{ label: string; href: string }>;
}

export interface RenderedAnswer {
  summary: Segment[];
  /** Figures that answer the question directly, each written out with its scope. */
  facts: Segment[][];
  findings: RenderedFinding[];
  gaps: Segment[][];
  /** 'model' when the model's answer passed validation; 'fallback' otherwise. */
  source: 'model' | 'fallback';
}

function linksFor(basis: KnownFinding, citedIds: readonly string[], context: AnswerContext): Array<{ label: string; href: string }> {
  const links = new Map<string, string>([[basis.href, basis.title]]);
  const add = (href: string, label: string): void => {
    if (!links.has(href)) links.set(href, label);
  };
  for (const id of [...citedIds, ...basis.refIds]) {
    const ref = context.refs.get(id);
    if (ref !== undefined) {
      add(ref.href, `${describe(ref, basis.scope)}, ${period(ref)}`);
      const previous = previousRef(id, context);
      if (previous !== undefined) add(previous.href, `${describe(previous, basis.scope)}, ${period(previous)}`);
    }
    const audit = context.audits.get(id);
    if (audit !== undefined) add(audit.href, audit.ruleId);
  }
  return [...links.entries()].map(([href, label]) => ({ href, label }));
}

/**
 * Orders a validated answer by the agent ranking of the findings it rests on.
 * Callers validate first; a finding whose basis is unknown is dropped.
 */
export function renderAnswer(answer: AgentAnswer, context: AnswerContext, source: 'model' | 'fallback'): RenderedAnswer {
  const byBasis = new Map(answer.findings.map((finding) => [finding.basedOn, finding]));
  const bases = answer.findings
    .map((finding) => context.findings.get(finding.basedOn))
    .filter((basis): basis is KnownFinding => basis !== undefined);
  const ranking = rankFindings(bases);

  const findings: RenderedFinding[] = ranking.ranked.flatMap((entry) => {
    const finding: AnswerFinding | undefined = byBasis.get(entry.finding.id);
    if (finding === undefined) return [];
    return [
      {
        rank: entry.rank,
        basedOn: entry.finding.id,
        title: entry.finding.title,
        facts: finding.facts.map((fact) => renderFact(fact, context, entry.finding.scope)),
        whyPriority: renderProse(finding.whyPriority, context),
        howToVerify: renderProse(finding.howToVerify, context),
        ruleGuidance: entry.finding.howToVerify,
        scope: entry.finding.scope,
        priority: entry.finding.priority,
        effectivePriority: entry.effectivePriority,
        downgraded: entry.downgraded,
        strength: entry.finding.strength,
        affectedSessions: entry.finding.affectedSessions,
        evidence: linksFor(entry.finding, finding.facts.map((fact) => fact.refId), context),
      },
    ];
  });

  return {
    summary: renderProse(answer.summary, context),
    facts: answer.facts.map((fact) => renderFact(fact, context)),
    findings,
    gaps: answer.gaps.map((gap) => renderProse(gap, context)),
    source,
  };
}

/**
 * The answer GrowthOS gives on its own when the model's cannot be used: the
 * top ranked tool findings in the engines' own words. Every sentence here was
 * written by GrowthOS from the data.
 */
export function fallbackAnswer(context: AnswerContext, reason: string, limit = 5): RenderedAnswer {
  const ranking = rankFindings([...context.findings.values()]);
  const findings: RenderedFinding[] = ranking.ranked.slice(0, limit).map((entry) => {
    const basis = entry.finding;
    const sample = basis.affectedSessions === null ? 'an unknown number of' : formatInteger(basis.affectedSessions);
    return {
      rank: entry.rank,
      basedOn: basis.id,
      title: basis.title,
      facts: [[{ kind: 'text', text: basis.observed }]],
      whyPriority: [
        {
          kind: 'text',
          text: `Ranked ${entry.effectivePriority}: rule severity ${basis.priority}, evidence ${basis.strength}${entry.downgraded ? ' (moved down one level for limited evidence)' : ''}, ${sample} sessions affected.`,
        },
      ],
      howToVerify: [{ kind: 'text', text: basis.howToVerify }],
      ruleGuidance: basis.howToVerify,
      scope: basis.scope,
      priority: basis.priority,
      effectivePriority: entry.effectivePriority,
      downgraded: entry.downgraded,
      strength: basis.strength,
      affectedSessions: basis.affectedSessions,
      evidence: linksFor(basis, [], context),
    };
  });
  // A lookup with no finding behind it still has its figures.
  const facts = context.figuresWithoutFindings
    .slice(0, 12)
    .map((refId) => renderFact({ kind: 'value', refId }, context))
    .filter((segments) => segments.length > 0);
  return { summary: [{ kind: 'text', text: reason }], facts, findings, gaps: [], source: 'fallback' };
}
