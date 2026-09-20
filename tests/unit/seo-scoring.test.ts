import { describe, expect, it } from 'vitest';
import {
  addTallies,
  averageScore,
  EMPTY_TALLY,
  scoreChecks,
  tallyChecks,
} from '@/domain/seo-audit/engine';
import type { AuditCheck, CheckStatus } from '@/domain/types';

function check(status: CheckStatus, ruleId = `rule-${status}`): AuditCheck {
  return {
    ruleId,
    status,
    severity: 'info',
    message: 'm',
    explanation: 'e',
    recommendation: 'r',
    evidence: null,
    points: null,
  };
}

describe('scoreChecks', () => {
  it('scores all passes as 100', () => {
    const result = scoreChecks([check('pass'), check('pass', 'b')]);
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(1);
  });

  it('scores all errors as 0, which is a real zero and not N/A', () => {
    const result = scoreChecks([check('error'), check('error', 'b')]);
    expect(result.score).toBe(0);
    expect(result.coverage).toBe(1);
  });

  it('weights a warning as half a pass', () => {
    expect(scoreChecks([check('warning'), check('warning', 'b')]).score).toBe(50);
  });

  it('weights every evaluable check equally', () => {
    // 1 + 0.5 + 0 = 1.5 over 3 checks = 50.
    const result = scoreChecks([
      check('pass'),
      check('warning'),
      check('error'),
    ]);
    expect(result.score).toBe(50);
  });

  it('excludes unknown checks from the score and reports lower coverage', () => {
    // Two passes out of two evaluable = 100, with two of four assessed.
    const result = scoreChecks([
      check('pass', 'a'),
      check('pass', 'b'),
      check('unknown', 'c'),
      check('unknown', 'd'),
    ]);
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(0.5);
    expect(result.evaluableCount).toBe(2);
    expect(result.totalCount).toBe(4);
  });

  it('returns null when nothing can be evaluated, never 0', () => {
    const result = scoreChecks([check('unknown'), check('unknown', 'b')]);
    expect(result.score).toBeNull();
    expect(result.coverage).toBe(0);
  });

  it('returns null for no checks at all', () => {
    expect(scoreChecks([]).score).toBeNull();
  });

  it('rounds to a whole number and stays within 0–100', () => {
    // 2 passes and 1 error over 3 = 66.67 -> 67.
    const result = scoreChecks([check('pass'), check('pass', 'b'), check('error')]);
    expect(result.score).toBe(67);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('tallyChecks', () => {
  it('counts each status separately without double counting', () => {
    const tally = tallyChecks([
      check('error', 'a'),
      check('error', 'b'),
      check('warning', 'c'),
      check('pass', 'd'),
      check('unknown', 'e'),
    ]);
    expect(tally).toEqual({ critical: 2, warnings: 1, passed: 1, unknown: 1 });
  });

  it('adds tallies across pages', () => {
    const a = tallyChecks([check('error'), check('pass', 'x')]);
    const b = tallyChecks([check('warning'), check('pass', 'y')]);
    expect(addTallies(a, b)).toEqual({
      critical: 1,
      warnings: 1,
      passed: 2,
      unknown: 0,
    });
  });

  it('is a no-op to add the empty tally', () => {
    const a = tallyChecks([check('error')]);
    expect(addTallies(a, EMPTY_TALLY)).toEqual(a);
  });
});

describe('averageScore', () => {
  it('averages page scores and reports how many pages it covers', () => {
    expect(averageScore([100, 50])).toEqual({ average: 75, pagesCounted: 2 });
  });

  it('excludes unscored pages rather than treating them as zero', () => {
    expect(averageScore([100, null, 50])).toEqual({
      average: 75,
      pagesCounted: 2,
    });
  });

  it('returns null when no page has a score', () => {
    expect(averageScore([null, null])).toEqual({
      average: null,
      pagesCounted: 0,
    });
    expect(averageScore([])).toEqual({ average: null, pagesCounted: 0 });
  });

  it('rounds the mean', () => {
    expect(averageScore([100, 100, 50]).average).toBe(83);
  });
});
