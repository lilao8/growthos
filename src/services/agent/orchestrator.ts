import { z } from 'zod';
import {
  agentAnswerSchema,
  repairRequest,
  validateAnswer,
  type AnswerIssue,
} from '@/domain/agent/answer';
import { fallbackAnswer, renderAnswer, type RenderedAnswer } from '@/domain/agent/answer-render';
import { scopeWindow, type ConversationScope } from '@/domain/agent/scope';
import type { DateWindow } from '@/domain/demo-window';
import { AGENT_TOOLS, runTool, type RunToolOutcome } from '@/services/agent-tools/registry';
import type { ProvidedState } from '@/services/agent-tools/types';
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
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxToolCalls: 8,
  toolTimeoutMs: 5_000,
  turnTimeoutMs: 60_000,
  maxModelSteps: 12,
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
  /**
   * Actions the model tried that do not exist. Written by GrowthOS, not the
   * model, so an answer can never claim a change was made.
   */
  refusedActions: string[];
  /** Tool calls that failed, so a failure is never read as an empty result. */
  failedChecks: Array<{ name: string; message: string }>;
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

/** What the model sees of a tool outcome: the data and everything citable, not internals. */
function forModel(outcome: RunToolOutcome | { status: 'ok'; scope: ConversationScope }): string {
  if (outcome.status !== 'ok' && outcome.status !== 'empty') return JSON.stringify(outcome);
  if (!('meta' in outcome)) return JSON.stringify(outcome);
  return JSON.stringify({
    status: outcome.status,
    window: outcome.meta.window,
    previousWindow: outcome.meta.previousWindow,
    data: outcome.data,
    findings: outcome.findings.map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      title: finding.title,
      priority: finding.priority,
      strength: finding.strength,
      affectedSessions: finding.affectedSessions,
      observed: finding.observed,
      howToVerify: finding.howToVerify,
      refIds: finding.refIds,
    })),
    refs: outcome.meta.refs.map((ref) => ({
      refId: ref.refId,
      label: ref.label,
      value: ref.value,
      unit: ref.unit,
      channel: ref.channel,
      productId: ref.productId,
      window: ref.window,
    })),
    auditRefs: outcome.meta.auditRefs.map((ref) => ({
      refId: ref.refId,
      productId: ref.productId,
      ruleId: ref.ruleId,
      status: ref.status,
      severity: ref.severity,
      evidence: ref.evidence,
    })),
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
  let limitAnnounced = false;

  const messages: AgentMessage[] = [{ role: 'system', content: systemPrompt(scope) }];
  for (const prior of input.history) {
    messages.push({ role: 'user', content: prior.question });
    messages.push({ role: 'assistant', content: prior.answerSummary, toolCalls: [] });
  }
  messages.push({ role: 'user', content: input.question });

  const finish = (
    result: Omit<AgentTurnResult, 'scope' | 'window' | 'toolCalls' | 'toolGaps' | 'notes' | 'model' | 'refusedActions' | 'failedChecks'>,
  ): AgentTurnResult => {
    clearTimeout(turnTimer);
    deps.signal?.removeEventListener('abort', onOuterAbort);
    const done: AgentTurnResult = {
      ...result,
      scope,
      window: scopeWindow(scope),
      toolCalls,
      toolGaps: context.toolGaps(),
      refusedActions: [...new Set(toolCalls.filter((call) => call.status === 'unknown-tool').map((call) => call.name))],
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
    if (built.findings.size === 0 && context.toolGaps().length === 0) {
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

  const runCall = async (call: ToolCall): Promise<string> => {
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
    return forModel(outcome);
  };

  for (let step = 0; step < limits.maxModelSteps; step += 1) {
    if (turn.signal.aborted) return fallback('The analysis ran out of time before an answer was ready.');

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

    if (reply.type === 'tool_calls') {
      messages.push({ role: 'assistant', content: null, toolCalls: reply.calls });
      for (const call of reply.calls) {
        // A cancelled or timed-out turn starts nothing new, even mid-batch.
        if (turn.signal.aborted) {
          const message = 'Not run: the request was cancelled or ran out of time.';
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify({ status: 'cancelled', message }) });
          toolCalls.push({ id: call.id, name: call.name, input: call.arguments, status: 'cancelled', summary: message });
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
        const content = await runCall(call);
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
      if (repaired) return fallback('The model did not return a usable answer.');
      repaired = true;
      onEvent({ type: 'repairing', issues });
      messages.push({ role: 'user', content: repairRequest(issues) });
      continue;
    }

    const built = context.build();
    issues = validateAnswer(answer, built);
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
}
