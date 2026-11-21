// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOpenAIModel, fromWireResponse, OPENAI_CHAT_URL, retryDelayMs, toWireMessages } from '@/services/agent/openai-model';
import { limitsFromEnv, resolveLiveModel } from '@/services/agent/live-config';
import { forModel, messageChars, runAgentTurn, TOOL_SPECS } from '@/services/agent/orchestrator';
import { createScriptedModel, currentQuestion, resultsSince } from '@/services/agent/scripted-model';
import type { AgentMessage } from '@/services/agent/model';
import { runTool } from '@/services/agent-tools/registry';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { DEFAULT_SCOPE } from '@/domain/agent/scope';

/**
 * The OpenAI adapter against a stubbed fetch (no network, no key), the
 * provider configuration, and the model input budget.
 */

const KEY = 'sk-test-not-a-real-key-123';

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function stub(response: unknown, status = 200): { fetcher: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(typeof response === 'string' ? response : JSON.stringify(response), { status });
  };
  return { fetcher, calls };
}

const conversation: AgentMessage[] = [
  { role: 'system', content: 'rules' },
  { role: 'user', content: 'question' },
  { role: 'assistant', content: null, toolCalls: [{ id: 'call_1', name: 'get_funnel', arguments: '{"range":30}' }] },
  { role: 'tool', toolCallId: 'call_1', name: 'get_funnel', content: '{"status":"ok"}' },
  { role: 'assistant', content: 'previous summary', toolCalls: [] },
];

describe('request mapping', () => {
  it('maps every message role to the Chat Completions shape', () => {
    expect(toWireMessages(conversation)).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_funnel', arguments: '{"range":30}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '{"status":"ok"}' },
      { role: 'assistant', content: 'previous summary' },
    ]);
  });

  it('posts the model, messages and every tool to the chat endpoint with the key only in the header', async () => {
    const { fetcher, calls } = stub({ choices: [{ message: { content: '{"summary":"s"}' } }] });
    const model = createOpenAIModel({ apiKey: KEY, model: 'gpt-test', fetcher });
    await model.next({ messages: conversation, tools: TOOL_SPECS }, new AbortController().signal);
    const call = calls[0]!;
    expect(call.url).toBe(OPENAI_CHAT_URL);
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(call.body['model']).toBe('gpt-test');
    expect(call.body['tool_choice']).toBe('auto');
    const tools = call.body['tools'] as { type: string; function: { name: string; parameters: object } }[];
    expect(tools.map((tool) => tool.function.name)).toEqual(TOOL_SPECS.map((spec) => spec.name));
    expect(tools.every((tool) => tool.type === 'function' && typeof tool.function.parameters === 'object')).toBe(true);
    expect(JSON.stringify(call.body)).not.toContain(KEY);
    expect(model.id).toBe('openai:gpt-test');
  });

  it('sends reasoning_effort only when it is configured', async () => {
    const off = stub({ choices: [{ message: { content: 'x' } }] });
    await createOpenAIModel({ apiKey: KEY, model: 'm', fetcher: off.fetcher }).next({ messages: conversation, tools: [] }, new AbortController().signal);
    expect('reasoning_effort' in off.calls[0]!.body).toBe(false);
    const on = stub({ choices: [{ message: { content: 'x' } }] });
    await createOpenAIModel({ apiKey: KEY, model: 'm', reasoningEffort: 'none', fetcher: on.fetcher }).next({ messages: conversation, tools: [] }, new AbortController().signal);
    expect(on.calls[0]!.body['reasoning_effort']).toBe('none');
  });

  it('passes the cancellation signal to the network request', async () => {
    const { fetcher, calls } = stub({ choices: [{ message: { content: 'x' } }] });
    const controller = new AbortController();
    await createOpenAIModel({ apiKey: KEY, model: 'm', fetcher }).next({ messages: conversation, tools: [] }, controller.signal);
    expect(calls[0]!.init.signal).toBe(controller.signal);
  });
});

describe('response mapping', () => {
  it('reads tool calls, keeping arguments as the raw string, and usage', () => {
    const turn = fromWireResponse({
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c9', type: 'function', function: { name: 'get_funnel', arguments: '{"channel":"Meta"}' } }] } }],
      usage: { prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230 },
    });
    expect(turn).toEqual({ type: 'tool_calls', calls: [{ id: 'c9', name: 'get_funnel', arguments: '{"channel":"Meta"}' }], usage: { promptTokens: 1200, completionTokens: 30 } });
  });

  it('reads a final text, with or without usage', () => {
    expect(fromWireResponse({ choices: [{ message: { content: '{"a":1}' } }] })).toEqual({ type: 'final', content: '{"a":1}' });
  });

  it('fills a missing call id and tolerates missing arguments', () => {
    const turn = fromWireResponse({ choices: [{ message: { tool_calls: [{ function: { name: 'get_funnel' } }] } }] });
    expect(turn).toEqual({ type: 'tool_calls', calls: [{ id: 'call_0', name: 'get_funnel', arguments: '' }] });
  });

  it('throws on a response it cannot use, including a refusal', () => {
    expect(() => fromWireResponse({})).toThrow('without choices');
    expect(() => fromWireResponse({ choices: [{}] })).toThrow('without a message');
    expect(() => fromWireResponse({ choices: [{ message: { content: '   ' } }] })).toThrow('neither tool calls nor text');
    expect(() => fromWireResponse({ choices: [{ message: { content: null, refusal: 'no' } }] })).toThrow('declined to answer: no');
    expect(() => fromWireResponse({ choices: [{ message: { tool_calls: [{ id: 'x' }] } }] })).toThrow('malformed tool call at position 0');
  });
});

describe('errors', () => {
  it.each([
    // Even a masked key prefix from the provider is removed.
    [401, { error: { message: 'Incorrect API key provided: sk-tes***' } }, 'OpenAI answered 401: Incorrect API key provided: sk-…***. Check OPENAI_API_KEY.'],
    [429, { error: { message: 'Rate limit reached' } }, 'OpenAI answered 429: Rate limit reached. Rate limit or quota reached.'],
    [500, 'not json', 'OpenAI answered 500.'],
    [429, { error: { message: 'You have no credits remaining. Add credits to continue.' } }, 'OpenAI answered 429: You have no credits remaining. Add credits to continue. Rate limit or quota reached.'],
  ])('reports HTTP %i without the key', async (status, body, message) => {
    const { fetcher } = stub(body, status);
    // A rate-limit 429 is retried first; no real waiting in tests.
    const model = createOpenAIModel({ apiKey: KEY, model: 'm', fetcher, sleep: async () => {} });
    const error = await model.next({ messages: conversation, tools: [] }, new AbortController().signal).catch((cause: Error) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('removes the organisation id and anything key-shaped from provider text', async () => {
    const { fetcher } = stub({ error: { message: 'Request too large for gpt-5.6-terra in organization org-AbC123xyz on tokens per min (TPM). Key sk-live_abc123.' } }, 400);
    const error = await createOpenAIModel({ apiKey: KEY, model: 'm', fetcher }).next({ messages: conversation, tools: [] }, new AbortController().signal).catch((cause: Error) => cause);
    expect((error as Error).message).toContain('organization org-… on tokens per min');
    expect((error as Error).message).toContain('Key sk-…');
    expect((error as Error).message).not.toMatch(/org-AbC|sk-live/);
  });

  it('turns a provider failure into a failed turn, not an invented answer', async () => {
    const { fetcher } = stub({ error: { message: 'down' } }, 503);
    const result = await runAgentTurn(
      { question: 'q', history: [], scope: DEFAULT_SCOPE },
      { model: createOpenAIModel({ apiKey: KEY, model: 'm', fetcher }), traffic: createFixtureTrafficRepository(), state: { source: 'seed', value: buildDemoSeedState() }, now: () => 'x' },
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain('OpenAI answered 503: down');
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe('rate limits', () => {
  function sequence(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
    let index = 0;
    const fetcher: typeof fetch = async () => {
      const next = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers ?? {} });
    };
    return { fetcher, calls: () => index };
  }
  const tpm = { status: 429, body: { error: { message: 'Rate limit reached for tokens per min (TPM).', code: 'rate_limit_exceeded' } } };
  const ok = { status: 200, body: { choices: [{ message: { content: 'done' } }] } };

  it('waits as asked and retries a per-minute rate limit', async () => {
    const waits: number[] = [];
    const { fetcher, calls } = sequence([{ ...tpm, headers: { 'retry-after-ms': '1500' } }, ok]);
    const model = createOpenAIModel({ apiKey: KEY, model: 'm', fetcher, sleep: async (ms) => void waits.push(ms) });
    expect(await model.next({ messages: conversation, tools: [] }, new AbortController().signal)).toEqual({ type: 'final', content: 'done' });
    expect(calls()).toBe(2);
    expect(waits).toEqual([1500]);
  });

  it('caps the wait, reads retry-after in seconds, and gives up after the retries', async () => {
    const waits: number[] = [];
    const { fetcher, calls } = sequence([{ ...tpm, headers: { 'retry-after': '90' } }]);
    const model = createOpenAIModel({ apiKey: KEY, model: 'm', fetcher, maxRetries: 2, maxRetryWaitMs: 20_000, sleep: async (ms) => void waits.push(ms) });
    const error = await model.next({ messages: conversation, tools: [] }, new AbortController().signal).catch((cause: Error) => cause);
    expect((error as Error).message).toContain('OpenAI answered 429');
    expect(calls()).toBe(3);
    expect(waits).toEqual([20_000, 20_000]);
  });

  it('does not retry an exhausted quota', async () => {
    const { fetcher, calls } = sequence([{ status: 429, body: { error: { message: 'You have no credits remaining.', code: 'insufficient_quota' } } }, ok]);
    const model = createOpenAIModel({ apiKey: KEY, model: 'm', fetcher, sleep: async () => {} });
    await expect(model.next({ messages: conversation, tools: [] }, new AbortController().signal)).rejects.toThrow('no credits');
    expect(calls()).toBe(1);
  });

  it('stops waiting when the turn is cancelled', async () => {
    const { fetcher, calls } = sequence([{ ...tpm, headers: { 'retry-after-ms': '60000' } }, ok]);
    const controller = new AbortController();
    const model = createOpenAIModel({ apiKey: KEY, model: 'm', fetcher });
    const pending = model.next({ messages: conversation, tools: [] }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(calls()).toBe(1);
  });

  it('reads retry delays from headers, falling back when there are none', () => {
    expect(retryDelayMs(new Headers({ 'retry-after-ms': '250' }), 5000)).toBe(250);
    expect(retryDelayMs(new Headers({ 'retry-after': '3' }), 5000)).toBe(3000);
    expect(retryDelayMs(new Headers({ 'retry-after': 'soon' }), 5000)).toBe(5000);
    expect(retryDelayMs(new Headers(), 5000)).toBe(5000);
  });
});

describe('limits from the environment', () => {
  it('takes positive whole numbers and ignores anything else', () => {
    expect(limitsFromEnv({})).toEqual({});
    expect(limitsFromEnv({ AGENT_MAX_INPUT_CHARS: '30000', AGENT_MAX_TOOL_RESULT_CHARS: '8000', AGENT_TURN_TIMEOUT_MS: '150000' })).toEqual({
      maxInputChars: 30000,
      maxToolResultChars: 8000,
      turnTimeoutMs: 150000,
    });
    expect(limitsFromEnv({ AGENT_MAX_INPUT_CHARS: '-5', AGENT_MAX_TOOL_RESULT_CHARS: '1.5', AGENT_TURN_TIMEOUT_MS: 'fast' })).toEqual({});
  });

  it('hands the limits to the live model configuration', () => {
    const live = resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'scripted', AGENT_MAX_INPUT_CHARS: '30000' });
    expect(live.ok && live.limits).toEqual({ maxInputChars: 30000 });
  });
});

describe('provider configuration', () => {
  it('needs both the key and the model, and names only what is missing', () => {
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'openai' })).toMatchObject({
      ok: false,
      error: 'model-not-configured',
      message: 'OpenAI is selected but OPENAI_API_KEY and AGENT_MODEL are not set.',
    });
    const noModel = resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'openai', OPENAI_API_KEY: KEY });
    expect(noModel).toMatchObject({ ok: false, message: 'OpenAI is selected but AGENT_MODEL is not set.' });
    expect(JSON.stringify(noModel)).not.toContain(KEY);
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'openai', AGENT_MODEL: 'm' })).toMatchObject({ message: 'OpenAI is selected but OPENAI_API_KEY is not set.' });
  });

  it('builds the OpenAI client when both are set, and stays off without the live switch', () => {
    const on = resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'openai', OPENAI_API_KEY: KEY, AGENT_MODEL: 'gpt-x' });
    expect(on.ok && on.model.id).toBe('openai:gpt-x');
    expect(resolveLiveModel({ AGENT_MODEL_PROVIDER: 'openai', OPENAI_API_KEY: KEY, AGENT_MODEL: 'gpt-x' })).toMatchObject({ ok: false, error: 'live-disabled' });
  });
});

const context = () => ({ traffic: createFixtureTrafficRepository(), state: { source: 'seed' as const, value: buildDemoSeedState() }, now: () => 'x' });

describe('model input budget', () => {
  it('sends a large result compactly: no raw data, only cited figures, and says so', async () => {
    const outcome = await runTool('get_audit_findings', {}, context());
    const full = forModel(outcome, Number.MAX_SAFE_INTEGER);
    expect(full.length).toBeGreaterThan(24_000);
    const compact = forModel(outcome, 24_000);
    expect(compact.length).toBeLessThanOrEqual(24_000);
    const body = JSON.parse(compact) as { truncated: { findingsShown: number; findingsTotal: number }; data?: unknown; findings: { refIds: string[] }[]; auditRefs: { refId: string }[] };
    expect(body.data).toBeUndefined();
    expect(body.truncated.findingsShown).toBeLessThanOrEqual(body.truncated.findingsTotal);
    const cited = new Set(body.findings.flatMap((finding) => finding.refIds));
    expect(body.auditRefs.every((ref) => cited.has(ref.refId))).toBe(true);
  });

  it('keeps the best-ranked findings when it has to drop some', async () => {
    const outcome = await runTool('get_audit_findings', {}, context());
    const body = JSON.parse(forModel(outcome, 6_000)) as { findings: { priority: string }[]; truncated: { findingsShown: number; findingsTotal: number } };
    expect(body.truncated.findingsShown).toBeLessThan(body.truncated.findingsTotal);
    expect(body.findings[0]?.priority).toBe('Critical');
  });

  it('leaves a small result untouched', async () => {
    const outcome = await runTool('get_funnel', { channel: 'Email', compare: false }, context());
    expect(forModel(outcome, 24_000)).toBe(forModel(outcome, Number.MAX_SAFE_INTEGER));
  });

  it('stops running tools at the turn budget and makes the model answer', async () => {
    const model = createScriptedModel('budget', (messages) => {
      if (messages.some((message) => message.role === 'user' && message.content.startsWith('The input budget'))) {
        return { type: 'final', content: JSON.stringify({ summary: 'Stopped at the budget.', facts: [], findings: [], gaps: [] }) };
      }
      const question = currentQuestion(messages);
      const n = resultsSince(messages, question.index).length;
      // Product lookups raise no findings, so a figures-only answer is valid here.
      return { type: 'tool_calls', calls: [{ id: `c${n}`, name: 'get_product_performance', arguments: '{"limit":20}' }] };
    });
    // Compacted results are small (under a thousand characters each), so the
    // total crosses a 6,000-character budget gradually, within the eight-call
    // limit, rather than jumping past 1.25 times it in one step.
    const result = await runAgentTurn({ question: 'q', history: [], scope: DEFAULT_SCOPE }, { model, ...context(), limits: { maxInputChars: 6_000, maxToolResultChars: 2_000 } });
    expect(result.notes.some((note) => note.includes('input budget of 6000 characters'))).toBe(true);
    expect(result.status).toBe('answered');
    expect(result.toolCalls.filter((call) => call.status === 'ok').length).toBeLessThan(8);
  });

  it('gives up when the input runs far past the budget', async () => {
    const model = createScriptedModel('flood', () => ({ type: 'tool_calls', calls: [{ id: 'a', name: 'get_audit_findings', arguments: '{}' }, { id: 'b', name: 'get_audit_findings', arguments: '{"kind":"geo"}' }] }));
    // The system prompt fits; one large audit result then takes the input far past the budget.
    const result = await runAgentTurn({ question: 'q', history: [], scope: DEFAULT_SCOPE }, { model, ...context(), limits: { maxInputChars: 4_000 } });
    expect(result.status).toBe('fallback');
    expect(result.message).toContain('more data than fits');
    expect(result.answer?.findings.length).toBeGreaterThan(0);
  });

  it('counts message text and tool-call arguments', () => {
    expect(messageChars([{ role: 'user', content: 'abcd' }, { role: 'assistant', content: null, toolCalls: [{ id: 'x', name: 'ab', arguments: 'cde' }] }])).toBe(9);
  });
});

describe('record of a turn', () => {
  it('freezes the figures it cites, both sides of a change, provenance and usage', async () => {
    const model = createScriptedModel('usage', (messages) => {
      const question = currentQuestion(messages);
      if (resultsSince(messages, question.index).length === 0) {
        return { type: 'tool_calls', calls: [{ id: 'p', name: 'get_product_performance', arguments: '{"query":"Ridgeline"}' }], usage: { promptTokens: 100, completionTokens: 5 } };
      }
      const tool = messages.find((message) => message.role === 'tool');
      const refs = (JSON.parse((tool as { content: string }).content) as { refs: { refId: string }[] }).refs;
      return {
        type: 'final',
        content: JSON.stringify({ summary: 'Figures below.', facts: [{ kind: 'value', refId: refs[0]?.refId }], findings: [], gaps: [] }),
        usage: { promptTokens: 300, completionTokens: 40 },
      };
    });
    const result = await runAgentTurn({ question: 'q', history: [], scope: DEFAULT_SCOPE }, { model, ...context() });
    expect(result.status).toBe('answered');
    expect(result.usage).toEqual({ promptTokens: 400, completionTokens: 45 });
    expect(result.citations.refs).toHaveLength(1);
    expect(result.citations.refs[0]?.value).not.toBeUndefined();
    expect(result.provenance.dataSources.some((source) => source.startsWith('fixture:traffic'))).toBe(true);
    expect(result.provenance.ruleVersions).toContain('agent-priority-1.0.0');
  });
});
