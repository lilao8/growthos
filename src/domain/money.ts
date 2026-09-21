import type { Cents } from './types';

/**
 * Money is stored and summed as integer cents so that repeated addition never
 * drifts. Formatting to a currency string happens only at the display edge.
 */

const DEMO_CURRENCY = 'USD';
export const DEMO_LOCALE = 'en-US';

function isCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function assertCents(value: number, label = 'amount'): Cents {
  if (!isCents(value)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${value}`);
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    total += assertCents(value);
  }
  return total;
}

/**
 * Splits `total` across `weights` so the parts always add back up to `total`.
 * Used to apportion an order-level discount onto order lines without losing a
 * cent to rounding. Remainder cents go to the largest weights first.
 */
export function apportionCents(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, 'total');
  if (weights.length === 0) return [];
  if (weights.some((weight) => weight < 0)) {
    throw new RangeError('Weights must be non-negative');
  }

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) {
    return weights.map(() => 0);
  }

  const exact = weights.map((weight) => (total * weight) / weightTotal);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }
  return result;
}

export function formatCents(value: Cents): string {
  assertCents(value);
  return new Intl.NumberFormat(DEMO_LOCALE, {
    style: 'currency',
    currency: DEMO_CURRENCY,
  }).format(value / 100);
}
