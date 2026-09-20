import { describe, expect, it } from 'vitest';
import {
  formatInteger,
  formatMoneyMetric,
  formatMultiple,
  formatPercent,
  NOT_AVAILABLE,
} from '@/domain/format';

describe('formatting null metrics', () => {
  it('renders N/A rather than 0 for every null metric', () => {
    expect(formatInteger(null)).toBe(NOT_AVAILABLE);
    expect(formatPercent(null)).toBe(NOT_AVAILABLE);
    expect(formatMoneyMetric(null)).toBe(NOT_AVAILABLE);
    expect(formatMultiple(null)).toBe(NOT_AVAILABLE);
  });

  it('renders a genuine zero as zero', () => {
    expect(formatInteger(0)).toBe('0');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatMoneyMetric(0)).toBe('$0.00');
  });
});

describe('formatPercent', () => {
  it('converts an internal 0–1 ratio to a percentage at the display edge', () => {
    expect(formatPercent(0.0258)).toBe('2.58%');
    expect(formatPercent(1)).toBe('100.00%');
  });
});

describe('formatMoneyMetric', () => {
  it('rounds a fractional cents metric such as AOV', () => {
    expect(formatMoneyMetric(30_199.5)).toBe('$302.00');
  });

  it('groups thousands', () => {
    expect(formatMoneyMetric(1_234_567)).toBe('$12,345.67');
  });
});

describe('formatInteger', () => {
  it('groups thousands', () => {
    expect(formatInteger(2_713)).toBe('2,713');
  });
});
