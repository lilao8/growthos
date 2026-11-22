import { expect, it } from 'vitest';
import { DEFAULT_SCOPE } from '@/domain/agent/scope';
import { parseRangeParam } from '@/domain/url-params';
import { supportCategory } from '@/domain/support-feedback';
import { createFailingTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { runTool } from '@/services/agent-tools/registry';
import { plainText } from '@/components/agent/answer-text';
import { runAgentTurn } from '@/services/agent/orchestrator';
import { createDemoModel, createScriptedModel } from '@/services/agent/scripted-model';
import { supportFeedback } from '@/services/support-feedback';

const data = {
  traffic: createFailingTrafficRepository('There is no traffic attribution for support'),
  state: { source: 'seed' as const, value: buildDemoSeedState() },
  now: () => '2026-08-31T00:00:00Z',
};
const question = '过去 30 天，哪些 SKU 的客服反馈最多？';

it('ranks support tickets with independent counts and reproduces every citation from its URL', async () => {
  const outcome = await runTool('get_support_feedback', {}, data);
  expect(outcome.status).toBe('ok');
  if (outcome.status !== 'ok') throw new Error('Expected support results');
  expect(outcome.meta.refs[0]).toMatchObject({ productId: 'prd_ridgeline_2p_tent', value: 5 });
  expect(outcome.meta.refs[1]?.value).toBe(3);
  expect(JSON.stringify(outcome.data)).not.toMatch(/summary|priceCents|Parcel has not arrived/);
  for (const ref of outcome.meta.refs) {
    const url = new URL(ref.href, 'https://growthos.invalid');
    expect(url.pathname).toBe('/support');
    const range = parseRangeParam(url.searchParams.get('range'), 30);
    const report = supportFeedback(range, {
      productId: url.searchParams.get('product'),
      category: supportCategory(url.searchParams.get('category')),
    });
    expect(report.rows.length).toBe(ref.value);
    expect(report.window).toEqual(ref.window);
  }
});

it('returns a linked zero for known empty data and a distinct gap for ambiguous products', async () => {
  const empty = await runTool('get_support_feedback', { products: ['NT-TENT-RDG3'] }, data);
  expect(empty.status).toBe('empty');
  if (empty.status !== 'empty') throw new Error('Expected empty support results');
  expect(empty.meta.refs[0]?.value).toBe(0);
  expect(empty.meta.gaps[0]?.code).toBe('no-support-tickets');
  const ambiguous = await runTool('get_support_feedback', { products: ['Ridgeline'] }, data);
  expect(ambiguous.status).toBe('empty');
  if (ambiguous.status !== 'empty') throw new Error('Expected ambiguous support lookup');
  expect(ambiguous.meta.refs).toHaveLength(0);
  expect(ambiguous.meta.gaps[0]?.code).toBe('product-not-found');
  expect((await runTool('get_support_feedback', { channel: 'Organic Search' }, data)).status).toBe('unsupported');
});

it('uses the support tool and carries the date window into an SKU follow-up', async () => {
  const model = createDemoModel();
  const first = await runAgentTurn({ question, history: [], scope: DEFAULT_SCOPE }, { model, ...data });
  expect(first.status).toBe('answered');
  expect(first.toolCalls.map(({ name }) => name)).toEqual(['get_support_feedback']);
  expect(first.answer?.facts[0]?.map(({ text }) => text).join('')).toContain('Ridgeline 2P Backpacking Tent');
  expect(first.citations.refs[0]?.value).toBe(5);
  const history = [{ question, answerSummary: plainText(first.answer?.summary ?? []) }];
  const followUp = await runAgentTurn({ question: '只看 Ridgeline 2P 呢？', scope: first.scope, history }, { model, ...data });
  expect(followUp.status).toBe('answered');
  expect(followUp.scope).toMatchObject({ range: 30, products: ['prd_ridgeline_2p_tent'] });
  expect(followUp.citations.refs.map(({ productId, value }) => [productId, value])).toEqual([
    ['prd_ridgeline_2p_tent', 5], ['prd_ridgeline_2p_tent', 3], ['prd_ridgeline_2p_tent', 2],
  ]);
  const write = await runAgentTurn({ question: '把这些工单标为已处理', scope: followUp.scope, history }, { model, ...data });
  expect(write.noActionTaken).toBe(true);
  expect(write.toolCalls.every(({ status }) => status === 'unknown-tool')).toBe(true);
});

it('keeps tool-ranked evidence even when the model responds without figure facts', async () => {
  const model = createScriptedModel('support-ranking', (messages) => messages.some(({ role }) => role === 'tool')
    ? { type: 'final', content: JSON.stringify({ summary: 'Review the support cases.', facts: [], findings: [], gaps: [] }) }
    : { type: 'tool_calls', calls: [{ id: 'support', name: 'get_support_feedback', arguments: '{}' }] }
  );
  const result = await runAgentTurn({ question, history: [], scope: DEFAULT_SCOPE }, { model, ...data });
  expect(result.status).toBe('answered');
  expect(result.citations.refs[0]?.value).toBe(5);
  expect(result.answer?.facts[0]?.some((segment) => segment.kind === 'link' && segment.href.startsWith('/support?'))).toBe(true);
});
