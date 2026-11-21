import { CHANNELS } from '@/domain/types';
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
  priority: string;
  strength: string;
  affectedSessions: number | null;
  howToVerify: string;
  refIds: string[];
}

function findingsIn(results: readonly ToolResult[]): SeenFinding[] {
  return results.flatMap((result) => {
    const list = result.body['findings'];
    return Array.isArray(list) ? (list as SeenFinding[]) : [];
  });
}

// ---------------------------------------------------------------------------
// The demo script
// ---------------------------------------------------------------------------

let callCounter = 0;
function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  callCounter += 1;
  return { id: `call_${callCounter}`, name, arguments: JSON.stringify(args) };
}

const WRITE_REQUEST = /标记|删除|修改|暂停|发送|关闭|\b(mark|delete|pause|change|update|send|close|apply)\b/i;
const ORGANIC = /自然搜索|organic/i;
const CJK = /[一-鿿]/;

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

function channelOf(title: string): string | null {
  return CHANNELS.find((channel) => title.startsWith(`${channel}:`)) ?? null;
}

function finalAnswer(question: string, results: readonly ToolResult[], scopeNote: string): ModelTurn {
  const chinese = CJK.test(question);
  const picked = [...findingsIn(results)]
    .sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        (b.affectedSessions ?? -1) - (a.affectedSessions ?? -1),
    )
    .slice(0, 5);

  const findings = picked.map((finding) => {
    const cited = finding.refIds.slice(0, 3).map((id) => (id.startsWith('audits:') ? `{{audit:${id}}}` : `{{ref:${id}}}`));
    return {
      basedOn: finding.id,
      title: finding.title,
      observed: `${chinese ? '关键数字：' : 'Key figures: '}${cited.join(' · ')}`,
      whyPriority: chinese
        ? `规则严重度为 ${finding.priority}，证据充分度为 ${finding.strength}。`
        : `Rule severity ${finding.priority}; evidence ${finding.strength}.`,
      howToVerify: finding.howToVerify,
      scope: { channel: channelOf(finding.title), productId: null },
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

  return { type: 'final', content: JSON.stringify({ summary, findings, gaps: [] }) };
}

function readOnlyAnswer(question: string): ModelTurn {
  const chinese = CJK.test(question);
  return {
    type: 'final',
    content: JSON.stringify({
      summary: chinese
        ? '我只能读取和分析数据，没有任何可以修改、标记或发送的工具，所以没有执行这个操作。要不要采取行动由你决定；需要的话我可以先分析相关数据。'
        : 'I can only read and analyse data. There is no tool that changes, marks or sends anything, so nothing was done. Whether to act is your call; I can analyse the relevant data first if that helps.',
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
    const channel = weak === undefined ? null : channelOf(weak.title);
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
