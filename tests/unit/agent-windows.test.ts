import { describe, expect, it } from 'vitest';
import { comparableWindows } from '@/domain/agent/windows';
import { compareValues } from '@/domain/agent/comparison';
import { DEMO_AS_OF, DEMO_WINDOW, buildWindow } from '@/domain/demo-window';

describe('comparableWindows', () => {
  it('pairs the 30-day window with the 30 days immediately before it', () => {
    const result = comparableWindows(30, DEMO_AS_OF, DEMO_WINDOW);
    expect(result.current).toEqual({ start: '2026-08-02', end: '2026-08-31', days: 30 });
    expect(result.previous).toEqual({ start: '2026-07-03', end: '2026-08-01', days: 30 });
    expect(result.gap).toBeNull();
  });

  it('pairs the 7-day window with the previous 7 days', () => {
    const result = comparableWindows(7, DEMO_AS_OF, DEMO_WINDOW);
    expect(result.previous).toEqual({ start: '2026-08-18', end: '2026-08-24', days: 7 });
  });

  it('refuses a previous period that runs off the start of the data', () => {
    const result = comparableWindows(90, DEMO_AS_OF, DEMO_WINDOW);
    expect(result.current).toEqual(DEMO_WINDOW);
    expect(result.previous).toBeNull();
    expect(result.gap).toBe('no-prior-window');
  });

  it('accepts a previous period that starts exactly on the first covered day', () => {
    const coverage = buildWindow(60, DEMO_AS_OF);
    const result = comparableWindows(30, DEMO_AS_OF, coverage);
    expect(result.previous?.start).toBe(coverage.start);
    expect(result.gap).toBeNull();
  });

  it('refuses one day short of coverage', () => {
    const coverage = buildWindow(59, DEMO_AS_OF);
    expect(comparableWindows(30, DEMO_AS_OF, coverage).gap).toBe('no-prior-window');
  });
});

describe('compareValues', () => {
  it('reports a fall with absolute and relative change', () => {
    const result = compareValues(80, 100);
    expect(result.absoluteChange).toBe(-20);
    expect(result.relativeChange).toBeCloseTo(-0.2);
    expect(result.direction).toBe('down');
  });

  it('reports a rise', () => {
    expect(compareValues(0.03, 0.02).direction).toBe('up');
  });

  it('reports no change as flat, with a real zero change', () => {
    const result = compareValues(5, 5);
    expect(result.direction).toBe('flat');
    expect(result.absoluteChange).toBe(0);
    expect(result.relativeChange).toBe(0);
  });

  it('has no relative change over a zero previous value, but still a direction', () => {
    const result = compareValues(4, 0);
    expect(result.absoluteChange).toBe(4);
    expect(result.relativeChange).toBeNull();
    expect(result.direction).toBe('up');
  });

  it.each([
    [null, 1],
    [1, null],
    [null, null],
  ] as const)('is unknown when a side is missing (%s vs %s)', (current, previous) => {
    const result = compareValues(current, previous);
    expect(result.direction).toBe('unknown');
    expect(result.absoluteChange).toBeNull();
    expect(result.relativeChange).toBeNull();
  });
});
