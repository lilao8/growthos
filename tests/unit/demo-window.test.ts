import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildWindow,
  daysBetweenInclusive,
  DEMO_AS_OF,
  DEMO_WINDOW,
  isIsoDate,
  isWithinWindow,
} from '@/domain/demo-window';

describe('isIsoDate', () => {
  it('accepts a real UTC day', () => {
    expect(isIsoDate('2026-08-31')).toBe(true);
  });

  it('rejects a well-formed but non-existent day', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
  });

  it('rejects other shapes', () => {
    expect(isIsoDate('2026-8-31')).toBe(false);
    expect(isIsoDate('31/08/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('window arithmetic', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts a single day as one day', () => {
    expect(daysBetweenInclusive('2026-08-31', '2026-08-31')).toBe(1);
  });
});

describe('buildWindow', () => {
  it('includes the end day in every range', () => {
    const week = buildWindow(7, DEMO_AS_OF);
    expect(week.end).toBe(DEMO_AS_OF);
    expect(week.start).toBe('2026-08-25');
    expect(daysBetweenInclusive(week.start, week.end)).toBe(7);
  });

  it('shares the same end day across 7, 30 and 90 day ranges', () => {
    for (const days of [7, 30, 90]) {
      const window = buildWindow(days, DEMO_AS_OF);
      expect(window.end).toBe(DEMO_AS_OF);
      expect(daysBetweenInclusive(window.start, window.end)).toBe(days);
    }
  });

  it('rejects a non-positive length', () => {
    expect(() => buildWindow(0)).toThrow(RangeError);
  });

  it('the 90 day demo window is inclusive of both endpoints', () => {
    expect(DEMO_WINDOW.start).toBe('2026-06-03');
    expect(DEMO_WINDOW.end).toBe('2026-08-31');
    expect(daysBetweenInclusive(DEMO_WINDOW.start, DEMO_WINDOW.end)).toBe(90);
  });
});

describe('isWithinWindow', () => {
  it('includes both endpoints and excludes neighbours', () => {
    expect(isWithinWindow(DEMO_WINDOW.start, DEMO_WINDOW)).toBe(true);
    expect(isWithinWindow(DEMO_WINDOW.end, DEMO_WINDOW)).toBe(true);
    expect(isWithinWindow('2026-06-02', DEMO_WINDOW)).toBe(false);
    expect(isWithinWindow('2026-09-01', DEMO_WINDOW)).toBe(false);
  });
});
