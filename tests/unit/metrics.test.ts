import { describe, expect, it } from 'vitest';
import {
  aggregateRatio,
  averageOrderValue,
  conversionRate,
  customerAcquisitionCost,
  distinctCount,
  dropOffRate,
  returnOnAdSpend,
  safeRatio,
  stageConversion,
} from '@/domain/metrics';

describe('safeRatio', () => {
  it('returns null for a zero denominator instead of Infinity', () => {
    expect(safeRatio(5, 0)).toBeNull();
  });

  it('returns 0 for a zero numerator over a valid denominator', () => {
    expect(safeRatio(0, 120)).toBe(0);
  });

  it('returns null rather than NaN when inputs are not finite', () => {
    expect(safeRatio(Number.NaN, 10)).toBeNull();
    expect(safeRatio(10, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('computes an ordinary ratio', () => {
    expect(safeRatio(30, 120)).toBe(0.25);
  });
});

describe('business metrics', () => {
  it('conversion rate is purchasing sessions over sessions', () => {
    expect(conversionRate(24, 1200)).toBe(0.02);
    expect(conversionRate(0, 0)).toBeNull();
  });

  it('AOV divides revenue by orders and is N/A with no orders', () => {
    expect(averageOrderValue(240_000, 24)).toBe(10_000);
    expect(averageOrderValue(0, 0)).toBeNull();
  });

  it('CAC uses new customers, not order count', () => {
    expect(customerAcquisitionCost(500_000, 40)).toBe(12_500);
    expect(customerAcquisitionCost(500_000, 0)).toBeNull();
  });

  it('ROAS is null for a channel with no ad spend', () => {
    expect(returnOnAdSpend(900_000, 300_000)).toBe(3);
    expect(returnOnAdSpend(900_000, 0)).toBeNull();
  });

  it('stage conversion and drop-off are complements', () => {
    expect(stageConversion(300, 1200)).toBe(0.25);
    expect(dropOffRate(300, 1200)).toBe(0.75);
  });

  it('drop-off propagates null rather than reporting a 100% loss', () => {
    expect(dropOffRate(0, 0)).toBeNull();
  });
});

describe('aggregateRatio', () => {
  it('sums numerators and denominators before dividing', () => {
    const parts = [
      { numerator: 1, denominator: 10 },
      { numerator: 89, denominator: 990 },
    ];
    // Averaging the two ratios would give ~0.095; the correct answer is 90/1000.
    expect(aggregateRatio(parts)).toBe(0.09);
  });

  it('returns null when every denominator is zero', () => {
    expect(
      aggregateRatio([
        { numerator: 0, denominator: 0 },
        { numerator: 0, denominator: 0 },
      ]),
    ).toBeNull();
  });

  it('returns null for an empty input', () => {
    expect(aggregateRatio([])).toBeNull();
  });
});

describe('distinctCount', () => {
  it('de-duplicates users across sessions', () => {
    const sessions = [
      { sessionId: 's1', userId: 'u1' },
      { sessionId: 's2', userId: 'u1' },
      { sessionId: 's3', userId: 'u2' },
    ];
    expect(distinctCount(sessions, (session) => session.userId)).toBe(2);
    expect(distinctCount(sessions, (session) => session.sessionId)).toBe(3);
  });
});
