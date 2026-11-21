import { rankFindings, type EvidenceStrength } from '@/domain/agent/priority';
import type { Priority } from '@/domain/types';
import type { AgentMessage, ModelClient, ModelTurn, ToolCall, ToolSpec } from './model';
import { SCOPE_TOOL_NAME } from './scope-tool';

/**
 * A controllable stand-in for a language model.
 *
 * `createScriptedModel` wraps any step function — tests use it to make a model
 * that hallucinates a figure, loops on tool calls, stalls or throws.
 * `createDemoModel` is the script the local demo and the E2E suite run: it
 * reads the tool results it gets back and decides what to query next, then
 * writes an answer from them. It is a test double, never presented as a model:
 * its id says "scripted", and the UI shows it.
 */

export type ScriptStep = (
  messages: readonly AgentMessage[],
  tools: readonly ToolSpec[],
) => ModelTurn | Promise<ModelTurn>;

export function createScriptedModel(id: string, step: ScriptStep): ModelClient {
  return {
    id: `scripted:${id}`,
    async next(request, signal) {
      if (signal.aborted) throw new Error('aborted');
      return step(request.messages, request.tools);
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the conversation
// ---------------------------------------------------------------------------

/** Instructions GrowthOS itself adds as user messages; not the visitor's question. */
function isSystemNudge(content: string): boolean {
  return content.startsWith('Your answer did not pass validation') || content.startsWith('No more tool calls');
}

export function currentQuestion(messages: readonly AgentMessage[]): { text: string; index: number } {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user' && !isSystemNudge(message.content)) return { text: message.content, index };
  }
  return { text: '', index: -1 };
}

interface ToolResult {
  name: string;
  body: Record<string, unknown>;
}

export function resultsSince(messages: readonly AgentMessage[], index: number): ToolResult[] {
  const results: ToolResult[] = [];
  for (const message of messages.slice(index + 1)) {
    if (message.role !== 'tool') continue;
    try {
      results.push({ name: message.name, body: JSON.parse(message.content) as Record<string, unknown> });
    } catch {
      results.push({ name: message.name, body: {} });
    }
  }
  return results;
}

interface SeenFinding {
  id: string;
  ruleId: string;
  title: string;
  priority: Priority;
  strength: EvidenceStrength;
  affectedSessions: number | null;
  howToVerify: string;
  refIds: string[];
}

interface SeenRef {
  refId: string;
  channel: string | null;
  productId: string | null;
}

function listIn<T>(results: readonly ToolResult[], key: string): T[] {
  return results.flatMap((result) => {
    const list = result.body[key];
    return Array.isArray(list) ? (list as T[]) : [];
  });
}

function findingsIn(results: readonly ToolResult[]): SeenFinding[] {
  return listIn<SeenFinding>(results, 'findings');
}

// ---------------------------------------------------------------------------
// The demo script
// ---------------------------------------------------------------------------

let callCounter = 0;
function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  callCounter += 1;
  return { id: `call_${callCounter}`, name, arguments: JSON.stringify(args) };
}

// Imperative action verbs only: "How did conversion change?" is a question, not a request to change anything.
const WRITE_REQUEST = /标记|删除|修改|暂停|发送|关闭|\b(mark|delete|pause|send|apply)\b/i;
const PRODUCT_LOOKUP = /购买会话|purchasing sessions|how many purchases/i;
const PRODUCT_NAME = /[A-Z][a-z]{3,}/;
const ORGANIC = /自然搜索|organic/i;
const CJK = /[一-鿿]/;

function finalAnswer(question: string, results: readonly ToolResult[], scopeNote: string): ModelTurn {
  const chinese = CJK.test(question);
  const refs = new Map([...listIn<SeenRef>(results, 'refs'), ...listIn<SeenRef>(results, 'auditRefs')].map((ref) => [ref.refId, ref]));
  // The same ranking GrowthOS applies, so the top five are the right five.
  const picked = rankFindings(findingsIn(results)).ranked.slice(0, 5).map((entry) => entry.finding);

  const findings = picked.map((finding) => {
    const cited = finding.refIds.slice(0, 3).filter((id) => id.startsWith('audits:') || refs.has(id));
    return {
      basedOn: finding.id,
      facts: cited.map((id) => (id.startsWith('audits:') ? { kind: 'audit', refId: id } : { kind: 'value', refId: id })),
      whyPriority: chinese
        ? `规则严重度为 ${finding.priority}，证据充分度为 ${finding.strength}。`
        : `Rule severity ${finding.priority}; evidence ${finding.strength}.`,
      howToVerify: chinese
        ? '按下方的规则原文逐项核对，并在证据链接打开的页面上确认同一日期范围的数字。'
        : 'Work through the rule guidance below, and confirm the figures for the same dates on the pages the evidence links open.',
    };
  });

  const summary =
    findings.length === 0
      ? chinese
        ? `在${scopeNote}内，工具没有返回足以支持结论的发现。下方列出了缺少的数据和核对方法。`
        : `Within ${scopeNote}, the tools returned nothing strong enough to be a finding. The data gaps below say what is missing and how to check it.`
      : chinese
        ? `以下是${scopeNote}内建议优先排查的问题，排序由 GrowthOS 按规则严重度、证据充分度和受影响会话决定。每个数字都链接到可以核对的页面。`
        : `These are the issues worth checking first within ${scopeNote}, ordered by GrowthOS on rule severity, evidence and sessions affected. Every figure links to the page that shows it.`;

  return { type: 'final', content: JSON.stringify({ summary, facts: [], findings, gaps: [] }) };
}

/** A lookup: the figures are the answer, and no rule needs to have fired. */
function lookupAnswer(question: string, results: readonly ToolResult[]): ModelTurn {
  const chinese = CJK.test(question);
  const facts = listIn<SeenRef>(results, 'refs')
    .filter((ref) => ref.refId.endsWith(':purchase_sessions'))
    .map((ref) => ({ kind: 'value', refId: ref.refId }));
  const summary =
    facts.length === 0
      ? chinese
        ? '没有找到匹配的商品，下方说明了原因。'
        : 'No matching product was found; the note below says why.'
      : chinese
        ? '下面是工具查到的购买会话数，按商品分别列出。这只是查数，没有触发任何告警规则。'
        : 'These are the purchasing sessions the tool found, product by product. This is a lookup; no alert rule was involved.';
  return { type: 'final', content: JSON.stringify({ summary, facts, findings: [], gaps: [] }) };
}

function readOnlyAnswer(question: string): ModelTurn {
  const chinese = CJK.test(question);
  return {
    type: 'final',
    content: JSON.stringify({
      summary: chinese
        ? '我只能读取和分析数据，没有任何可以修改、标记或发送的工具，所以没有执行这个操作。要不要采取行动由你决定；需要的话我可以先分析相关数据。'
        : 'I can only read and analyse data. There is no tool that changes, marks or sends anything, so nothing was done. Whether to act is your call; I can analyse the relevant data first if that helps.',
      facts: [],
      findings: [],
      gaps: [],
    }),
  };
}

const demoStep: ScriptStep = (messages) => {
  const question = currentQuestion(messages);
  const results = resultsSince(messages, question.index);
  const called = new Set(results.map((result) => result.name));

  if (WRITE_REQUEST.test(question.text)) {
    // Tries the action a careless agent would, and is refused: the registry
    // has no such tool.
    if (!called.has('mark_recommendation_done')) return { type: 'tool_calls', calls: [call('mark_recommendation_done', { id: 'first' })] };
    return readOnlyAnswer(question.text);
  }

  if (PRODUCT_LOOKUP.test(question.text)) {
    if (!called.has('get_product_performance')) {
      const name = PRODUCT_NAME.exec(question.text)?.[0] ?? null;
      const args: Record<string, unknown> = { query: name };
      // A condition stated in the question itself narrows this call only;
      // it is not a change to the conversation's scope.
      if (ORGANIC.test(question.text)) args['channel'] = 'Organic Search';
      return { type: 'tool_calls', calls: [call('get_product_performance', args)] };
    }
    return lookupAnswer(question.text, results);
  }

  if (ORGANIC.test(question.text)) {
    if (!called.has(SCOPE_TOOL_NAME)) {
      return {
        type: 'tool_calls',
        calls: [call(SCOPE_TOOL_NAME, { channel: 'Organic Search' }), call('get_channel_performance'), call('get_funnel')],
      };
    }
    return finalAnswer(question.text, results, CJK.test(question.text) ? '自然搜索渠道、同一日期范围' : 'Organic Search over the same dates');
  }

  if (!called.has('get_channel_performance')) return { type: 'tool_calls', calls: [call('get_channel_performance')] };
  if (!called.has('get_funnel')) {
    // Decides from what came back: a channel that converts badly gets its own funnel.
    const weak = findingsIn(results).find((finding) => finding.ruleId === 'high-traffic-low-conversion');
    const refs = listIn<SeenRef>(results, 'refs');
    const channel = weak === undefined ? null : (refs.find((ref) => ref.refId === weak.refIds[0])?.channel ?? null);
    const calls = [call('get_funnel')];
    if (channel !== null) calls.push(call('get_funnel', { channel }));
    return { type: 'tool_calls', calls };
  }
  if (!called.has('get_audit_findings')) return { type: 'tool_calls', calls: [call('get_audit_findings', { minSeverity: 'high' })] };
  return finalAnswer(question.text, results, CJK.test(question.text) ? '当前分析范围' : 'the current scope');
};

export function createDemoModel(): ModelClient {
  return createScriptedModel('demo', demoStep);
}
