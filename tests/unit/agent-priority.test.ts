import { describe, expect, it } from 'vitest';
import {
  AGENT_PRIORITY_VERSION,
  downgrade,
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
