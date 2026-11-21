import { describe, expect, it } from 'vitest';
import {
  AGENT_PRIORITY_VERSION,
  comparisonEvidence,
  downgrade,
  weakerStrength,
  evidenceStrength,
  rankFindings,
  type RankableFinding,
} from '@/domain/agent/priority';

const RATE = { minimumSessions: 300, minimumOrders: 25 };

describe('evidenceStrength', () => {
  it('is sufficient at both thresholds exactly', () => {
    expect(evidenceStrength({ sessions: 300, orders: 25 }, RATE)).toBe('sufficient');
  });

  it('is limited with enough sessions but too few orders', () => {
    expect(evidenceStrength({ sessions: 300, orders: 24 }, RATE)).toBe('limited');
  });

  it('is insufficient below the session floor, whatever the orders', () => {
    expect(evidenceStrength({ sessions: 299, orders: 1000 }, RATE)).toBe('insufficient');
  });

  it('ignores orders when the finding is not computed over orders', () => {
    expect(
      evidenceStrength({ sessions: 400, orders: 0 }, { minimumSessions: 300, minimumOrders: null }),
    ).toBe('sufficient');
    expect(evidenceStrength({ sessions: 400, orders: null }, RATE)).toBe('sufficient');
  });
});

describe('downgrade', () => {
  it('moves one level down and stops at Low', () => {
    expect(downgrade('Critical')).toBe('High');
    expect(downgrade('High')).toBe('Medium');
    expect(downgrade('Medium')).toBe('Low');
    expect(downgrade('Low')).toBe('Low');
  });
});

function finding(overrides: Partial<RankableFinding> & { id: string }): RankableFinding {
  return { priority: 'High', strength: 'sufficient', affectedSessions: 100, ...overrides };
}

describe('rankFindings', () => {
  it('orders by rule priority first', () => {
    const result = rankFindings([
      finding({ id: 'b', priority: 'Medium', affectedSessions: 9000 }),
      finding({ id: 'a', priority: 'Critical', affectedSessions: 1 }),
    ]);
    expect(result.ranked.map((r) => r.finding.id)).toEqual(['a', 'b']);
    expect(result.ranked.map((r) => r.rank)).toEqual([1, 2]);
    expect(result.version).toBe(AGENT_PRIORITY_VERSION);
    expect(AGENT_PRIORITY_VERSION).toMatch(/^agent-priority-\d+\.\d+\.\d+$/);
  });

  it('drops limited evidence one level, so it ranks with the level below', () => {
    const result = rankFindings([
      finding({ id: 'limited-critical', priority: 'Critical', strength: 'limited', affectedSessions: 10 }),
      finding({ id: 'high', priority: 'High', affectedSessions: 50 }),
      finding({ id: 'critical', priority: 'Critical', affectedSessions: 1 }),
    ]);
    expect(result.ranked.map((r) => r.finding.id)).toEqual([
      'critical',
      'high',
      'limited-critical',
    ]);
    const limited = result.ranked.find((r) => r.finding.id === 'limited-critical');
    expect(limited?.effectivePriority).toBe('High');
    expect(limited?.downgraded).toBe(true);
    expect(result.ranked.find((r) => r.finding.id === 'high')?.downgraded).toBe(false);
  });

  it('does not mark a limited Low finding as downgraded, because it cannot move', () => {
    const result = rankFindings([finding({ id: 'x', priority: 'Low', strength: 'limited' })]);
    expect(result.ranked[0]?.effectivePriority).toBe('Low');
    expect(result.ranked[0]?.downgraded).toBe(false);
  });

  it('within a level, puts more affected sessions first and unknown last', () => {
    const result = rankFindings([
      finding({ id: 'unknown', affectedSessions: null }),
      finding({ id: 'small', affectedSessions: 10 }),
      finding({ id: 'zero', affectedSessions: 0 }),
      finding({ id: 'large', affectedSessions: 500 }),
    ]);
    expect(result.ranked.map((r) => r.finding.id)).toEqual(['large', 'small', 'zero', 'unknown']);
  });

  it('breaks full ties by id, independent of input order', () => {
    const items = [finding({ id: 'c' }), finding({ id: 'a' }), finding({ id: 'b' })];
    expect(rankFindings(items).ranked.map((r) => r.finding.id)).toEqual(['a', 'b', 'c']);
    expect(rankFindings([...items].reverse()).ranked.map((r) => r.finding.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps insufficient findings out of the ranking and returns them as gaps', () => {
    const result = rankFindings([
      finding({ id: 'thin', priority: 'Critical', strength: 'insufficient' }),
      finding({ id: 'ok' }),
    ]);
    expect(result.ranked.map((r) => r.finding.id)).toEqual(['ok']);
    expect(result.insufficient.map((f) => f.id)).toEqual(['thin']);
  });

  it('returns empty results for no input', () => {
    const result = rankFindings([]);
    expect(result.ranked).toEqual([]);
    expect(result.insufficient).toEqual([]);
  });
});

describe('weakerStrength', () => {
  it('returns the weaker of two judgements, in either order', () => {
    expect(weakerStrength('sufficient', 'limited')).toBe('limited');
    expect(weakerStrength('limited', 'sufficient')).toBe('limited');
    expect(weakerStrength('limited', 'insufficient')).toBe('insufficient');
    expect(weakerStrength('insufficient', 'sufficient')).toBe('insufficient');
    expect(weakerStrength('sufficient', 'sufficient')).toBe('sufficient');
  });
});

describe('comparisonEvidence', () => {
  const STEP = { minimumSessions: 60, minimumOrders: null };

  it('supports a conclusion when both periods meet the floor', () => {
    const evidence = comparisonEvidence({ sessions: 60, orders: null }, { sessions: 200, orders: null }, STEP);
    expect(evidence.strength).toBe('sufficient');
    expect(evidence.supportsConclusion).toBe(true);
  });

  it('does not support one when only the current period is thin', () => {
    const evidence = comparisonEvidence({ sessions: 59, orders: null }, { sessions: 200, orders: null }, STEP);
    expect(evidence.strength).toBe('insufficient');
    expect(evidence.supportsConclusion).toBe(false);
  });

  it('does not support one when only the previous period is thin', () => {
    const evidence = comparisonEvidence({ sessions: 200, orders: null }, { sessions: 59, orders: null }, STEP);
    expect(evidence.supportsConclusion).toBe(false);
  });

  it('does not support one when both periods are thin, and keeps the raw samples', () => {
    const evidence = comparisonEvidence({ sessions: 8, orders: null }, { sessions: 10, orders: null }, STEP);
    expect(evidence).toEqual({
      strength: 'insufficient',
      supportsConclusion: false,
      currentSample: { sessions: 8, orders: null },
      previousSample: { sessions: 10, orders: null },
      thresholds: STEP,
    });
  });

  it('supports a limited conclusion when orders are thin but sessions are not', () => {
    const evidence = comparisonEvidence({ sessions: 400, orders: 24 }, { sessions: 400, orders: 30 }, RATE);
    expect(evidence.strength).toBe('limited');
    expect(evidence.supportsConclusion).toBe(true);
  });

  it('does not support one without a previous period', () => {
    const evidence = comparisonEvidence({ sessions: 400, orders: 40 }, null, RATE);
    expect(evidence.strength).toBe('insufficient');
    expect(evidence.supportsConclusion).toBe(false);
  });
});
