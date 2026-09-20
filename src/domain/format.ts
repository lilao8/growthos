import { DEMO_LOCALE, formatCents } from './money';
import type { MetricValue } from './metrics';

/**
 * Display formatting. Lives in the domain so that "what N/A means" is decided
 * once: a null metric is a metric with no valid denominator, and every screen
 * must render it the same way rather than inventing a zero.
 */

export const NOT_AVAILABLE = 'N/A';

export function formatInteger(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_AVAILABLE;
  return new Intl.NumberFormat(DEMO_LOCALE).format(value);
}

/** Ratios are 0–1 internally; percentages appear only here. */
export function formatPercent(value: MetricValue, fractionDigits = 2): string {
  if (value === null) return NOT_AVAILABLE;
  return new Intl.NumberFormat(DEMO_LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Money metrics are computed in cents and may be fractional (e.g. AOV). */
export function formatMoneyMetric(value: MetricValue): string {
  if (value === null) return NOT_AVAILABLE;
  return formatCents(Math.round(value));
}

/** ROAS and similar multiples. Not used until Dispatch 6; defined once here. */
export function formatMultiple(value: MetricValue, fractionDigits = 2): string {
  if (value === null) return NOT_AVAILABLE;
  return `${value.toFixed(fractionDigits)}x`;
}

export function formatDateRange(start: string, end: string): string {
  return `${start} — ${end}`;
}
