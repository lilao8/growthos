import { describe, expect, it } from 'vitest';
import { createRandomSource, DEMO_SEED, pick, randomInt } from '@/domain/seed';

function take(seed: number, count: number): number[] {
  const source = createRandomSource(seed);
  return Array.from({ length: count }, () => source.next());
}

describe('createRandomSource', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(DEMO_SEED, 8)).toEqual(take(DEMO_SEED, 8));
  });

  it('produces a different sequence for a different seed', () => {
    expect(take(DEMO_SEED, 8)).not.toEqual(take(DEMO_SEED + 1, 8));
  });

  it('stays inside [0, 1)', () => {
    for (const value of take(DEMO_SEED, 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('respects inclusive bounds', () => {
    const source = createRandomSource(DEMO_SEED);
    for (let i = 0; i < 500; i += 1) {
      const value = randomInt(source, 3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it('handles a single-value range', () => {
    expect(randomInt(createRandomSource(DEMO_SEED), 4, 4)).toBe(4);
  });

  it('rejects an inverted range', () => {
    expect(() => randomInt(createRandomSource(DEMO_SEED), 7, 3)).toThrow(
      RangeError,
    );
  });
});

describe('pick', () => {
  it('always returns a member of the list', () => {
    const source = createRandomSource(DEMO_SEED);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i += 1) {
      expect(items).toContain(pick(source, items));
    }
  });

  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pick(createRandomSource(DEMO_SEED), [])).toThrow(RangeError);
  });
});
