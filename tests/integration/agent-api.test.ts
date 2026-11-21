// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/agent/route';
import { askAgent } from '@/services/agent/client';
import { resolveLiveModel } from '@/services/agent/live-config';
import { parseAgentRequest } from '@/services/agent/request';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { DEFAULT_SCOPE } from '@/domain/agent/scope';
import type { AgentEvent } from '@/services/agent/orchestrator';

/**
 * /api/agent end to end in-process: the live gate, request validation before
 * any model is involved, and the NDJSON stream the page reads.
 */

const MAIN = '过去 30 天，独立站最该优先排查什么？';

function body(overrides: Record<string, unknown> = {}) {
  return { question: MAIN, history: [], scope: DEFAULT_SCOPE, state: buildDemoSeedState(), ...overrides };
}

function post(payload: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('live gate', () => {
  it('is off unless AGENT_LIVE_ENABLED is exactly "true"', () => {
    expect(resolveLiveModel({}).ok).toBe(false);
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: '1', AGENT_MODEL_PROVIDER: 'scripted' }).ok).toBe(false);
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: 'TRUE', AGENT_MODEL_PROVIDER: 'scripted' }).ok).toBe(false);
    const on = resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'scripted' });
    expect(on.ok && on.model.id).toBe('scripted:demo');
  });

  it('reports an unconfigured provider rather than guessing one', () => {
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: 'true' })).toMatchObject({ ok: false, error: 'model-not-configured' });
    expect(resolveLiveModel({ AGENT_LIVE_ENABLED: 'true', AGENT_MODEL_PROVIDER: 'openai' })).toMatchObject({ ok: false, error: 'model-not-configured' });
  });

  it('answers 503 live-disabled when the deployment has not enabled it', async () => {
    vi.stubEnv('AGENT_LIVE_ENABLED', '');
    const response = await post(body());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'live-disabled' });
  });
});

describe('request validation, before any model call', () => {
  it('rejects malformed JSON, a missing question and an over-long one', async () => {
    vi.stubEnv('AGENT_LIVE_ENABLED', 'true');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'scripted');
    expect((await post('{nope')).status).toBe(400);
    expect((await post(body({ question: '  ' }))).status).toBe(400);
    expect((await post(body({ question: 'x'.repeat(501) }))).status).toBe(400);
  });

  it('rejects an invalid scope and unknown fields', () => {
    expect(parseAgentRequest(body({ scope: { range: 14, channel: null, products: [] } }), 10).ok).toBe(false);
    expect(parseAgentRequest(body({ scope: { range: 30, channel: 'Organic search', products: [] } }), 10).ok).toBe(false);
    expect(parseAgentRequest(body({ extra: true }), 10).ok).toBe(false);
  });

  it('rejects browser state that does not match the schema, without falling back to the seed', async () => {
    vi.stubEnv('AGENT_LIVE_ENABLED', 'true');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'scripted');
    const response = await post(body({ state: { ...buildDemoSeedState(), schemaVersion: 6 } }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain('schemaVersion');
  });

  it('refuses an oversized request while reading it, with 413', async () => {
    vi.stubEnv('AGENT_LIVE_ENABLED', 'true');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'scripted');
    const response = await post(body({ question: 'x', padding: 'y'.repeat(330 * 1024) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'request-too-large' });
  });

  it('rejects oversized state by its measured size', () => {
    const result = parseAgentRequest(body(), 256 * 1024 + 1);
    expect(result.ok).toBe(false);
  });

  it('accepts a valid request and hands the scope through', () => {
    const result = parseAgentRequest(body({ scope: { range: 7, channel: 'Email', products: [] } }), 1000);
    expect(result.ok && result.input.scope).toEqual({ range: 7, channel: 'Email', products: [] });
  });
});

describe('the stream', () => {
  it('streams progress events and ends with the full result', async () => {
    vi.stubEnv('AGENT_LIVE_ENABLED', 'true');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'scripted');
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as AgentEvent);
    expect(lines[0]?.type).toBe('started');
    expect(lines.some((event) => event.type === 'tool-start')).toBe(true);
    const done = lines.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.result.status).toBe('answered');
      expect(done.result.model).toBe('scripted:demo');
    }
  });
});

describe('askAgent (browser client)', () => {
  function streamOf(chunks: string[], status = 200): typeof fetch {
    return async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
          },
        }),
        { status },
      );
  }

  const done = { type: 'done', result: { status: 'answered', scope: DEFAULT_SCOPE } };

  it('reassembles events split across chunks', async () => {
    const seen: string[] = [];
    const text = `${JSON.stringify({ type: 'answering' })}\n${JSON.stringify(done)}\n`;
    const result = await askAgent(body(), (event) => seen.push(event.type), {
      fetcher: streamOf([text.slice(0, 7), text.slice(7, 40), text.slice(40)]),
    });
    expect(seen).toEqual(['answering', 'done']);
    expect(result.kind).toBe('done');
  });

  it('distinguishes a disabled deployment from an error', async () => {
    const disabled: typeof fetch = async () => Response.json({ error: 'live-disabled', message: 'off' }, { status: 503 });
    expect(await askAgent(body(), () => {}, { fetcher: disabled })).toEqual({ kind: 'disabled', message: 'off' });
    const broken: typeof fetch = async () => Response.json({ error: 'invalid-request', message: 'bad' }, { status: 400 });
    expect(await askAgent(body(), () => {}, { fetcher: broken })).toEqual({ kind: 'error', message: 'bad' });
  });

  it('reports a stream that ends without a result, or carries an error', async () => {
    expect((await askAgent(body(), () => {}, { fetcher: streamOf([`${JSON.stringify({ type: 'answering' })}\n`]) })).kind).toBe('error');
    const failed = await askAgent(body(), () => {}, { fetcher: streamOf([`${JSON.stringify({ type: 'error', message: 'boom' })}\n`]) });
    expect(failed).toEqual({ kind: 'error', message: 'boom' });
  });

  it('leaves the analysing state with an error when the stream breaks mid-way', async () => {
    const broken: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          pulls: 0,
          pull(controller) {
            // First read delivers a progress line; the next one fails, as a dropped connection does.
            if (this.pulls === 0) controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'answering' })}\n`));
            else controller.error(new Error('socket hang up'));
            this.pulls += 1;
          },
        } as UnderlyingDefaultSource<Uint8Array> & { pulls: number }),
      );
    const seen: string[] = [];
    const result = await askAgent(body(), (event) => seen.push(event.type), { fetcher: broken });
    expect(seen).toEqual(['answering']);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toContain('interrupted');
  });

  it('sends only the most recent turns, so a long conversation keeps working', async () => {
    let sent: { history: { question: string }[] } | null = null;
    const capture: typeof fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as { history: { question: string }[] };
      return Response.json({ error: 'live-disabled', message: 'off' }, { status: 503 });
    };
    const history = Array.from({ length: 15 }, (_, index) => ({ question: `q${index}`, answerSummary: 's' }));
    await askAgent({ ...body(), history }, () => {}, { fetcher: capture });
    expect(sent!.history.map((turn) => turn.question)).toEqual(history.slice(-10).map((turn) => turn.question));
    expect(parseAgentRequest({ ...body(), history: sent!.history }, 1000).ok).toBe(true);
  });

  it('reports a network failure', async () => {
    const offline: typeof fetch = async () => {
      throw new Error('offline');
    };
    expect(await askAgent(body(), () => {}, { fetcher: offline })).toEqual({ kind: 'error', message: 'offline' });
  });
});
