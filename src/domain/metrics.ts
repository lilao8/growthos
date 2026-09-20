import type { Cents } from './types';

/**
 * Metric primitives. Every metric in GrowthOS routes through `safeRatio`, which
 * returns null for a zero or missing denominator. Null means "N/A" in the UI —
 * never Infinity, never NaN, never a silent 0. A zero numerator over a valid
 * denominator is a real 0 and is reported as such.
 *
 * Ratios are 0–1 internally and formatted as percentages at the display edge.
 * Aggregates always sum numerators and denominators first, then divide: averaging
 * pre-computed ratios weights small days the same as large ones and is wrong.
 */

export type MetricValue = number | null;

export function safeRatio(numerator: number, denominator: number): MetricValue {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Purchasing sessions / sessions. MVP allows at most one order per session. */
export function conversionRate(
  purchaseSessions: number,
  sessions: number,
): MetricValue {
  return safeRatio(purchaseSessions, sessions);
}

/** Average order value, in cents. */
export function averageOrderValue(
  revenueCents: Cents,
  orders: number,
): MetricValue {
  return safeRatio(revenueCents, orders);
}

/** Customer acquisition cost, in cents. Independent of order count. */
export function customerAcquisitionCost(
  acquisitionSpendCents: Cents,
  newCustomers: number,
): MetricValue {
  return safeRatio(acquisitionSpendCents, newCustomers);
}

/**
 * Return on ad spend, as a multiple. Channels with no ad spend return null and
 * are shown as N/A — a channel that never spent has no ROAS, not an infinite one.
 */
export function returnOnAdSpend(
  paidAttributedRevenueCents: Cents,
  adSpendCents: Cents,
): MetricValue {
  return safeRatio(paidAttributedRevenueCents, adSpendCents);
}

/** Next-stage sessions / previous-stage sessions. */
export function stageConversion(
  nextStageSessions: number,
  previousStageSessions: number,
): MetricValue {
  return safeRatio(nextStageSessions, previousStageSessions);
}

/** 1 − stage conversion. Null propagates rather than becoming 1. */
export function dropOffRate(
  nextStageSessions: number,
  previousStageSessions: number,
): MetricValue {
  const converted = stageConversion(nextStageSessions, previousStageSessions);
  return converted === null ? null : 1 - converted;
}

/** Sums numerators and denominators before dividing. */
export function aggregateRatio(
  parts: readonly { numerator: number; denominator: number }[],
): MetricValue {
  let numerator = 0;
  let denominator = 0;
  for (const part of parts) {
    numerator += part.numerator;
    denominator += part.denominator;
  }
  return safeRatio(numerator, denominator);
}

/** Distinct count by key — users must be de-duplicated, never summed. */
export function distinctCount<T>(
  items: readonly T[],
  key: (item: T) => string,
): number {
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(key(item));
  }
  return seen.size;
}
