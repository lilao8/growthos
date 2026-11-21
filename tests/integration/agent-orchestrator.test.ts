// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runAgentTurn, type AgentDeps, type AgentEvent, type AgentTurnResult } from '@/services/agent/orchestrator';
import { createDemoModel, createScriptedModel, currentQuestion, resultsSince } from '@/services/agent/scripted-model';
import type { AgentMessage, ModelTurn } from '@/services/agent/model';
import {
  createDelayedTrafficRepository,
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
  type TrafficRepository,
} from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { DEFAULT_SCOPE, type ConversationScope } from '@/domain/agent/scope';
import { rankFindings } from '@/domain/agent/priority';

/**
 * The agent loop with controllable models: tool use, scope across turns,
 * answer validation, gaps, failures and limits, on the real fixture.
 */

const MAIN = '过去 30 天，独立站最该优先排查什么？';
const ORGANIC = '只看自然搜索呢？';
const NOW = '2026-09-01T00:00:00.000Z';

function deps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    model: createDemoModel(),
    traffic: createFixtureTrafficRepository(),
    state: { source: 'browser-local', value: buildDemoSeedState() },
    now: () => NOW,
    ...overrides,
  };
}

async function ask(question: string, scope: ConversationScope = DEFAULT_SCOPE, overrides: Partial<AgentDeps> = {}, history: { question: string; answerSummary: string }[] = []) {
  const events: AgentEvent[] = [];
  const result = await runAgentTurn({ question, history, scope }, deps(overrides), (event) => events.push(event));
  return { result, events };
}

function answered(result: AgentTurnResult) {
  if (result.answer === null) throw new Error(`no answer: ${result.status} ${result.message}`);
  return result.answer;
}

/** A sparse but real slice of the fixture: only the last three days of sessions. */
function sparseTraffic(): TrafficRepository {
  const inner = createFixtureTrafficRepository();
  return {
    async load() {
      const data = await inner.load();
      const sessions = data.sessions.filter((session) => session.date >= '2026-08-29');
      const ids = new Set(sessions.map((session) => session.orderId).filter((id): id is string => id !== null));
      const orders = data.orders.filter((order) => ids.has(order.id));
      return { ...data, sessions, orders, orderItems: data.orderItems.filter((item) => ids.has(item.orderId)) };
    },
  };
}

/** A model that queries once, then answers with whatever `answer` builds from the turn. */
function oneQueryModel(answer: (messages: readonly AgentMessage[]) => object, calls = [{ id: 'c1', name: 'get_channel_performance', arguments: '{}' }]) {
  return createScriptedModel('test', (messages): ModelTurn => {
    const question = currentQuestion(messages);
    if (resultsSince(messages, question.index).length === 0) return { type: 'tool_calls', calls };
    return { type: 'final', content: JSON.stringify(answer(messages)) };
  });
}

/** Findings from traffic (channels, funnel), as opposed to page-content audits. */
function trafficFindings(answer: ReturnType<typeof answered>) {
  return answer.findings.filter((finding) => !/^\/(seo|geo)\//.test(finding.evidence[0]?.href ?? ''));
}

interface SeenFinding {
  id: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  strength: 'sufficient' | 'limited' | 'insufficient';
  affectedSessions: number | null;
  refIds: string[];
}

/** The tool finding GrowthOS ranks first among all results so far — the one an answer must include. */
function topFinding(messages: readonly AgentMessage[]): { id: string; refIds: string[] } {
  const all = messages
    .filter((message) => message.role === 'tool')
    .flatMap((message) => {
      try {
        const body = JSON.parse((message as { content: string }).content) as { findings?: SeenFinding[] };
        return body.findings ?? [];
      } catch {
        return [];
      }
    });
  const top = rankFindings(all).ranked[0]?.finding;
  if (top === undefined) throw new Error('no finding');
  return top;
}

function firstFinding(messages: readonly AgentMessage[]): { id: string; refIds: string[] } {
  const tool = messages.find((message) => message.role === 'tool');
  if (tool?.role !== 'tool') throw new Error('no tool result');
  const body = JSON.parse(tool.content) as { findings: { id: string; refIds: string[] }[] };
  const finding = body.findings[0];
  if (finding === undefined) throw new Error('no finding');
  return finding;
}

describe('the main question', () => {
  it('queries, decides what to check next from the results, and answers within the rules', async () => {
    const { result, events } = await ask(MAIN);
    expect(result.status).toBe('answered');
    expect(result.issues).toEqual([]);
    const names = result.toolCalls.map((call) => call.name);
    expect(names[0]).toBe('get_channel_performance');
    // The channel results showed a channel converting badly, so its own funnel was queried.
    expect(result.toolCalls.some((call) => call.name === 'get_funnel' && (call.input as { channel: string | null }).channel === 'Meta')).toBe(true);
    expect(names).toContain('get_audit_findings');
    expect(events.filter((event) => event.type === 'tool-start').length).toBe(result.toolCalls.length);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('orders findings by the agent ranking and links every figure to its source', async () => {
    const answer = answered((await ask(MAIN)).result);
    expect(answer.findings.length).toBeGreaterThan(0);
    const ranked = rankFindings(
      answer.findings.map((finding) => ({ id: finding.basedOn, priority: finding.priority, strength: finding.strength, affectedSessions: finding.affectedSessions })),
    );
    expect(answer.findings.map((finding) => finding.basedOn)).toEqual(ranked.ranked.map((entry) => entry.finding.id));
    const figures = answer.findings.flatMap((finding) => finding.facts.flat()).filter((segment) => segment.kind === 'link');
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) expect(figure.kind === 'link' && figure.href).toMatch(/^\/(analytics|funnel|products|seo|geo)/);
    // Every finding has at least one written-out fact, and no raw placeholder survives anywhere.
    for (const finding of answer.findings) expect(finding.facts.every((fact) => fact.length > 0)).toBe(true);
    expect(JSON.stringify(answer)).not.toContain('{{');
    for (const finding of answer.findings) expect(finding.evidence.length).toBeGreaterThan(0);
  });

  it('shows a limited finding with its sample size and its downgrade', async () => {
    // The channel tool's findings are on Meta, which has few orders.
    const model = oneQueryModel((messages) => {
      const finding = firstFinding(messages);
      return {
        summary: 'One thing to check.',
        facts: [],
        findings: [{ basedOn: finding.id, facts: [{ kind: 'value', refId: finding.refIds[0] ?? '' }], whyPriority: 'Paid traffic that is not converting.', howToVerify: 'Compare pages.' }],
        gaps: [],
      };
    });
    const answer = answered((await ask(MAIN, DEFAULT_SCOPE, { model })).result);
    expect(answer.findings[0]).toMatchObject({ strength: 'limited', downgraded: true });
    expect(answer.findings[0]?.affectedSessions).toBeGreaterThan(0);
  });
});

describe('scope across turns', () => {
  it('keeps the dates and changes the channel on "only organic search?", then queries again', async () => {
    const first = (await ask(MAIN)).result;
    const history = [{ question: MAIN, answerSummary: 'summary' }];
    const { result } = await ask(ORGANIC, first.scope, {}, history);
    expect(result.scope).toEqual({ range: 30, channel: 'Organic Search', products: [] });
    expect(result.window).toEqual({ start: '2026-08-02', end: '2026-08-31', days: 30 });
    const data = result.toolCalls.filter((call) => call.name !== 'set_analysis_scope');
    expect(data.length).toBeGreaterThan(0);
    for (const call of data) expect(call.input).toMatchObject({ range: 30, channel: 'Organic Search' });
    const answer = answered(result);
    expect(answer.findings.length).toBeGreaterThan(0);
    for (const finding of answer.findings) {
      expect(finding.title.startsWith('Organic Search')).toBe(true);
      expect(finding.scope.channel).toBe('Organic Search');
      // The figures are written out and linked to the Organic Search funnel for the same dates.
      const links = finding.facts.flat().filter((segment) => segment.kind === 'link');
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link.kind === 'link' && link.href).toBe('/funnel?range=30&channel=Organic+Search');
      expect(finding.facts.flat().map((segment) => segment.text).join('')).toContain('2026-08-02 — 2026-08-31');
    }
    expect(JSON.stringify(answer)).not.toContain('{{');
  });

  it('keeps a 7-day range on a channel follow-up', async () => {
    const { result } = await ask(ORGANIC, { range: 7, channel: null, products: [] });
    expect(result.scope).toEqual({ range: 7, channel: 'Organic Search', products: [] });
    for (const call of result.toolCalls.filter((c) => c.name !== 'set_analysis_scope')) expect(call.input).toMatchObject({ range: 7 });
  });

  it('starts a new conversation from the default scope', async () => {
    const { result } = await ask(MAIN, DEFAULT_SCOPE);
    expect(result.toolCalls[0]?.input).toEqual({ range: 30, channel: null });
  });

  it('rejects an invalid scope change and keeps the scope', async () => {
    const model = createScriptedModel('bad-scope', (messages) => {
      const question = currentQuestion(messages);
      if (resultsSince(messages, question.index).length === 0) {
        return { type: 'tool_calls', calls: [{ id: 's', name: 'set_analysis_scope', arguments: '{"range":14}' }] };
      }
      return { type: 'final', content: JSON.stringify({ summary: 'Nothing changed.', facts: [], findings: [], gaps: [] }) };
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.toolCalls[0]?.status).toBe('invalid-input');
    expect(result.scope).toEqual(DEFAULT_SCOPE);
  });
});

describe('enough data and not enough data', () => {
  it('gives findings on the full data and reports gaps on a sparse slice, for the same question', async () => {
    const full = (await ask(MAIN)).result;
    const sparse = (await ask(MAIN, DEFAULT_SCOPE, { traffic: sparseTraffic() })).result;
    const titles = (result: AgentTurnResult) => trafficFindings(answered(result)).map((finding) => finding.title);
    expect(sparse.status).toBe('answered');
    // The full data supports a checkout finding; on the sparse slice that step
    // falls below its sample minimum and becomes a gap with its raw figures…
    expect(titles(full)).toContain('Checkout → Purchase: investigate the drop-off');
    expect(titles(sparse)).not.toContain('Checkout → Purchase: investigate the drop-off');
    const checkoutGap = sparse.toolGaps.find((gap) => gap.message.startsWith('Checkout → Purchase: only'));
    expect(checkoutGap?.links.length).toBeGreaterThan(0);
    expect(sparse.toolGaps.filter((gap) => gap.message.includes('below the 300')).length).toBe(8);
    // …while a step that still clears its minimum is kept as a confirmed finding.
    expect(titles(sparse)).toEqual(['Product View → Add to Cart: investigate the drop-off']);
    expect(titles(sparse).length).toBeLessThan(titles(full).length);
  });

  it('answers a zero-sample question with gaps and no findings', async () => {
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { traffic: createEmptyTrafficRepository() });
    // Nothing is concluded from traffic that does not exist…
    expect(trafficFindings(answered(result))).toEqual([]);
    expect(result.toolGaps.some((gap) => gap.message.includes('no sessions'))).toBe(true);
    // …while page-content audit findings still stand, with no sessions behind them.
    for (const finding of answered(result).findings) expect(finding.affectedSessions).toBe(0);
  });

  it('reports a product that does not exist', async () => {
    const model = oneQueryModel(() => ({ summary: 'No such product.', facts: [], findings: [], gaps: [] }), [
      { id: 'p', name: 'get_product_performance', arguments: '{"products":["NT-999"]}' },
    ]);
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.toolCalls[0]?.status).toBe('empty');
    expect(result.toolGaps.some((gap) => gap.message.includes('NT-999'))).toBe(true);
  });
});

describe('failures', () => {
  it('reports tool failures as failures, not as an empty result', async () => {
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { traffic: createFailingTrafficRepository('source down') });
    expect(result.toolCalls.every((call) => call.status === 'error')).toBe(true);
    expect(result.status).toBe('answered');
    expect(answered(result).findings).toEqual([]);
    expect(result.failedChecks.map((check) => check.name)).toEqual(result.toolCalls.map((call) => call.name));
    expect(result.failedChecks[0]?.message).toContain('source down');
    expect(result.toolGaps).toEqual([]);
  });

  it('cannot write: a write request finds no tool, and the visitor state is untouched', async () => {
    const value = buildDemoSeedState();
    const before = structuredClone(value);
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { state: { source: 'browser-local', value } });
    expect(result.toolCalls.map((call) => call.status)).toEqual(['unknown-tool']);
    expect(answered(result).findings).toEqual([]);
    // GrowthOS, not the model, records that nothing was done.
    expect(result.refusedActions).toEqual(['mark_recommendation_done']);
    expect(value).toEqual(before);
  });

  it('returns a failure, not an invented answer, when the model cannot be reached', async () => {
    const model = createScriptedModel('down', () => {
      throw new Error('connection refused');
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.status).toBe('failed');
    expect(result.answer).toBeNull();
    expect(result.message).toContain('connection refused');
  });
});

describe('answer validation', () => {
  it('asks once for a correction and accepts the corrected answer', async () => {
    let attempts = 0;
    const model = oneQueryModel((messages) => {
      attempts += 1;
      const finding = topFinding(messages);
      const whyPriority = attempts === 1 ? 'Conversion is 0.54%.' : 'Paid traffic that is not converting.';
      return { summary: 'Check this.', facts: [], findings: [{ basedOn: finding.id, facts: [{ kind: 'value', refId: finding.refIds[0] ?? '' }], whyPriority, howToVerify: 'Compare pages.' }], gaps: [] };
    });
    const { result, events } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(attempts).toBe(2);
    expect(events.some((event) => event.type === 'repairing')).toBe(true);
    expect(result.status).toBe('answered');
  });

  it('falls back to GrowthOS ranking when the answer still fails after one correction', async () => {
    const model = oneQueryModel((messages) => ({
      summary: 'Meta conversion fell sharply.',
      facts: [],
      findings: [{ basedOn: firstFinding(messages).id, facts: [{ kind: 'value', refId: 'channels:invented' }], whyPriority: 'x', howToVerify: 'y' }],
      gaps: [],
    }));
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.status).toBe('fallback');
    expect(result.answer?.source).toBe('fallback');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['unknown-ref', 'change-in-prose']));
    expect(result.answer?.findings.length).toBeGreaterThan(0);
  });

  it('falls back when the model never returns valid JSON', async () => {
    const model = oneQueryModel(() => ({}));
    const broken = createScriptedModel('prose', async (messages, tools) => {
      const turn = await model.next({ messages, tools }, new AbortController().signal);
      return turn.type === 'final' ? { type: 'final', content: 'Here is my analysis in prose.' } : turn;
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model: broken });
    expect(result.status).toBe('fallback');
    expect(result.issues[0]?.code).toBe('invalid-json');
  });
});

describe('a lookup with figures but no alert', () => {
  const LOOKUP = '过去 30 天 Ridgeline 从自然搜索获得多少购买会话？';

  it('answers with the figures themselves, without needing a finding, and leaves the scope alone', async () => {
    const { result } = await ask(LOOKUP);
    expect(result.status).toBe('answered');
    const call = result.toolCalls[0];
    expect(call?.name).toBe('get_product_performance');
    expect(call?.input).toMatchObject({ query: 'Ridgeline', channel: 'Organic Search', range: 30 });
    // A condition in the question narrows the call, not the conversation.
    expect(result.scope).toEqual(DEFAULT_SCOPE);
    const answer = answered(result);
    expect(answer.findings).toEqual([]);
    const lines = answer.facts.map((fact) => fact.map((segment) => segment.text).join(''));
    expect(lines.length).toBeGreaterThan(0);
    const tent = lines.find((line) => line.startsWith('Ridgeline 2P Backpacking Tent purchasing sessions'));
    expect(tent).toBe('Ridgeline 2P Backpacking Tent purchasing sessions (Organic Search), 2026-08-02 — 2026-08-31: 3');
  });

  it('keeps those figures when the model fails and GrowthOS falls back', async () => {
    const model = oneQueryModel(() => ({ summary: 'There were 3.', facts: [], findings: [], gaps: [] }), [
      { id: 'p', name: 'get_product_performance', arguments: '{"query":"Ridgeline","channel":"Organic Search"}' },
    ]);
    const { result } = await ask(LOOKUP, DEFAULT_SCOPE, { model });
    expect(result.status).toBe('fallback');
    const lines = answered(result).facts.map((fact) => fact.map((segment) => segment.text).join(''));
    expect(lines).toContain('Ridgeline 2P Backpacking Tent purchasing sessions (Organic Search), 2026-08-02 — 2026-08-31: 3');
  });
});

describe('the review question keeps its ranked actions', () => {
  it('does not accept an answer that reduces a review with findings to one figure', async () => {
    const model = oneQueryModel((messages) => ({
      summary: 'One figure covers it.',
      facts: [{ kind: 'value', refId: firstFinding(messages).refIds[0] ?? '' }],
      findings: [],
      gaps: [],
    }));
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.issues.map((issue) => issue.code)).toContain('findings-omitted');
    expect(result.status).toBe('fallback');
    const answer = answered(result);
    expect(answer.findings.length).toBeGreaterThan(0);
    expect(answer.findings.map((finding) => finding.rank)).toEqual(answer.findings.map((_, index) => index + 1));
  });
});

describe('cards stay inside their own scope', () => {
  it("does not accept a 2P finding illustrated with the 3P audit, and the fallback card keeps the 2P scope", async () => {
    let attempts = 0;
    const model = createScriptedModel('mixed', (messages) => {
      const question = currentQuestion(messages);
      const results = resultsSince(messages, question.index);
      if (results.length === 0) {
        return { type: 'tool_calls', calls: [{ id: 'a', name: 'get_audit_findings', arguments: '{"kind":"seo","products":["NT-TENT-RDG2","NT-TENT-RDG3"]}' }] };
      }
      attempts += 1;
      const body = results[0]?.body as { findings: { id: string; title: string }[]; auditRefs: { refId: string; ruleId: string }[] };
      const twoP = body.findings.find((finding) => finding.title.includes('Ridgeline 2P'));
      const threeP = body.auditRefs.find((ref) => ref.refId.includes('snap_ridgeline_3p'));
      return {
        type: 'final',
        content: JSON.stringify({
          summary: 'Check the tent page.',
          facts: [],
          findings: [{ basedOn: twoP?.id, facts: [{ kind: 'audit', refId: threeP?.refId }], whyPriority: 'Its heading is weak.', howToVerify: 'Open the page.' }],
          gaps: [],
        }),
      };
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(attempts).toBe(2);
    expect(result.status).toBe('fallback');
    expect(result.issues.map((issue) => issue.code)).toContain('scope-mismatch');
    for (const finding of answered(result).findings) {
      expect(finding.scope.productId).not.toBeNull();
      const audits = finding.evidence.filter((link) => link.href.startsWith('/seo/'));
      expect(new Set(audits.map((link) => link.href)).size).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the Organic Search scope on fallback cards', async () => {
    const model = createScriptedModel('organic-broken', (messages) => {
      const question = currentQuestion(messages);
      if (resultsSince(messages, question.index).length === 0) {
        return { type: 'tool_calls', calls: [{ id: 'f', name: 'get_funnel', arguments: '{"channel":"Organic Search"}' }] };
      }
      return { type: 'final', content: 'not json' };
    });
    const { result } = await ask(ORGANIC, DEFAULT_SCOPE, { model });
    expect(result.status).toBe('fallback');
    const findings = answered(result).findings;
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) expect(finding.scope).toEqual({ channel: 'Organic Search', productId: null });
  });
});

describe('refused actions', () => {
  function claimingModel(summaries: string[]) {
    let turn = 0;
    return createScriptedModel('claims', (messages) => {
      const question = currentQuestion(messages);
      if (resultsSince(messages, question.index).length === 0) {
        return { type: 'tool_calls', calls: [{ id: 'm', name: 'mark_recommendation_done', arguments: '{"id":"first"}' }] };
      }
      const summary = summaries[Math.min(turn, summaries.length - 1)] ?? '';
      turn += 1;
      return { type: 'final', content: JSON.stringify({ summary, facts: [], findings: [], gaps: [] }) };
    });
  }

  it('never shows a model claim that the action succeeded', async () => {
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { model: claimingModel(['已把这条建议标为完成。']) });
    expect(result.refusedActions).toEqual(['mark_recommendation_done']);
    expect(result.issues.map((issue) => issue.code)).toContain('action-claim');
    const summary = (result.answer?.summary ?? []).map((segment) => segment.text).join('');
    expect(summary).not.toContain('已把');
    expect(summary).toContain('No action was taken');
  });

  it('writes the summary itself even when the model phrases it correctly', async () => {
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { model: claimingModel(['这里只能分析数据。']) });
    expect(result.status).toBe('answered');
    expect((result.answer?.summary ?? []).map((segment) => segment.text).join('')).toContain('No action was taken: mark_recommendation_done does not exist');
  });

  it('shows "not executed" when the model claims success without trying any tool', async () => {
    const model = createScriptedModel('claims-directly', () => ({
      type: 'final',
      content: JSON.stringify({ summary: '已把这条建议标记为完成。', facts: [], findings: [], gaps: [] }),
    }));
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { model });
    expect(result.toolCalls).toEqual([]);
    expect(result.refusedActions).toEqual([]);
    expect(result.noActionTaken).toBe(true);
    const summary = (result.answer?.summary ?? []).map((segment) => segment.text).join('');
    expect(summary).toContain('No action was taken: this agent has no tool that changes anything');
    expect(summary).not.toContain('已把');
  });

  it('shows "not executed" when a tool was refused and the model still claims success', async () => {
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { model: claimingModel(['已把这条建议标为完成。']) });
    expect(result.noActionTaken).toBe(true);
    expect((result.answer?.summary ?? []).map((segment) => segment.text).join('')).toContain('No action was taken: mark_recommendation_done does not exist');
  });

  it('shows "not executed" when asked to act, even if the model neither tries nor claims anything', async () => {
    const model = createScriptedModel('declines', () => ({
      type: 'final',
      content: JSON.stringify({ summary: '我只能分析，无法将建议标记为完成。', facts: [], findings: [], gaps: [] }),
    }));
    const { result } = await ask('把第一条建议标记为完成', DEFAULT_SCOPE, { model });
    expect(result.toolCalls).toEqual([]);
    expect(result.noActionTaken).toBe(true);
    expect((result.answer?.summary ?? []).map((segment) => segment.text).join('')).toContain('No action was taken');
  });

  it('does not treat a question about change as a request to change something', async () => {
    const { result } = await ask('How did conversion change over the last 30 days?');
    expect(result.refusedActions).toEqual([]);
    expect(result.noActionTaken).toBe(false);
    expect(result.toolCalls[0]?.name).toBe('get_channel_performance');
  });
});

describe('cleanup', () => {
  it('leaves no timer behind after a turn, however it ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await ask(MAIN);
      expect(vi.getTimerCount()).toBe(0);
      const failing = createScriptedModel('throws', () => {
        throw new Error('down');
      });
      await ask(MAIN, DEFAULT_SCOPE, { model: failing });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cancellation', () => {
  it('never calls the model for a request that is already cancelled', async () => {
    let calls = 0;
    const model = createScriptedModel('counted', () => {
      calls += 1;
      return { type: 'final', content: '{}' };
    });
    const controller = new AbortController();
    controller.abort();
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model, signal: controller.signal });
    expect(calls).toBe(0);
    expect(result.status).toBe('failed');
  });

  it('starts no further tool call in a batch once the turn is cancelled', async () => {
    const controller = new AbortController();
    const traffic: TrafficRepository = {
      async load() {
        controller.abort();
        return createFixtureTrafficRepository().load();
      },
    };
    const model = createScriptedModel('batch', (messages) => {
      const question = currentQuestion(messages);
      if (resultsSince(messages, question.index).length === 0) {
        return {
          type: 'tool_calls',
          calls: [
            { id: 'a', name: 'get_channel_performance', arguments: '{}' },
            { id: 'b', name: 'get_funnel', arguments: '{}' },
            { id: 'c', name: 'get_audit_findings', arguments: '{}' },
          ],
        };
      }
      return { type: 'final', content: JSON.stringify({ summary: 'Done.', facts: [], findings: [], gaps: [] }) };
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model, traffic, signal: controller.signal });
    expect(result.toolCalls.map((call) => call.status)).toEqual(['error', 'cancelled', 'cancelled']);
  });
});

describe('limits', () => {
  it('runs at most eight tool calls, then makes the model answer', async () => {
    let n = 0;
    const model = createScriptedModel('greedy', (messages) => {
      const nudged = messages.some((message) => message.role === 'user' && message.content.startsWith('No more tool calls'));
      if (nudged) {
        const top = topFinding(messages);
        return {
          type: 'final',
          content: JSON.stringify({
            summary: 'Stopped at the limit.',
            facts: [],
            findings: [{ basedOn: top.id, facts: [{ kind: 'value', refId: top.refIds[0] ?? '' }], whyPriority: 'Ranked first by GrowthOS.', howToVerify: 'Open the evidence.' }],
            gaps: [],
          }),
        };
      }
      n += 1;
      return { type: 'tool_calls', calls: [{ id: `a${n}`, name: 'get_channel_performance', arguments: '{}' }, { id: `b${n}`, name: 'get_funnel', arguments: '{}' }, { id: `c${n}`, name: 'get_funnel', arguments: '{"channel":"Email"}' }] };
    });
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model });
    expect(result.toolCalls.filter((call) => call.status !== 'limit-reached')).toHaveLength(8);
    expect(result.toolCalls.some((call) => call.status === 'limit-reached')).toBe(true);
    expect(result.notes.some((note) => note.includes('8 tool calls'))).toBe(true);
    expect(result.status).toBe('answered');
  });

  it('times out a slow tool and carries on', async () => {
    const { result } = await ask(MAIN, DEFAULT_SCOPE, {
      traffic: createDelayedTrafficRepository(createFixtureTrafficRepository(), 200),
      limits: { toolTimeoutMs: 20 },
    });
    expect(result.toolCalls.every((call) => call.status === 'error')).toBe(true);
    expect(result.notes.some((note) => note.includes('timed out after 20 ms'))).toBe(true);
  });

  it('stops a turn that runs past its time limit', async () => {
    const model = createScriptedModel('slow', () => new Promise<ModelTurn>((resolve) => setTimeout(() => resolve({ type: 'final', content: '{}' }), 300)));
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model, limits: { turnTimeoutMs: 30 } });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('ran out of time');
  });

  it('gives up on a model that never answers', async () => {
    const model = createScriptedModel('loop', () => ({ type: 'tool_calls', calls: [] }));
    const { result } = await ask(MAIN, DEFAULT_SCOPE, { model, limits: { maxModelSteps: 3 } });
    expect(result.status).toBe('failed');
    expect(result.notes.some((note) => note.includes('3 steps'))).toBe(true);
  });
});
