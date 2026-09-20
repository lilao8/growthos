/**
 * Deterministic pseudo-random source for demo data.
 *
 * Demo data must be identical on every machine and every reload, so no code path
 * may call Math.random(). Generators take an explicit seed and are pure: the same
 * seed always yields the same sequence.
 */

export const DEMO_SEED = 20260831;

export interface RandomSource {
  /** Next float in [0, 1). */
  next(): number;
}

/** mulberry32 — small, fast, well-distributed enough for demo data. */
export function createRandomSource(seed: number): RandomSource {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`Seed must be an integer, got ${seed}`);
  }
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Integer in [min, max], inclusive. */
export function randomInt(source: RandomSource, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new TypeError('Bounds must be integers');
  }
  if (max < min) {
    throw new RangeError(`max (${max}) must be >= min (${min})`);
  }
  return min + Math.floor(source.next() * (max - min + 1));
}

/** Picks one element. Throws on an empty list rather than returning undefined. */
export function pick<T>(source: RandomSource, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('Cannot pick from an empty list');
  }
  const item = items[randomInt(source, 0, items.length - 1)];
  if (item === undefined) {
    throw new RangeError('Picked index out of range');
  }
  return item;
}
