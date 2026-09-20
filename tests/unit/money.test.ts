import { describe, expect, it } from 'vitest';
import { apportionCents, assertCents, formatCents, sumCents } from '@/domain/money';

describe('cents integrity', () => {
  it('rejects fractional amounts at the boundary', () => {
    expect(() => assertCents(19.99)).toThrow(TypeError);
  });

  it('sums without floating point drift', () => {
    const tenCentsTimesThree = sumCents([10, 10, 10]);
    expect(tenCentsTimesThree).toBe(30);
    // The same arithmetic in dollars-as-floats does not hold exactly.
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
  });
});

describe('apportionCents', () => {
  it('splits a discount so the parts add back to the total', () => {
    const parts = apportionCents(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(sumCents(parts)).toBe(1000);
  });

  it('weights the split by line value', () => {
    const parts = apportionCents(500, [3000, 1000]);
    expect(parts).toEqual([375, 125]);
    expect(sumCents(parts)).toBe(500);
  });

  it('returns zeroes when all weights are zero', () => {
    expect(apportionCents(500, [0, 0])).toEqual([0, 0]);
  });

  it('returns an empty list for no lines', () => {
    expect(apportionCents(500, [])).toEqual([]);
  });
});

describe('formatCents', () => {
  it('formats at the display edge only', () => {
    expect(formatCents(32900)).toBe('$329.00');
    expect(formatCents(0)).toBe('$0.00');
  });
});
