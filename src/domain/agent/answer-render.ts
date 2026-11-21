import { formatInteger, formatMoneyMetric, formatMultiple, formatPercent } from '../format';
import type { Priority } from '../types';
import {
  PLACEHOLDER,
  type AgentAnswer,
  type AnswerContext,
  type AnswerFinding,
  type CitableRef,
  type KnownFinding,
} from './answer';
import { rankFindings, type EvidenceStrength } from './priority';
import type { MetricUnit } from './refs';

/**
 * Rendering a validated answer: placeholders become formatted figures with
 * links, findings are ordered by the agent ranking, and a deterministic
 * fallback answer can be built from the tool findings alone when the model's
 * answer cannot be used.
 */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'figure'; text: string; refId: string; href: string; label: string }
  | { kind: 'change'; text: string; refId: string; previousRefId: string | null; href: string; label: string }
  | { kind: 'audit'; text: string; refId: string; href: string };

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

function changeText(ref: CitableRef, previous: number | null, current: number | null, relative: number | null): string {
  const base = `${formatValue(previous, ref.unit)} → ${formatValue(current, ref.unit)}`;
  if (relative === null) return base;
  const sign = relative > 0 ? '+' : relative < 0 ? '−' : '±';
  return `${base} (${sign}${formatPercent(Math.abs(relative), 1)})`;
}

/** Splits text into plain runs and rendered placeholders. Unknown ids stay as text. */
export function renderText(source: string, context: AnswerContext): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of source.matchAll(PLACEHOLDER)) {
    const index = match.index;
    if (index > cursor) segments.push({ kind: 'text', text: source.slice(cursor, index) });
    cursor = index + match[0].length;
    const kind = match[1];
    const id = match[2] ?? '';
    if (kind === 'ref') {
      const ref = context.refs.get(id);
      segments.push(
        ref === undefined
          ? { kind: 'text', text: match[0] }
          : { kind: 'figure', text: formatValue(ref.value, ref.unit), refId: id, href: ref.href, label: ref.label },
      );
    } else if (kind === 'change') {
      const comparison = context.comparisons.get(id);
      const ref = context.refs.get(id);
      segments.push(
        comparison === undefined || ref === undefined
          ? { kind: 'text', text: match[0] }
          : {
              kind: 'change',
              text: changeText(ref, comparison.previous, comparison.current, comparison.relativeChange),
              refId: id,
              previousRefId: comparison.previousRefId,
              href: ref.href,
              label: ref.label,
            },
      );
    } else {
      const audit = context.audits.get(id);
      segments.push(
        audit === undefined
          ? { kind: 'text', text: match[0] }
          : {
              kind: 'audit',
              text: `${audit.ruleId}: ${audit.status}${audit.evidence === null ? '' : ` (${audit.evidence})`}`,
              refId: id,
              href: audit.href,
            },
        );
    }
  }
  if (cursor < source.length) segments.push({ kind: 'text', text: source.slice(cursor) });
  return segments;
}

export interface RenderedFinding {
  rank: number;
  basedOn: string;
  title: string;
  observed: Segment[];
  whyPriority: Segment[];
  howToVerify: Segment[];
  priority: Priority;
  effectivePriority: Priority;
  downgraded: boolean;
  strength: EvidenceStrength;
  affectedSessions: number | null;
  /** The finding's own page plus every figure it cites, de-duplicated. */
  evidence: Array<{ label: string; href: string }>;
}

export interface RenderedAnswer {
  summary: Segment[];
  findings: RenderedFinding[];
  gaps: Segment[][];
  /** 'model' when the model's answer passed validation; 'fallback' otherwise. */
  source: 'model' | 'fallback';
}

/** The finding's own page first, then each cited figure's page, de-duplicated by link. */
function linksFor(
  basis: KnownFinding,
  citedIds: readonly string[],
  context: AnswerContext,
): Array<{ label: string; href: string }> {
  const links = new Map<string, string>([[basis.href, basis.title]]);
  for (const id of [...citedIds, ...basis.refIds]) {
    const ref = context.refs.get(id);
    if (ref !== undefined && !links.has(ref.href)) links.set(ref.href, ref.label);
    const audit = context.audits.get(id);
    if (audit !== undefined && !links.has(audit.href)) links.set(audit.href, audit.ruleId);
  }
  return [...links.entries()].map(([href, label]) => ({ href, label }));
}

function citedIn(finding: AnswerFinding): string[] {
  return [finding.observed, finding.whyPriority].flatMap((part) =>
    [...part.matchAll(PLACEHOLDER)].map((match) => match[2] ?? ''),
  );
}

/**
 * Orders a validated answer by the agent ranking of the findings it rests on.
 * Callers must validate first: a finding whose basis is unknown is dropped.
 */
export function renderAnswer(answer: AgentAnswer, context: AnswerContext, source: 'model' | 'fallback'): RenderedAnswer {
  const byBasis = new Map(answer.findings.map((finding) => [finding.basedOn, finding]));
  const bases = answer.findings
    .map((finding) => context.findings.get(finding.basedOn))
    .filter((basis): basis is KnownFinding => basis !== undefined);
  const ranking = rankFindings(bases);

  const findings: RenderedFinding[] = ranking.ranked.flatMap((entry) => {
    const finding = byBasis.get(entry.finding.id);
    if (finding === undefined) return [];
    return [
      {
        rank: entry.rank,
        basedOn: entry.finding.id,
        title: finding.title,
        observed: renderText(finding.observed, context),
        whyPriority: renderText(finding.whyPriority, context),
        howToVerify: renderText(finding.howToVerify, context),
        priority: entry.finding.priority,
        effectivePriority: entry.effectivePriority,
        downgraded: entry.downgraded,
        strength: entry.finding.strength,
        affectedSessions: entry.finding.affectedSessions,
        evidence: linksFor(entry.finding, citedIn(finding), context),
      },
    ];
  });

  return {
    summary: renderText(answer.summary, context),
    findings,
    gaps: answer.gaps.map((gap) => renderText(gap, context)),
    source,
  };
}

/**
 * The answer GrowthOS gives on its own when the model's cannot be used: the
 * top ranked tool findings in the engines' own words, and the tools' gaps.
 * Every sentence here was written by GrowthOS from the data, so it needs no
 * placeholders.
 */
export function fallbackAnswer(
  context: AnswerContext,
  gaps: readonly string[],
  reason: string,
  limit = 5,
): RenderedAnswer {
  const ranking = rankFindings([...context.findings.values()]);
  const findings: RenderedFinding[] = ranking.ranked.slice(0, limit).map((entry) => {
    const basis = entry.finding;
    const sample = basis.affectedSessions === null ? 'an unknown number of' : formatInteger(basis.affectedSessions);
    return {
      rank: entry.rank,
      basedOn: basis.id,
      title: basis.title,
      observed: [{ kind: 'text', text: basis.observed }],
      whyPriority: [
        {
          kind: 'text',
          text: `Ranked ${entry.effectivePriority}: rule severity ${basis.priority}, evidence ${basis.strength}${entry.downgraded ? ' (moved down one level for limited evidence)' : ''}, ${sample} sessions affected.`,
        },
      ],
      howToVerify: [{ kind: 'text', text: basis.howToVerify }],
      priority: basis.priority,
      effectivePriority: entry.effectivePriority,
      downgraded: entry.downgraded,
      strength: basis.strength,
      affectedSessions: basis.affectedSessions,
      evidence: linksFor(basis, [], context),
    };
  });
  return {
    summary: [{ kind: 'text', text: reason }],
    findings,
    gaps: gaps.map((gap) => [{ kind: 'text', text: gap }]),
    source: 'fallback',
  };
}
