import { z } from 'zod';
import { rankFindings, type EvidenceStrength } from './priority';
import type { MetricUnit } from './refs';
import type { Priority } from '../types';

/**
 * The answer contract between the model and GrowthOS.
 *
 * Facts are structured, not written. A finding lists the figures it rests on
 * as `facts` — a ref id, a two-period change with the direction the model
 * claims, or an audit verdict — and GrowthOS writes every fact sentence itself
 * from the tool result: metric, channel, product, dates and value. Figures
 * that answer the question without raising any finding ("how many purchasing
 * sessions did this product get?") go in the answer's own `facts`.
 *
 * A finding's title and scope are never written by the model: they come from
 * the tool finding it rests on, and every fact it cites must sit inside that
 * scope. The model's prose (summary, why it matters, how to verify, gaps) may
 * contain no figures, no dates and no claims of change; it may name a product
 * only through `{{product:<id>}}`. This module checks that contract. It is
 * pure: the caller builds the context from the turn's tool outcomes.
 */

const prose = z.string().trim().min(1).max(1200);
const id = z.string().min(1).max(300);

export const factSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), refId: id }),
  z.strictObject({ kind: z.literal('change'), refId: id, direction: z.enum(['up', 'down', 'flat']) }),
  z.strictObject({ kind: z.literal('audit'), refId: id }),
]);

export const answerFindingSchema = z.strictObject({
  /** Id of the tool finding this rests on. Title, scope and ordering come from it. */
  basedOn: id,
  facts: z.array(factSchema).min(1).max(6),
  whyPriority: prose,
  howToVerify: prose,
});

export const agentAnswerSchema = z.strictObject({
  summary: prose,
  /** Figures that answer the question directly, without a finding behind them. */
  facts: z.array(factSchema).max(12),
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
  /** Which page the verdict is about: the product's name, or the page URL. */
  pageLabel: string;
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
  /** Set by the tool that raised the finding. */
  scope: { channel: string | null; productId: string | null };
}

export interface AnswerContext {
  refs: ReadonlyMap<string, CitableRef>;
  comparisons: ReadonlyMap<string, CitableComparison>;
  audits: ReadonlyMap<string, CitableAudit>;
  findings: ReadonlyMap<string, KnownFinding>;
  /** Product id → display name, for `{{product:<id>}}`. */
  products: ReadonlyMap<string, string>;
  /**
   * Figures from tool calls that raised no finding, in call order — what a
   * fallback answer shows when the question was a lookup, not a review.
   */
  figuresWithoutFindings: readonly string[];
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
  | 'change-in-prose'
  | 'action-claim'
  | 'findings-omitted'
  | 'top-finding-omitted';

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
  /\b(fell|falls?|falling|dropped|declin\w*|decreas\w*|rose|rises?|rising|increas\w*|grew|grow(s|ing)?|worsen\w*|improv\w*|weaker|stronger|down from|up from|than (last|the previous|before)|previous (period|month|week)|last (month|week))\b|下降|下滑|下跌|减少|降低|上升|增长|提升|提高|增加|回落|走低|走高|变差|变弱|变强|改善|环比|同比|上月|上周|上期|前期|之前|以前|从前|不及|不如|逊于|好于|差于|走弱|走强|恶化|好转|回升|攀升|下挫|疲软|\b(weaken\w*|strengthen\w*|deteriorat\w*|recover\w*|slipp\w*|plung\w*|surg\w*|soar\w*)\b/i;

const DIGIT = /\d+(?:[.,]\d+)*/g;

/**
 * Figures written in words. Not exhaustive — the facts carry the figures —
 * but it closes the routes a business figure takes: a numeral next to a
 * metric unit ("三笔订单", "three orders"), percentages ("百分之三",
 * "percent"), and longer numerals ("三十次"). A lone numeral in ordinary
 * speech ("再检查一次") is left alone.
 */
const CN_NUMERAL = '[零〇一二两三四五六七八九十百千万亿几]';
const CN_METRIC_UNIT = '(?:笔|单|个?订单|个?会话|次会话|次购买|次访问|位(?:用户|顾客|客户|访客)?|件|美元|元|倍|个百分点)';
const EN_NUMBER_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|a few hundred|several hundred)';
const EN_METRIC_UNIT = '(?:orders?|sessions?|purchases?|customers?|users?|visits?|visitors?|units?|dollars?|percent|clicks?|conversions?)';
const NUMBER_WORDS = new RegExp(
  [
    '百分之',
    `${CN_NUMERAL}+${CN_METRIC_UNIT}`,
    `${CN_NUMERAL}{2,}(?:次|天|周|个月)`,
    `\\b${EN_NUMBER_WORD}[- ]${EN_METRIC_UNIT}\\b`,
    '\\bper ?cent\\b',
  ].join('|'),
  'i',
);

/**
 * Claims that an action was carried out. There is no tool that changes
 * anything, so any such claim is false, whether or not a tool was tried.
 * Narrow on purpose: "sessions that completed checkout" or "已完成结账的会话"
 * describe the data, not an action.
 */
const ACTION_CLAIMS =
  /已(经)?(帮你|为你|替你)?(把|将)[^。！？.!?]{0,20}?(标记|标为|改为|设为|完成|修改|删除|暂停|发送|关闭|更新|设置|调整)|已(经)?(帮你|为你|替你)?(标记|标为|修改|删除|暂停|发送|关闭|更新|设置|调整)(了|为|成|好)?|\b(i|we)('ve| have)? (marked|updated|deleted|paused|sent|applied|closed|changed|adjusted|completed)\b|\b(has|have) been (marked|done|completed|updated|deleted|paused|sent|changed|applied|closed)\b|\bis now marked\b/i;

interface ProseRules {
  /** Change words are allowed in advice ("check whether it improves"). */
  allowChangeWords: boolean;
}

function checkProse(raw: string, finding: number | null, context: AnswerContext, rules: ProseRules): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  // Full-width and other compatibility digits ("３０％") become plain ones first.
  const source = raw.normalize('NFKC');

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
  if (NUMBER_WORDS.test(withoutProducts)) {
    issues.push({
      finding,
      code: 'raw-number',
      message: 'The prose writes a figure out in words. Figures come only from facts, which GrowthOS writes out.',
    });
  }
  if (ACTION_CLAIMS.test(withoutProducts)) {
    issues.push({
      finding,
      code: 'action-claim',
      message: 'The prose says an action was carried out. This agent has no tool that changes anything, so nothing was done. Say only what the analysis found.',
    });
  }
  if (!rules.allowChangeWords && CHANGE_WORDS.test(withoutProducts)) {
    issues.push({
      finding,
      code: 'change-in-prose',
      message: 'The prose describes a change over time or a comparison with another period. State it as a change fact, whose direction GrowthOS checks against the data, and keep the prose free of it.',
    });
  }
  return issues;
}

type Scope = { channel: string | null; productId: string | null };

function checkFact(fact: AnswerFact, finding: number | null, context: AnswerContext, scope: Scope | null): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  if (fact.kind === 'audit') {
    const audit = context.audits.get(fact.refId);
    if (audit === undefined) {
      issues.push({ finding, code: 'unknown-audit', message: `Audit fact "${fact.refId}" is not a check any tool returned in this turn.` });
    } else if (scope !== null && audit.productId !== null && scope.productId !== audit.productId) {
      issues.push({ finding, code: 'scope-mismatch', message: `Audit fact "${fact.refId}" is about product ${audit.productId}, but the finding is about ${scope.productId ?? 'no single product'}.` });
    }
    return issues;
  }
  const ref = context.refs.get(fact.refId);
  if (ref === undefined) {
    issues.push({ finding, code: 'unknown-ref', message: `Fact "${fact.refId}" is not a figure any tool returned in this turn.` });
    return issues;
  }
  if (fact.kind === 'change') {
    const comparison = context.comparisons.get(fact.refId);
    if (comparison === undefined) {
      issues.push({ finding, code: 'unknown-change', message: `"${fact.refId}" has no comparison with a previous period. Use a value fact instead.` });
    } else if (!comparison.supportsConclusion) {
      issues.push({ finding, code: 'unsupported-change', message: `The comparison for "${fact.refId}" rests on a sample too small in one of the periods to support a conclusion. Cite the figures as value facts and report the small sample as a gap.` });
    } else if (comparison.direction !== fact.direction) {
      issues.push({ finding, code: 'wrong-direction', message: `"${fact.refId}" moved ${comparison.direction}, not ${fact.direction}.` });
    }
  }
  if (scope !== null) issues.push(...checkRefScope(ref, finding, scope));
  return issues;
}

/**
 * A figure inside a finding must sit within the finding's scope. A site-wide
 * figure that is not a funnel figure may serve as a benchmark (a channel's
 * CAC against the site's order value); the site funnel may not stand in for a
 * channel, and no funnel figure may stand in for a product.
 */
function checkRefScope(ref: CitableRef, finding: number | null, scope: Scope): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  if (ref.channel !== null && ref.channel !== scope.channel) {
    issues.push({ finding, code: 'scope-mismatch', message: `"${ref.refId}" is a ${ref.channel} figure, but the finding is about ${scope.channel ?? 'all channels'}.` });
  }
  if (ref.productId !== null && ref.productId !== scope.productId) {
    issues.push({ finding, code: 'scope-mismatch', message: `"${ref.refId}" is about product ${ref.productId}, but the finding is about ${scope.productId ?? 'no single product'}.` });
  }
  if (ref.funnel && scope.productId !== null) {
    issues.push({ finding, code: 'funnel-for-product', message: 'Funnel stages are not recorded per product, so no funnel figure can support a claim about one product.' });
  }
  if (ref.funnel && ref.channel === null && scope.channel !== null) {
    issues.push({ finding, code: 'site-funnel-for-narrow-scope', message: `The site-wide funnel cannot stand in for ${scope.channel}. Query the funnel for that channel.` });
  }
  return issues;
}

export function validateAnswer(answer: AgentAnswer, context: AnswerContext): AnswerIssue[] {
  const issues: AnswerIssue[] = [...checkProse(answer.summary, null, context, { allowChangeWords: false })];
  for (const gap of answer.gaps) issues.push(...checkProse(gap, null, context, { allowChangeWords: false }));
  // Standalone facts are written out with their own scope, so only their
  // existence and any claimed change are checked.
  for (const fact of answer.facts) issues.push(...checkFact(fact, null, context, null));

  // When the tools raised findings, the answer must show the ranked actions,
  // led by the one GrowthOS ranks first. A lookup that raised none may answer
  // with figures alone.
  const rankable = [...context.findings.values()].filter((finding) => finding.strength !== 'insufficient');
  if (rankable.length > 0) {
    const top = rankFindings(rankable).ranked[0]?.finding;
    if (answer.findings.length === 0) {
      issues.push({ finding: null, code: 'findings-omitted', message: `The tools raised ${rankable.length > 1 ? 'findings' : 'a finding'} this turn, but the answer shows none. Include them as findings; GrowthOS orders them.` });
    } else if (top !== undefined && !answer.findings.some((finding) => finding.basedOn === top.id)) {
      issues.push({ finding: null, code: 'top-finding-omitted', message: `"${top.id}" is the highest-ranked finding this turn and must be included.` });
    }
  }

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

    // The basis decides the scope; every cited fact, and the basis's own
    // figures, must sit inside it.
    const scope = basis?.scope ?? null;
    for (const fact of finding.facts) issues.push(...checkFact(fact, index, context, scope));
    if (basis !== undefined && scope !== null) {
      for (const refId of basis.refIds) {
        const ref = context.refs.get(refId);
        if (ref !== undefined) issues.push(...checkRefScope(ref, index, scope));
      }
    }
    issues.push(...checkProse(finding.whyPriority, index, context, { allowChangeWords: false }));
    // Advice may say "check whether conversion improves", but may not carry
    // numbers: the rule's own guidance, thresholds included, is shown verbatim
    // next to it.
    issues.push(...checkProse(finding.howToVerify, index, context, { allowChangeWords: true }));
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
