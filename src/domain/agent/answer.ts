import { z } from 'zod';
import type { EvidenceStrength } from './priority';
import type { MetricUnit } from './refs';
import type { Priority } from '../types';

/**
 * The answer contract between the model and GrowthOS.
 *
 * Facts are structured, not written. A finding lists the figures it rests on
 * as `facts` — a ref id, a two-period change with the direction the model
 * claims, or an audit verdict — and GrowthOS writes every fact sentence itself
 * from the tool result: metric, channel, product, dates and value. The model's
 * prose (summary, why it matters, how to verify, gaps) may contain no figures,
 * no dates and no claims of change; it may name a product only through
 * `{{product:<id>}}`. This module checks that contract. It is pure: the caller
 * builds the context from the turn's tool outcomes.
 */

const prose = z.string().trim().min(1).max(1200);
const id = z.string().min(1).max(300);

export const factSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), refId: id }),
  z.strictObject({ kind: z.literal('change'), refId: id, direction: z.enum(['up', 'down', 'flat']) }),
  z.strictObject({ kind: z.literal('audit'), refId: id }),
]);

export const answerFindingSchema = z.strictObject({
  /** Id of the tool finding this rests on. Title and ordering come from it. */
  basedOn: id,
  facts: z.array(factSchema).min(1).max(6),
  whyPriority: prose,
  howToVerify: prose,
  /** What the finding is about. Checked against every fact it cites. */
  scope: z.strictObject({
    channel: z.string().max(40).nullable(),
    productId: z.string().max(80).nullable(),
  }),
});

export const agentAnswerSchema = z.strictObject({
  summary: prose,
  findings: z.array(answerFindingSchema).max(8),
  /** What is missing and how it could be checked. */
  gaps: z.array(prose).max(8),
});

export type AnswerFact = z.infer<typeof factSchema>;
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
  window: { start: string; end: string };
  /** True for funnel figures, which describe one population of sessions. */
  funnel: boolean;
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
  productId: string | null;
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
  /** Product id → display name, for `{{product:<id>}}`. */
  products: ReadonlyMap<string, string>;
  /** Channel names, to check that prose stays within a finding's scope. */
  channels: readonly string[];
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
  | 'wrong-direction'
  | 'unknown-basis'
  | 'insufficient-basis'
  | 'duplicate-basis'
  | 'scope-mismatch'
  | 'site-funnel-for-narrow-scope'
  | 'funnel-for-product'
  | 'raw-number'
  | 'placeholder-in-prose'
  | 'unknown-product'
  | 'change-in-prose';

export interface AnswerIssue {
  /** null = the summary or the gaps. */
  finding: number | null;
  code: AnswerIssueCode;
  message: string;
}

/** The one placeholder prose may use. Product ids contain no spaces or braces. */
export const PRODUCT_PLACEHOLDER = /\{\{product:([^{}\s]+)\}\}/g;
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

/**
 * Words that assert a change over time or a comparison with another period.
 * Changes belong in `change` facts, where the direction is checked against the
 * data; prose that claims one is refused. This is a backstop, not a proof:
 * a paraphrase the list does not know can still slip through, which is why the
 * facts, not the prose, carry the figures.
 */
const CHANGE_WORDS =
  /\b(fell|falls?|falling|dropped|declin\w*|decreas\w*|rose|rises?|rising|increas\w*|grew|grow(s|ing)?|worsen\w*|improv\w*|weaker|stronger|down from|up from|than (last|the previous|before)|previous (period|month|week)|last (month|week))\b|下降|下滑|下跌|减少|降低|上升|增长|提升|提高|增加|回落|走低|走高|变差|变弱|变强|改善|环比|同比|上月|上周|上期|前期|比之前/i;

const DIGIT = /\d+(?:[.,]\d+)*/g;

interface ProseRules {
  /** Change words are allowed in advice ("check whether it improves"). */
  allowChangeWords: boolean;
  /** When set, channel names in the text must be this channel. */
  channel?: string | null;
}

function checkProse(source: string, finding: number | null, context: AnswerContext, rules: ProseRules): AnswerIssue[] {
  const issues: AnswerIssue[] = [];

  for (const match of source.matchAll(PRODUCT_PLACEHOLDER)) {
    const productId = match[1] ?? '';
    if (!context.products.has(productId)) {
      issues.push({ finding, code: 'unknown-product', message: `{{product:${productId}}} is not a product in the catalogue.` });
    }
  }
  const withoutProducts = source.replace(PRODUCT_PLACEHOLDER, ' ');
  for (const match of withoutProducts.matchAll(ANY_PLACEHOLDER)) {
    issues.push({
      finding,
      code: 'placeholder-in-prose',
      message: `"${match[0]}" cannot be used in prose. Put figures, changes and audit verdicts in the finding's facts; GrowthOS writes them out.`,
    });
  }
  for (const match of withoutProducts.replace(ANY_PLACEHOLDER, ' ').matchAll(DIGIT)) {
    issues.push({
      finding,
      code: 'raw-number',
      message: `"${match[0]}" is a number in prose. Figures, dates and window lengths come only from facts, which GrowthOS writes out; refer to a product with {{product:<id>}}.`,
    });
  }
  if (!rules.allowChangeWords && CHANGE_WORDS.test(withoutProducts)) {
    issues.push({
      finding,
      code: 'change-in-prose',
      message: 'The prose describes a change over time or a comparison with another period. State it as a change fact, whose direction GrowthOS checks against the data, and keep the prose free of it.',
    });
  }
  if (rules.channel !== undefined) {
    // Longest first and removed once found, so "AI Referral" is not also read as "Referral".
    let rest = withoutProducts;
    for (const channel of [...context.channels].sort((a, b) => b.length - a.length)) {
      const pattern = new RegExp(`\\b${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      if (!pattern.test(rest)) continue;
      rest = rest.replace(pattern, ' ');
      if (channel !== rules.channel) {
        issues.push({
          finding,
          code: 'scope-mismatch',
          message: `The text names ${channel}, but the finding is about ${rules.channel ?? 'all channels'}.`,
        });
      }
    }
  }
  return issues;
}

/** Every figure a finding rests on: its facts, and the refs its basis cites. */
function citedRefs(finding: AnswerFinding, basis: KnownFinding | undefined, context: AnswerContext): CitableRef[] {
  const ids = [
    ...finding.facts.filter((fact) => fact.kind !== 'audit').map((fact) => fact.refId),
    ...(basis?.refIds ?? []),
  ];
  return ids.map((refId) => context.refs.get(refId)).filter((ref): ref is CitableRef => ref !== undefined);
}

function checkFacts(finding: AnswerFinding, index: number, context: AnswerContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  for (const fact of finding.facts) {
    if (fact.kind === 'audit') {
      const audit = context.audits.get(fact.refId);
      if (audit === undefined) {
        issues.push({ finding: index, code: 'unknown-audit', message: `Audit fact "${fact.refId}" is not a check any tool returned in this turn.` });
      } else if (audit.productId !== null && finding.scope.productId !== audit.productId) {
        issues.push({ finding: index, code: 'scope-mismatch', message: `Audit fact "${fact.refId}" is about product ${audit.productId}, but the finding's scope says ${finding.scope.productId ?? 'no product'}.` });
      }
      continue;
    }
    if (!context.refs.has(fact.refId)) {
      issues.push({ finding: index, code: 'unknown-ref', message: `Fact "${fact.refId}" is not a figure any tool returned in this turn.` });
      continue;
    }
    if (fact.kind === 'change') {
      const comparison = context.comparisons.get(fact.refId);
      if (comparison === undefined) {
        issues.push({ finding: index, code: 'unknown-change', message: `"${fact.refId}" has no comparison with a previous period. Use a value fact instead.` });
      } else if (!comparison.supportsConclusion) {
        issues.push({ finding: index, code: 'unsupported-change', message: `The comparison for "${fact.refId}" rests on a sample too small in one of the periods to support a conclusion. Cite the figures as value facts and report the small sample as a gap.` });
      } else if (comparison.direction !== fact.direction) {
        issues.push({ finding: index, code: 'wrong-direction', message: `"${fact.refId}" moved ${comparison.direction}, not ${fact.direction}.` });
      }
    }
  }
  return issues;
}

function checkScope(finding: AnswerFinding, index: number, basis: KnownFinding | undefined, context: AnswerContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const refs = citedRefs(finding, basis, context);
  const { channel, productId } = finding.scope;

  for (const ref of refs) {
    if (ref.channel !== null && ref.channel !== channel) {
      issues.push({ finding: index, code: 'scope-mismatch', message: `"${ref.refId}" is a ${ref.channel} figure, but the finding is about ${channel ?? 'all channels'}.` });
    }
    if (ref.productId !== null && ref.productId !== productId) {
      issues.push({ finding: index, code: 'scope-mismatch', message: `"${ref.refId}" is about product ${ref.productId}, but the finding is about ${productId ?? 'no single product'}.` });
    }
  }
  const funnel = refs.filter((ref) => ref.funnel);
  if (productId !== null && funnel.length > 0) {
    issues.push({ finding: index, code: 'funnel-for-product', message: 'Funnel stages are not recorded per product, so no funnel figure can support a claim about one product.' });
  }
  if (channel !== null && funnel.some((ref) => ref.channel === null)) {
    issues.push({ finding: index, code: 'site-funnel-for-narrow-scope', message: `The site-wide funnel cannot stand in for ${channel}. Query the funnel for that channel.` });
  }
  return issues;
}

export function validateAnswer(answer: AgentAnswer, context: AnswerContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [...checkProse(answer.summary, null, context, { allowChangeWords: false })];
  for (const gap of answer.gaps) issues.push(...checkProse(gap, null, context, { allowChangeWords: false }));

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

    issues.push(...checkFacts(finding, index, context));
    issues.push(...checkScope(finding, index, basis, context));
    issues.push(...checkProse(finding.whyPriority, index, context, { allowChangeWords: false, channel: finding.scope.channel }));
    // Advice may say "check whether conversion improves", but may not carry
    // numbers: the rule's own guidance, thresholds included, is shown verbatim
    // next to it.
    issues.push(...checkProse(finding.howToVerify, index, context, { allowChangeWords: true, channel: finding.scope.channel }));
  });

  return issues;
}

/** Turns an issue list into the one repair request sent back to the model. */
export function repairRequest(issues: readonly AnswerIssue[]): string {
  const lines = issues.map((issue) => {
    const where = issue.finding === null ? 'summary or gaps' : `findings[${issue.finding}]`;
    return `- ${where} (${issue.code}): ${issue.message}`;
  });
  return `Your answer did not pass validation. Fix every item and reply with the corrected JSON only.\n${lines.join('\n')}`;
}
