// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findReplay, findSensitive, isSiteLink, listReplays, parseReplay, passedFirstTime, publicTurn, summarizeReplay } from '@/services/agent/replays';
import { runAgentTurn } from '@/services/agent/orchestrator';
import { createDemoModel } from '@/services/agent/scripted-model';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { supportCategory } from '@/domain/support-feedback';
import { parseRangeParam } from '@/domain/url-params';
import { supportFeedback } from '@/services/support-feedback';
import { DEFAULT_SCOPE } from '@/domain/agent/scope';
import { REPLAY_FILES } from '@/fixtures/agent-replays';

/** The replay format: what a recording must freeze, and what the pages read. */

async function recordedTurn(question: string) {
  const result = await runAgentTurn(
    { question, history: [], scope: DEFAULT_SCOPE },
    { model: createDemoModel(), traffic: createFixtureTrafficRepository(), state: { source: 'seed', value: buildDemoSeedState() }, now: () => '2026-11-21T00:00:00.000Z' },
  );
  return { question, scopeBefore: DEFAULT_SCOPE, result };
}

async function replay(overrides: Record<string, unknown> = {}) {
  return JSON.parse(
    JSON.stringify({
      version: 1,
      id: 'test-review',
      title: 'Test',
      source: 'scripted',
      model: 'scripted:demo',
      recordedAt: '2026-11-21T00:00:00.000Z',
      demoAsOf: '2026-08-31',
      stateSource: 'seed',
      turns: [await recordedTurn('过去 30 天，独立站最该优先排查什么？')],
      ...overrides,
    }),
  ) as Record<string, unknown>;
}

describe('replay format', () => {
  it('accepts a real turn result round-tripped through JSON, with everything a replay must freeze', async () => {
    const parsed = parseReplay(await replay());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const turn = parsed.replay.turns[0]!;
    expect(turn.result.toolCalls.map((call) => call.name)[0]).toBe('get_channel_performance');
    expect(turn.result.answer?.findings.length).toBeGreaterThan(0);
    expect(turn.result.citations.refs.length).toBeGreaterThan(0);
    expect(turn.result.provenance.ruleVersions).toContain('agent-priority-1.0.0');
    expect(turn.scopeBefore).toEqual(DEFAULT_SCOPE);
  });

  it.each([
    ['an id with spaces', { id: 'Bad Id' }],
    ['an unknown source', { source: 'imagined' }],
    ['no turns', { turns: [] }],
    ['a visitor state source', { stateSource: 'browser-local' }],
    ['an extra field', { secret: 'x' }],
  ])('rejects %s', async (_label, overrides) => {
    expect(parseReplay(await replay(overrides)).ok).toBe(false);
  });

  it.each(['https://example.com', '//example.com/path', '/\\example.com', 'javascript:alert(1)'])('rejects a link that leaves the site: %s', async (href) => {
    const inSummary = await replay();
    (inSummary['turns'] as { result: { answer: { summary: unknown[] } } }[])[0]!.result.answer.summary = [{ kind: 'link', text: 'x', href, title: 'x' }];
    expect(parseReplay(inSummary).ok).toBe(false);

    const inEvidence = await replay();
    (inEvidence['turns'] as { result: { answer: { findings: { evidence: unknown[] }[] } } }[])[0]!.result.answer.findings[0]!.evidence = [{ label: 'x', href }];
    expect(parseReplay(inEvidence).ok).toBe(false);

    const inGap = await replay();
    (inGap['turns'] as { result: { toolGaps: unknown[] } }[])[0]!.result.toolGaps = [{ message: 'm', links: [{ label: 'x', href }] }];
    expect(parseReplay(inGap).ok).toBe(false);
  });

  it('accepts only bounded tool inputs and well-formed citations, and no extra result fields', async () => {
    const cases: Array<[string, (result: Record<string, unknown>) => void]> = [
      ['nested tool input', (result) => { (result['toolCalls'] as Array<Record<string, unknown>>)[0]!['input'] = { deep: { nested: true } }; }],
      ['oversized raw input', (result) => { (result['toolCalls'] as Array<Record<string, unknown>>)[0]!['input'] = 'x'.repeat(2001); }],
      ['citation with an off-site link', (result) => { ((result['citations'] as { refs: Array<Record<string, unknown>> }).refs[0]!)['href'] = 'https://example.com'; }],
      ['citation with an unknown unit', (result) => { ((result['citations'] as { refs: Array<Record<string, unknown>> }).refs[0]!)['unit'] = 'bitcoin'; }],
      ['an extra result field', (result) => { result['debug'] = 'x'; }],
    ];
    for (const [label, mutate] of cases) {
      const raw = await replay();
      mutate((raw['turns'] as Array<{ result: Record<string, unknown> }>)[0]!.result);
      expect(parseReplay(raw).ok, label).toBe(false);
    }
  });

  it('refuses a replay that carries a key, an organisation id or an auth header', async () => {
    for (const leak of ['sk-abcdef123456', 'org-AbCdEf1234', 'Bearer abc', 'Authorization: x']) {
      const raw = await replay();
      (raw['turns'] as { result: { notes: string[] } }[])[0]!.result.notes = [`provider said ${leak}`];
      const parsed = parseReplay(raw);
      expect(parsed.ok, leak).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain('sensitive content');
    }
  });
});

describe('first-attempt count', () => {
  it.each([
    ['answered with one clean check', 'answered', [[]], true],
    ['answered after a repair', 'answered', [['raw-number'], []], false],
    ['no answer submitted at all', 'failed', [], false],
    ['first answer refused, repair never came', 'fallback', [['raw-number']], false],
    ['answered status but no submission recorded', 'answered', [], false],
    ['one submission with issues, still answered', 'answered', [['raw-number']], false],
  ] as const)('%s', (_label, status, rounds, expected) => {
    expect(passedFirstTime({ status, validation: rounds.map((codes) => ({ issueCodes: [...codes] })) })).toBe(expected);
  });

  it('summarises a replay with the exact rule and labels usage as responses, not attempts', async () => {
    const raw = await replay();
    const turns = raw['turns'] as Array<{ result: { status: string; validation: unknown[]; usage: unknown } }>;
    turns.push(JSON.parse(JSON.stringify(turns[0])) as (typeof turns)[number], JSON.parse(JSON.stringify(turns[0])) as (typeof turns)[number]);
    turns[1]!.result.validation = [];
    turns[1]!.result.status = 'failed';
    turns[2]!.result.validation = [{ issueCodes: ['raw-number'] }];
    turns[2]!.result.status = 'fallback';
    turns[0]!.result.usage = { promptTokens: 100, completionTokens: 10, requests: 2, largestPromptTokens: 70 };
    const parsed = parseReplay(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    const summary = summarizeReplay(parsed.replay);
    expect(summary).toMatchObject({ turns: 3, firstPass: 1, responsesWithUsage: 2, promptTokens: 100, largestPromptTokens: 70 });
  });

  it('sends the browser only what the turn view renders', async () => {
    const parsed = parseReplay(await replay());
    if (!parsed.ok) throw new Error(parsed.error);
    const shown = publicTurn(parsed.replay.turns[0]!.result);
    expect(Object.keys(shown).sort()).toEqual(
      ['answer', 'failedChecks', 'message', 'model', 'noActionTaken', 'notes', 'refusedActions', 'scope', 'status', 'toolCalls', 'toolGaps', 'toolNotes', 'window'].sort(),
    );
    expect('citations' in shown || 'provenance' in shown || 'usage' in shown || 'validation' in shown || 'issues' in shown).toBe(false);
  });
});

describe('guards', () => {
  it('accepts only links that stay on this site', () => {
    expect(isSiteLink('/funnel?range=30&channel=Organic+Search')).toBe(true);
    expect(isSiteLink('/seo/snap_a?preview=1')).toBe(true);
    for (const href of ['https://example.com', '//example.com', '/\\evil.com', 'funnel', '', 'javascript:alert(1)']) expect(isSiteLink(href), href).toBe(false);
  });

  it('names what kind of sensitive content it found, never the content itself', () => {
    expect(findSensitive('fine text')).toEqual([]);
    expect(findSensitive('key sk-live_abcdef1 and org-Abcdef12 with Bearer x1')).toEqual(['api-key', 'organisation-id', 'auth-header']);
  });
});

describe('listing', () => {
  it('lists newest first and reports a malformed file instead of showing it', async () => {
    const older = await replay({ id: 'older', recordedAt: '2026-11-01T00:00:00.000Z' });
    const newer = await replay({ id: 'newer', recordedAt: '2026-11-20T00:00:00.000Z' });
    const result = listReplays([older, { broken: true }, newer]);
    expect(result.replays.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(result.invalid.map((item) => item.index)).toEqual([1]);
    expect(findReplay('older', [older, newer])?.id).toBe('older');
    expect(findReplay('missing', [older])).toBeNull();
  });
});

describe('bundled replays', () => {
  const dir = path.join(process.cwd(), 'src/fixtures/agent-replays');
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

  it('are all listed by the index and all valid', () => {
    expect(REPLAY_FILES).toHaveLength(files.length);
    const { replays, invalid } = listReplays();
    expect(invalid).toEqual([]);
    expect(replays.map((item) => `${item.id}.json`).sort()).toEqual([...files].sort());
  });

  it('reproduces every real support replay citation from the linked filters', () => {
    const recording = findReplay('live-support-feedback');
    expect(recording?.source).toBe('live-model');
    if (recording === null) throw new Error('Missing live support replay');
    expect(recording.turns).toHaveLength(2);
    expect(recording.turns.map(({ result }) => result.scope.range)).toEqual([30, 30]);
    expect(recording.turns.map(({ result }) => result.status)).toEqual(['fallback', 'answered']);
    expect(summarizeReplay(recording).firstPass).toBe(1);
    expect(recording.turns[0]?.result.citations.refs[0]).toMatchObject({ productId: 'prd_ridgeline_2p_tent', value: 5 });
    const followUp = recording.turns[1]!.result.citations.refs;
    expect(followUp.map(({ productId, value }) => [productId, value])).toEqual([
      ['prd_ridgeline_2p_tent', 5], ['prd_ridgeline_2p_tent', 3], ['prd_ridgeline_2p_tent', 2],
    ]);
    for (const { result } of recording.turns) {
      for (const ref of result.citations.refs) {
        const url = new URL(ref.href, 'https://growthos.invalid');
        expect(url.pathname).toBe('/support');
        const range = parseRangeParam(url.searchParams.get('range'), 30);
        const report = supportFeedback(range, {
          productId: url.searchParams.get('product'),
          category: supportCategory(url.searchParams.get('category')),
        });
        expect(report.window).toMatchObject(ref.window);
        expect(report.rows.length).toBe(ref.value);
      }
    }
  });

  it('contain no key, header or bearer token', () => {
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/sk-[A-Za-z0-9]|Bearer |Authorization|OPENAI_API_KEY/);
    }
  });
});
