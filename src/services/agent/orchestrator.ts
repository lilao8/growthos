import { z } from 'zod';
import {
  agentAnswerSchema,
  repairRequest,
  validateAnswer,
  type AnswerContext,
  type AnswerIssue,
  type CitableAudit,
  type CitableComparison,
  type CitableRef,
} from '@/domain/agent/answer';
import { looksLikeActionRequest } from '@/domain/agent/intent';
import { AGENT_PRIORITY_VERSION, rankFindings } from '@/domain/agent/priority';
import type { MetricRef } from '@/domain/agent/refs';
import { fallbackAnswer, renderAnswer, type RenderedAnswer } from '@/domain/agent/answer-render';
import { scopeWindow, type ConversationScope } from '@/domain/agent/scope';
import type { DateWindow } from '@/domain/demo-window';
import { AGENT_TOOLS, runTool, type RunToolOutcome } from '@/services/agent-tools/registry';
import type { AgentFinding, AuditRef, ProvidedState } from '@/services/agent-tools/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import { AnswerContextBuilder, type ToolGap } from './answer-context';
import type { AgentMessage, ModelClient, ToolCall, ToolSpec } from './model';
import { systemPrompt } from './prompt';
import {
  applyScopeUpdate,
  SCOPE_TOOL_DESCRIPTION,
  SCOPE_TOOL_NAME,
  scopeUpdateInput,
} from './scope-tool';

/**
 * One turn of the analysis agent.
 *
 * The loop: the model picks tools, GrowthOS validates and runs them, the model
 * answers, GrowthOS validates the answer. Limits are enforced here, not asked
 * of the model. Nothing in this module writes: tools receive the visitor's
 * state as a value and the traffic repository only loads.
 */

export interface AgentLimits {
  maxToolCalls: number;
  toolTimeoutMs: number;
  turnTimeoutMs: number;
  /** Model round trips, including the one repair. Bounds a model that never answers. */
  maxModelSteps: number;
  /** Characters of one tool result sent to the model, after compaction. */
  maxToolResultChars: number;
  /** Characters of all messages sent to the model in one turn. */
  maxInputChars: number;
}

/** The smallest share a tool result is given, enough for its status and a few figures. */
const MIN_TOOL_RESULT_CHARS = 1_500;

export const DEFAULT_LIMITS: AgentLimits = {
  maxToolCalls: 8,
  toolTimeoutMs: 5_000,
  turnTimeoutMs: 60_000,
  maxModelSteps: 12,
  maxToolResultChars: 24_000,
  maxInputChars: 160_000,
};

export interface PriorTurn {
  question: string;
  /** Plain-text summary of the previous answer, for context only. */
  answerSummary: string;
}

export interface AgentTurnInput {
  question: string;
  history: readonly PriorTurn[];
  scope: ConversationScope;
}

export interface AgentDeps {
  model: ModelClient;
  traffic: TrafficRepository;
  state: ProvidedState;
  now: () => string;
  limits?: Partial<AgentLimits>;
  signal?: AbortSignal;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  /** Arguments as executed, after the current scope filled any omitted fields. */
  input: unknown;
  status: string;
  summary: string;
}

export type AgentEvent =
  | { type: 'started'; scope: ConversationScope; window: DateWindow; model: string }
  | { type: 'scope'; scope: ConversationScope; window: DateWindow }
  | { type: 'tool-start'; id: string; name: string; input: unknown }
  | { type: 'tool-end'; record: ToolCallRecord }
  | { type: 'answering' }
  | { type: 'repairing'; issues: AnswerIssue[] }
  | { type: 'done'; result: AgentTurnResult };

export interface AgentTurnResult {
  /** answered: the model's answer passed; fallback: GrowthOS built it; failed: nothing usable. */
  status: 'answered' | 'fallback' | 'failed';
  answer: RenderedAnswer | null;
  scope: ConversationScope;
  window: DateWindow;
  toolCalls: ToolCallRecord[];
  /** Gaps reported by the tools, in GrowthOS's own words, with links to the figures behind them. */
  toolGaps: ToolGap[];
  /** How lookups were resolved, e.g. a partial name match and how many products it hit. */
  toolNotes: string[];
  /** Actions the model tried that do not exist. */
  refusedActions: string[];
  /**
   * True when nothing may be read as having been done: the model tried an
   * action, or claimed one in its answer. GrowthOS then writes the summary,
   * so an answer can never say a change was made.
   */
  noActionTaken: boolean;
  /** Tool calls that failed, so a failure is never read as an empty result. */
  failedChecks: Array<{ name: string; message: string }>;
  /**
   * The raw figures, comparisons and audit verdicts the answer shows or rests
   * on, frozen with the result so a replay can be checked without the tools.
   */
  citations: {
    refs: CitableRef[];
    comparisons: CitableComparison[];
    audits: CitableAudit[];
  };
  /** Where the figures came from and which rule versions judged them. */
  provenance: { dataSources: string[]; ruleVersions: string[] };
  /**
   * Every answer the model submitted this turn and what validation found in
   * each, in order. One entry with no codes is a first-time pass; more
   * entries mean the answer was repaired (or, if it still failed, replaced).
   */
  validation: Array<{ issueCodes: string[] }>;
  /**
   * Tokens the model reported for this turn, when it reports them: totals,
   * `requests` = the number of model responses that reported usage (an HTTP
   * retry inside the adapter is not counted separately), and the largest
   * single prompt — the one that meets a per-request limit first.
   */
  usage: { promptTokens: number; completionTokens: number; requests: number; largestPromptTokens: number } | null;
  /** Issues from the last validation, when the answer had to be repaired or replaced. */
  issues: AnswerIssue[];
  /** Limits hit, timeouts and similar, for the operator. */
  notes: string[];
  model: string;
  message: string | null;
}

const DATA_TOOL_SPECS: ToolSpec[] = AGENT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>,
}));

const SCOPE_TOOL_SPEC: ToolSpec = {
  name: SCOPE_TOOL_NAME,
  description: SCOPE_TOOL_DESCRIPTION,
  parameters: z.toJSONSchema(scopeUpdateInput, { io: 'input' }) as Record<string, unknown>,
};

export const TOOL_SPECS: readonly ToolSpec[] = [...DATA_TOOL_SPECS, SCOPE_TOOL_SPEC];

/** Top-level argument names each data tool accepts, read from its own schema. */
const ACCEPTED_FIELDS = new Map(
  DATA_TOOL_SPECS.map((spec) => [
    spec.name,
    new Set(Object.keys((spec.parameters as { properties?: object }).properties ?? {})),
  ]),
);

/** Fields of the current scope a data tool accepts, filled in only when the call omits them. */
export function applyScope(name: string, input: unknown, scope: ConversationScope): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const accepted = ACCEPTED_FIELDS.get(name);
  if (accepted === undefined) return input;
  const filled: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  if (accepted.has('range') && !('range' in filled)) filled['range'] = scope.range;
  if (accepted.has('channel') && !('channel' in filled)) filled['channel'] = scope.channel;
  const narrowsByText = 'query' in filled && filled['query'] !== null;
  if (accepted.has('products') && !('products' in filled) && !narrowsByText && scope.products.length > 0) {
    filled['products'] = [...scope.products];
  }
  return filled;
}

/** Characters sent to the model: every message's text and tool-call arguments. */
export function messageChars(messages: readonly AgentMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += message.content?.length ?? 0;
    if (message.role === 'assistant') for (const call of message.toolCalls) total += call.name.length + call.arguments.length;
  }
  return total;
}

function citationsFor(answer: RenderedAnswer | null, context: AnswerContext): AgentTurnResult['citations'] {
  const ids = answer?.citedRefIds ?? [];
  const pick = <T>(map: ReadonlyMap<string, T>): T[] => ids.map((id) => map.get(id)).filter((value): value is T => value !== undefined);
  return { refs: pick(context.refs), comparisons: pick(context.comparisons), audits: pick(context.audits) };
}

class Timeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Timeout(`timed out after ${ms} ms`)), ms);
    const abort = (): void => {
      clearTimeout(timer);
      reject(new Timeout('the request was cancelled or ran out of time'));
    };
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * What the model sees of a tool outcome, within a character budget.
 *
 * Full first. Over budget, the raw `data` goes and what an answer may cite is
 * kept, in tiers: the figures the kept findings cite; then each two-period
 * comparison as a pair, with both of its figures and its evidence verdict;
 * then the remaining figures in the tool's own order — which is what a lookup
 * with no finding (product figures, say) is made of. Only when even the
 * findings do not fit are the lowest-ranked findings dropped. The result says
 * what was left out, so the model never mistakes it for complete.
 */
export function forModel(
  outcome: RunToolOutcome | { status: 'ok'; scope: ConversationScope },
  maxChars: number = DEFAULT_LIMITS.maxToolResultChars,
): string {
  const full = fullForModel(outcome);
  if (full.length <= maxChars || !('meta' in outcome) || (outcome.status !== 'ok' && outcome.status !== 'empty')) return full;

  const ranked = rankFindings(outcome.findings).ranked.map((entry) => entry.finding);
  const ordered = [...ranked, ...outcome.findings.filter((finding) => !ranked.includes(finding))];
  const comparisons = comparisonsIn(outcome.data);
  const refsById = new Map(outcome.meta.refs.map((ref) => [ref.refId, ref]));

  const build = (findings: AgentFinding[], keptComparisons: readonly CompactComparison[], extraFigures: ReadonlySet<string>): string | null => {
    const cited = new Set(findings.flatMap((finding) => finding.refIds));
    const included = new Set([...cited, ...extraFigures]);
    // Each kept comparison brings both of its figures, so the pair is whole.
    for (const comparison of keptComparisons) {
      included.add(comparison.currentRefId);
      if (comparison.previousRefId !== null) included.add(comparison.previousRefId);
    }
    const refs = outcome.meta.refs.filter((ref) => included.has(ref.refId) && refsById.has(ref.refId));
    const text = JSON.stringify({
      status: outcome.status,
      truncated: {
        reason: `This result was larger than ${maxChars} characters, so its raw data was left out.`,
        findingsShown: findings.length,
        findingsTotal: outcome.findings.length,
        figuresShown: refs.length,
        figuresTotal: outcome.meta.refs.length,
        comparisonsShown: keptComparisons.length,
        comparisonsTotal: comparisons.length,
      },
      window: outcome.meta.window,
      previousWindow: outcome.meta.previousWindow,
      findings: findings.map(findingForModel),
      refs: refs.map(refForModel),
      comparisons: keptComparisons,
      auditRefs: outcome.meta.auditRefs.filter((ref) => cited.has(ref.refId)).map(auditForModel),
      gaps: outcome.meta.gaps,
    });
    return text.length <= maxChars ? text : null;
  };

  for (let keep = ordered.length; keep >= 0; keep -= 1) {
    const findings = ordered.slice(0, keep);
    if (build(findings, [], new Set()) === null) continue;
    // Comparisons first, then plain figures, each in order, each kept if it
    // still fits and skipped if not — so one item too large never blocks the
    // smaller ones behind it.
    const kept: CompactComparison[] = [];
    for (const comparison of comparisons) {
      if (build(findings, [...kept, comparison], new Set()) !== null) kept.push(comparison);
    }
    const figures = new Set<string>();
    for (const ref of outcome.meta.refs) {
      if (build(findings, kept, new Set([...figures, ref.refId])) !== null) figures.add(ref.refId);
    }
    return build(findings, kept, figures) ?? '';
  }
  return JSON.stringify({ status: outcome.status, truncated: { reason: `This result was too large to send (limit ${maxChars} characters).` } });
}

interface CompactComparison {
  currentRefId: string;
  previousRefId: string | null;
  current: number | null;
  previous: number | null;
  direction: string;
  supportsConclusion: boolean;
}

/** Every two-period comparison in a tool's data, reduced to what an answer may cite. */
function comparisonsIn(value: unknown, into: CompactComparison[] = []): CompactComparison[] {
  if (Array.isArray(value)) {
    for (const item of value) comparisonsIn(item, into);
    return into;
  }
  if (value === null || typeof value !== 'object') return into;
  const record = value as Record<string, unknown>;
  const evidence = record['evidence'];
  if (typeof record['currentRefId'] === 'string' && evidence !== null && typeof evidence === 'object') {
    into.push({
      currentRefId: record['currentRefId'],
      previousRefId: typeof record['previousRefId'] === 'string' ? record['previousRefId'] : null,
      current: typeof record['current'] === 'number' ? record['current'] : null,
      previous: typeof record['previous'] === 'number' ? record['previous'] : null,
      direction: typeof record['direction'] === 'string' ? record['direction'] : 'unknown',
      supportsConclusion: (evidence as Record<string, unknown>)['supportsConclusion'] === true,
    });
    return into;
  }
  for (const item of Object.values(record)) comparisonsIn(item, into);
  return into;
}

function findingForModel(finding: AgentFinding) {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    priority: finding.priority,
    strength: finding.strength,
    affectedSessions: finding.affectedSessions,
    // What affectedSessions counts, so the prose cannot read a step's sample
    // as the sessions it lost.
    sampleLabel: finding.sampleLabel,
    lostSessions: finding.lostSessions,
    observed: finding.observed,
    howToVerify: finding.howToVerify,
    refIds: finding.refIds,
    scope: finding.scope,
  };
}

function refForModel(ref: MetricRef) {
  return { refId: ref.refId, label: ref.label, value: ref.value, unit: ref.unit, channel: ref.channel, productId: ref.productId, window: ref.window };
}

function auditForModel(ref: AuditRef) {
  return { refId: ref.refId, productId: ref.productId, ruleId: ref.ruleId, status: ref.status, severity: ref.severity, evidence: ref.evidence };
}

function fullForModel(outcome: RunToolOutcome | { status: 'ok'; scope: ConversationScope }): string {
  if (outcome.status !== 'ok' && outcome.status !== 'empty') return JSON.stringify(outcome);
  if (!('meta' in outcome)) return JSON.stringify(outcome);
  return JSON.stringify({
    status: outcome.status,
    window: outcome.meta.window,
    previousWindow: outcome.meta.previousWindow,
    data: outcome.data,
    findings: outcome.findings.map(findingForModel),
    refs: outcome.meta.refs.map(refForModel),
    auditRefs: outcome.meta.auditRefs.map(auditForModel),
    gaps: outcome.meta.gaps,
    dataSources: outcome.meta.dataSources,
  });
}

function summarize(outcome: RunToolOutcome | { status: 'ok'; scope: ConversationScope }): string {
  if ('scope' in outcome) {
    const channel = outcome.scope.channel ?? 'all channels';
    return `Scope set to ${outcome.scope.range} days, ${channel}.`;
  }
  switch (outcome.status) {
    case 'ok':
    case 'empty':
      return `${outcome.status === 'empty' ? 'No rows' : `${outcome.findings.length} findings`}, ${outcome.meta.refs.length + outcome.meta.auditRefs.length} citable figures, ${outcome.meta.gaps.length} gaps.`;
    case 'unsupported':
      return `Not supported: ${outcome.reason}`;
    case 'invalid-input':
      return `Invalid input: ${outcome.issues.join('; ')}`;
    case 'unknown-tool':
      return `No such tool: ${outcome.name}. The agent is read-only.`;
    case 'error':
      return `Failed: ${outcome.message}`;
  }
}

function parseArguments(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (raw.trim() === '') return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, message: 'Arguments are not valid JSON.' };
  }
}

/** Models sometimes wrap JSON in a code fence; nothing else is tolerated. */
function parseAnswerJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
}

export async function runAgentTurn(
  input: AgentTurnInput,
  deps: AgentDeps,
  onEvent: (event: AgentEvent) => void = () => {},
): Promise<AgentTurnResult> {
  const limits: AgentLimits = { ...DEFAULT_LIMITS, ...deps.limits };
  const turn = new AbortController();
  const turnTimer = setTimeout(() => turn.abort(), limits.turnTimeoutMs);
  const onOuterAbort = (): void => turn.abort();
  // An already-aborted signal never fires 'abort' again, so check it now.
  if (deps.signal?.aborted === true) turn.abort();
  deps.signal?.addEventListener('abort', onOuterAbort, { once: true });

  let scope = input.scope;
  const context = new AnswerContextBuilder(deps.state.value.products);
  const toolCalls: ToolCallRecord[] = [];
  const notes: string[] = [];
  let issues: AnswerIssue[] = [];
  let repaired = false;
  let toolCallsUsed = 0;
  let usage = null as AgentTurnResult['usage'];
  let budgetReached = false;
  const validationLog: string[][] = [];
  /** Set when any answer this turn claimed an action was carried out. */
  let actionClaimed = false;
  let limitAnnounced = false;

  const messages: AgentMessage[] = [{ role: 'system', content: systemPrompt(scope) }];
  for (const prior of input.history) {
    messages.push({ role: 'user', content: prior.question });
    messages.push({ role: 'assistant', content: prior.answerSummary, toolCalls: [] });
  }
  messages.push({ role: 'user', content: input.question });

  const finish = (
    result: Omit<AgentTurnResult, 'scope' | 'window' | 'toolCalls' | 'toolGaps' | 'notes' | 'model' | 'refusedActions' | 'failedChecks' | 'noActionTaken' | 'citations' | 'provenance' | 'usage' | 'validation' | 'toolNotes'>,
  ): AgentTurnResult => {
    clearTimeout(turnTimer);
    deps.signal?.removeEventListener('abort', onOuterAbort);
    const refusedActions = [...new Set(toolCalls.filter((call) => call.status === 'unknown-tool').map((call) => call.name))];
    // Asked to act, tried to act, or claimed to have acted: in every case
    // nothing was done, and the system says so.
    const noActionTaken = refusedActions.length > 0 || actionClaimed || looksLikeActionRequest(input.question);
    const refusal = [
      {
        kind: 'text' as const,
        text:
          refusedActions.length > 0
            ? `No action was taken: ${refusedActions.join(', ')} does not exist, because this agent can only read and analyse. Any findings below come from the data it read.`
            : 'No action was taken: this agent has no tool that changes anything, so nothing was changed. Any findings below come from the data it read.',
      },
    ];
    // The system, not the model, reports what happened to a requested action
    // — tried through a tool or only claimed in prose — and that report stands
    // even when the model's answer was unusable. The read-only analysis stays.
    const answer: RenderedAnswer | null = !noActionTaken
      ? result.answer
      : result.answer === null
        ? { summary: refusal, facts: [], findings: [], gaps: [], source: 'fallback', citedRefIds: [] }
        : { ...result.answer, summary: refusal };
    const status = noActionTaken && result.status === 'failed' ? 'fallback' : result.status;
    const done: AgentTurnResult = {
      ...result,
      status,
      answer,
      scope,
      window: scopeWindow(scope),
      toolCalls,
      toolGaps: context.toolGaps(),
      toolNotes: context.toolNotes(),
      refusedActions,
      noActionTaken,
      citations: citationsFor(answer, context.build()),
      provenance: { ...context.provenance(), ruleVersions: [...context.provenance().ruleVersions, AGENT_PRIORITY_VERSION].sort() },
      usage,
      validation: validationLog.map((codes) => ({ issueCodes: codes })),
      failedChecks: toolCalls
        .filter((call) => call.status === 'error')
        .map((call) => ({ name: call.name, message: call.summary })),
      notes,
      model: deps.model.id,
    };
    onEvent({ type: 'done', result: done });
    return done;
  };

  const fallback = (reason: string): AgentTurnResult => {
    const built = context.build();
    // Nothing at all to show — no finding, no figure, no gap — is a failure.
    if (built.findings.size === 0 && built.figuresWithoutFindings.length === 0 && context.toolGaps().length === 0) {
      return finish({ status: 'failed', answer: null, issues, message: reason });
    }
    return finish({
      status: 'fallback',
      answer: fallbackAnswer(built, `${reason} The findings below are GrowthOS's own ranking of what the tools returned.`),
      issues,
      message: reason,
    });
  };

  onEvent({ type: 'started', scope, window: scopeWindow(scope), model: deps.model.id });

  const runCall = async (call: ToolCall, allowance: number): Promise<string> => {
    const parsed = parseArguments(call.arguments);
    if (call.name === SCOPE_TOOL_NAME) {
      const result = parsed.ok ? applyScopeUpdate(scope, parsed.value) : { status: 'invalid-input' as const, issues: [parsed.message] };
      if (result.status === 'ok') {
        scope = result.scope;
        onEvent({ type: 'scope', scope, window: scopeWindow(scope) });
      }
      const record: ToolCallRecord = {
        id: call.id,
        name: call.name,
        input: parsed.ok ? parsed.value : call.arguments,
        status: result.status,
        summary: result.status === 'ok' ? summarize(result) : `Invalid input: ${result.issues.join('; ')}`,
      };
      toolCalls.push(record);
      onEvent({ type: 'tool-end', record });
      return JSON.stringify(result);
    }

    const effective = parsed.ok ? applyScope(call.name, parsed.value, scope) : call.arguments;
    onEvent({ type: 'tool-start', id: call.id, name: call.name, input: effective });
    let outcome: RunToolOutcome;
    if (!parsed.ok) {
      outcome = { status: 'invalid-input', issues: [parsed.message] };
    } else {
      try {
        outcome = await withTimeout(
          runTool(call.name, effective, { traffic: deps.traffic, state: deps.state, now: deps.now }),
          limits.toolTimeoutMs,
          turn.signal,
        );
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'failed';
        outcome = { status: 'error', message: `${call.name} ${message}` };
        notes.push(`${call.name}: ${message}.`);
      }
    }
    context.add(outcome);
    const record: ToolCallRecord = {
      id: call.id,
      name: call.name,
      input: effective,
      status: outcome.status,
      summary: summarize(outcome),
    };
    toolCalls.push(record);
    onEvent({ type: 'tool-end', record });
    return forModel(outcome, allowance);
  };

  try {
    for (let step = 0; step < limits.maxModelSteps; step += 1) {
      if (turn.signal.aborted) return fallback('The analysis ran out of time before an answer was ready.');

      // The whole conversation is resent on every round trip, so the input is
      // bounded per turn: at the budget no new tools run and the model must
      // answer; well past it the turn stops.
      const inputChars = messageChars(messages);
      if (inputChars > limits.maxInputChars * 1.25) {
        notes.push(`The input to the model reached ${inputChars} characters, past the ${limits.maxInputChars}-character budget.`);
        return fallback('The analysis gathered more data than fits in one answer.');
      }
      if (inputChars > limits.maxInputChars && !budgetReached) {
        budgetReached = true;
        notes.push(`The input budget of ${limits.maxInputChars} characters was reached, so no further tools were run.`);
        messages.push({ role: 'user', content: 'The input budget for this question has been reached. Do not call more tools. Answer now with what you have, and list what you could not check as gaps.' });
      }

      let reply;
      try {
        reply = await withTimeout(
          deps.model.next({ messages, tools: TOOL_SPECS }, turn.signal),
          Math.max(1, limits.turnTimeoutMs),
          turn.signal,
        );
      } catch (cause) {
        const reason =
          cause instanceof Timeout
            ? 'The analysis ran out of time before an answer was ready.'
            : `The model could not be reached (${cause instanceof Error ? cause.message : 'unknown error'}).`;
        notes.push(reason);
        return fallback(reason);
      }

      if (reply.usage !== undefined) {
        usage = {
          promptTokens: (usage?.promptTokens ?? 0) + reply.usage.promptTokens,
          completionTokens: (usage?.completionTokens ?? 0) + reply.usage.completionTokens,
          requests: (usage?.requests ?? 0) + 1,
          largestPromptTokens: Math.max(usage?.largestPromptTokens ?? 0, reply.usage.promptTokens),
        };
      }

      if (reply.type === 'tool_calls') {
        messages.push({ role: 'assistant', content: null, toolCalls: reply.calls });
        for (const [index, call] of reply.calls.entries()) {
          // A cancelled or timed-out turn starts nothing new, even mid-batch.
          if (turn.signal.aborted) {
            const message = 'Not run: the request was cancelled or ran out of time.';
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify({ status: 'cancelled', message }) });
            toolCalls.push({ id: call.id, name: call.name, input: call.arguments, status: 'cancelled', summary: message });
            continue;
          }
          if (budgetReached) {
            const message = 'Not run: the input budget for this question has been reached.';
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify({ status: 'budget-reached', message }) });
            toolCalls.push({ id: call.id, name: call.name, input: call.arguments, status: 'budget-reached', summary: message });
            continue;
          }
          if (toolCallsUsed >= limits.maxToolCalls) {
            const refused = { status: 'limit-reached', message: `The limit of ${limits.maxToolCalls} tool calls per question has been reached.` };
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(refused) });
            toolCalls.push({ id: call.id, name: call.name, input: call.arguments, status: 'limit-reached', summary: refused.message });
            if (!limitAnnounced) notes.push(refused.message);
            limitAnnounced = true;
            continue;
          }
          toolCallsUsed += 1;
          // Each result's share of what is left of the turn budget, so a
          // parallel batch cannot carry the input far past it in one step.
          const callsLeft = reply.calls.length - index;
          const remaining = limits.maxInputChars - messageChars(messages);
          const allowance = Math.max(MIN_TOOL_RESULT_CHARS, Math.min(limits.maxToolResultChars, Math.floor(remaining / callsLeft)));
          const content = await runCall(call, allowance);
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
        }
        if (limitAnnounced) {
          messages.push({ role: 'user', content: 'No more tool calls are available for this question. Answer now with what you have, and list what you could not check as gaps.' });
        }
        continue;
      }

      onEvent({ type: 'answering' });
      messages.push({ role: 'assistant', content: reply.content, toolCalls: [] });

      let answer;
      try {
        answer = agentAnswerSchema.parse(parseAnswerJson(reply.content));
      } catch (cause) {
        issues = [{ finding: null, code: 'invalid-json', message: `The answer is not valid JSON in the required shape: ${cause instanceof Error ? cause.message.slice(0, 300) : 'unparseable'}` }];
        validationLog.push(['invalid-json']);
        if (repaired) return fallback('The model did not return a usable answer.');
        repaired = true;
        onEvent({ type: 'repairing', issues });
        messages.push({ role: 'user', content: repairRequest(issues) });
        continue;
      }

      const built = context.build();
      issues = validateAnswer(answer, built);
      validationLog.push([...new Set(issues.map((issue) => issue.code))]);
      if (issues.some((issue) => issue.code === 'action-claim')) actionClaimed = true;
      if (issues.length === 0) {
        return finish({ status: 'answered', answer: renderAnswer(answer, built, 'model'), issues: [], message: null });
      }
      if (repaired) return fallback("The model's answer did not pass validation after one correction.");
      repaired = true;
      onEvent({ type: 'repairing', issues });
      messages.push({ role: 'user', content: repairRequest(issues) });
    }

    notes.push(`The model did not finish within ${limits.maxModelSteps} steps.`);
    return fallback('The model did not finish its answer.');
  } finally {
    // Every exit — answer, fallback, failure or an unexpected throw — releases
    // the timer and the listener, so nothing outlives the turn.
    clearTimeout(turnTimer);
    deps.signal?.removeEventListener('abort', onOuterAbort);
  }
}
