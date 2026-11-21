// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findReplay, listReplays, parseReplay } from '@/services/agent/replays';
import { runAgentTurn } from '@/services/agent/orchestrator';
import { createDemoModel } from '@/services/agent/scripted-model';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
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

  it('rejects a link that leaves the site', async () => {
    const raw = await replay();
    const turns = raw['turns'] as { result: { answer: { summary: unknown[] } } }[];
    turns[0]!.result.answer.summary = [{ kind: 'link', text: 'x', href: 'https://example.com', title: 'x' }];
    expect(parseReplay(raw).ok).toBe(false);
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

  it('contain no key, header or bearer token', () => {
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/sk-[A-Za-z0-9]|Bearer |Authorization|OPENAI_API_KEY/);
    }
  });
});
