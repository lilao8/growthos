import { z } from 'zod';
import type { EvidenceStrength } from './priority';
import type { MetricUnit } from './refs';
import type { Priority } from '../types';

/**
 * The answer contract between the model and GrowthOS.
 *
 * The model writes prose; GrowthOS owns every number in it. Figures appear as
 * placeholders — `{{ref:<refId>}}` for one figure, `{{change:<currentRefId>}}`
 * for a two-period change, `{{audit:<refId>}}` for an audit verdict — and are
 * rendered from tool results. This module checks that an answer keeps to that
 * contract. It is pure: the caller builds the context from the tool outcomes
 * of the turn.
 */

const text = z.string().trim().min(1).max(1200);

export const answerFindingSchema = z.strictObject({
  /** Id of the tool finding this rests on. Ordering comes from that finding. */
  basedOn: z.string().min(1).max(300),
  title: z.string().trim().min(1).max(200),
  observed: text,
  whyPriority: text,
  howToVerify: text,
  /** What the finding claims to be about. Checked against what it cites. */
  scope: z.strictObject({
    channel: z.string().max(40).nullable(),
    productId: z.string().max(80).nullable(),
  }),
});

export const agentAnswerSchema = z.strictObject({
  summary: text,
  findings: z.array(answerFindingSchema).max(8),
  /** What is missing and how it could be checked. */
  gaps: z.array(text).max(8),
});

export type AnswerFinding = z.infer<typeof answerFindingSchema>;
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

// ---------------------------------------------------------------------------
// Validation context — plain data, built from the turn's tool outcomes
// ---------------------------------------------------------------------------

export interface CitableRef {
  refId: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  /** null = all channels. */
  channel: string | null;
  productId: string | null;
  href: string;
}

export interface CitableComparison {
  currentRefId: string;
  previousRefId: string | null;
  current: number | null;
  previous: number | null;
  relativeChange: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  supportsConclusion: boolean;
}

export interface CitableAudit {
  refId: string;
  ruleId: string;
  status: string;
  evidence: string | null;
  href: string;
}

export interface KnownFinding {
  id: string;
  title: string;
  priority: Priority;
  strength: EvidenceStrength;
  affectedSessions: number | null;
  observed: string;
  howToVerify: string;
  refIds: string[];
  href: string;
}

export interface AnswerContext {
  refs: ReadonlyMap<string, CitableRef>;
  comparisons: ReadonlyMap<string, CitableComparison>;
  audits: ReadonlyMap<string, CitableAudit>;
  findings: ReadonlyMap<string, KnownFinding>;
  /**
   * Phrases removed before looking for stray numbers: product titles, SKUs,
   * channel and stage names. "Traverse 35" is a name, not a figure.
   */
  namedPhrases: readonly string[];
  /** Numbers that may appear as words, e.g. the window length in days. */
  allowedNumbers: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AnswerIssueCode =
  | 'invalid-json'
  | 'unknown-ref'
  | 'unknown-change'
  | 'unknown-audit'
  | 'unsupported-change'
  | 'raw-number'
  | 'change-without-comparison'
  | 'unknown-basis'
  | 'insufficient-basis'
  | 'duplicate-basis'
  | 'site-funnel-for-narrow-scope'
  | 'funnel-for-product';

export interface AnswerIssue {
  /** null = the summary. */
  finding: number | null;
  code: AnswerIssueCode;
  message: string;
}

export const PLACEHOLDER = /\{\{(ref|change|audit):([^{}\s]+)\}\}/g;

/**
 * Words that assert a change over time. Their presence in a claim requires a
 * change placeholder backed by a comparison that supports a conclusion.
 * "drop-off" is a funnel term, not a change, so bare "drop" is not listed.
 */
const CHANGE_WORDS =
  /\b(fell|falls?|falling|dropped|declin\w*|decreas\w*|rose|rises?|rising|increas\w*|grew|grow(s|ing)?|worsen\w*|improv\w*|down from|up from)\b|下降|下滑|下跌|减少|降低|上升|增长|提升|提高|增加|回落|走低|走高|变差|改善|环比/i;

const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;

function placeholders(source: string): Array<{ kind: string; id: string }> {
  return [...source.matchAll(PLACEHOLDER)].map((match) => ({
    kind: match[1] ?? '',
    id: match[2] ?? '',
  }));
}

function strayNumbers(source: string, context: AnswerContext): string[] {
  let rest = source.replace(PLACEHOLDER, ' ').replace(ISO_DATE, ' ');
  // Longest first, so "Ridgeline 2P Backpacking Tent" goes before "Ridgeline 2P".
  const phrases = [...context.namedPhrases].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (phrase !== '') rest = rest.split(phrase).join(' ');
  }
  return [...rest.matchAll(NUMBER)]
    .map((match) => match[0])
    .filter((value) => !context.allowedNumbers.has(value));
}

function checkText(
  source: string,
  finding: number | null,
  context: AnswerContext,
  checkChange: boolean,
  extraAllowed: ReadonlySet<string> = new Set(),
): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const found = placeholders(source);

  for (const { kind, id } of found) {
    if (kind === 'ref' && !context.refs.has(id)) {
      issues.push({ finding, code: 'unknown-ref', message: `{{ref:${id}}} is not a figure any tool returned in this turn.` });
    }
    if (kind === 'audit' && !context.audits.has(id)) {
      issues.push({ finding, code: 'unknown-audit', message: `{{audit:${id}}} is not an audit check any tool returned in this turn.` });
    }
    if (kind === 'change') {
      const comparison = context.comparisons.get(id);
      if (comparison === undefined) {
        issues.push({ finding, code: 'unknown-change', message: `{{change:${id}}} is not a comparison any tool returned in this turn.` });
      } else if (!comparison.supportsConclusion) {
        issues.push({
          finding,
          code: 'unsupported-change',
          message: `{{change:${id}}} rests on a sample too small in one of the periods to support a conclusion. State the two figures with {{ref:…}} and say the sample is too small instead.`,
        });
      }
    }
  }

  for (const value of strayNumbers(source, context).filter((number) => !extraAllowed.has(number))) {
    issues.push({
      finding,
      code: 'raw-number',
      message: `"${value}" is written as a number. Every figure must come from a tool result as {{ref:…}} or {{change:…}}.`,
    });
  }

  if (checkChange && CHANGE_WORDS.test(source)) {
    const backed = found.some(
      ({ kind, id }) => kind === 'change' && context.comparisons.get(id)?.supportsConclusion === true,
    );
    if (!backed) {
      issues.push({
        finding,
        code: 'change-without-comparison',
        message:
          'The text describes a change over time but cites no comparison that supports one. Use {{change:…}} on a comparison whose sample supports a conclusion, or remove the claim.',
      });
    }
  }
  return issues;
}

/** Funnel refs are the ones produced by the funnel tool. */
function isFunnelRef(refId: string): boolean {
  return refId.startsWith('funnel:');
}

function citedRefIds(finding: AnswerFinding, basis: KnownFinding | undefined): string[] {
  const inline = [finding.observed, finding.whyPriority]
    .flatMap((part) => placeholders(part))
    .filter(({ kind }) => kind === 'ref' || kind === 'change')
    .map(({ id }) => id);
  return [...inline, ...(basis?.refIds ?? [])];
}

export function validateAnswer(answer: AgentAnswer, context: AnswerContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [...checkText(answer.summary, null, context, true)];
  const seen = new Set<string>();

  answer.findings.forEach((finding, index) => {
    const basis = context.findings.get(finding.basedOn);
    if (basis === undefined) {
      issues.push({ finding: index, code: 'unknown-basis', message: `basedOn "${finding.basedOn}" is not a finding any tool returned in this turn.` });
    } else if (basis.strength === 'insufficient') {
      issues.push({ finding: index, code: 'insufficient-basis', message: `"${finding.basedOn}" rests on too small a sample to be a finding. Report it as a gap instead.` });
    }
    if (seen.has(finding.basedOn)) {
      issues.push({ finding: index, code: 'duplicate-basis', message: `"${finding.basedOn}" is used by more than one finding.` });
    }
    seen.add(finding.basedOn);

    issues.push(...checkText(finding.observed, index, context, true));
    issues.push(...checkText(finding.whyPriority, index, context, true));
    // How to verify is advice ("check whether conversion improves"), so it
    // may use change words. It may repeat numbers from the engine's own advice
    // for this finding — thresholds such as "under 60 characters" — but may
    // not introduce figures of its own.
    const adviceNumbers = new Set([...(basis?.howToVerify ?? '').matchAll(NUMBER)].map((match) => match[0]));
    issues.push(...checkText(finding.howToVerify, index, context, false, adviceNumbers));

    const funnelRefs = citedRefIds(finding, basis)
      .filter(isFunnelRef)
      .map((id) => context.refs.get(id))
      .filter((ref): ref is CitableRef => ref !== undefined);
    if (finding.scope.productId !== null && funnelRefs.length > 0) {
      issues.push({
        finding: index,
        code: 'funnel-for-product',
        message: 'Funnel stages are not recorded per product, so no funnel figure can support a claim about one product.',
      });
    }
    if (finding.scope.channel !== null && funnelRefs.some((ref) => ref.channel === null)) {
      issues.push({
        finding: index,
        code: 'site-funnel-for-narrow-scope',
        message: `The site-wide funnel cannot stand in for ${finding.scope.channel}. Query the funnel for that channel.`,
      });
    }
  });

  return issues;
}

/** Turns an issue list into the one repair request sent back to the model. */
export function repairRequest(issues: readonly AnswerIssue[]): string {
  const lines = issues.map((issue) => {
    const where = issue.finding === null ? 'summary' : `findings[${issue.finding}]`;
    return `- ${where} (${issue.code}): ${issue.message}`;
  });
  return `Your answer did not pass validation. Fix every item and reply with the corrected JSON only.\n${lines.join('\n')}`;
}
