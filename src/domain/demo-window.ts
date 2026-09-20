import type { IsoDate } from './types';

/**
 * The demo data set ends on a fixed day. It is NOT "today": a seeded data set
 * presented as live data would be dishonest, so every screen shows the explicit
 * start and end date of the window it is reporting on.
 */
export const DEMO_AS_OF: IsoDate = '2026-08-31';

/** Selectable ranges. Each is inclusive of DEMO_AS_OF. */
export const DEMO_RANGE_DAYS = [7, 30, 90] as const;
export type DemoRangeDays = (typeof DEMO_RANGE_DAYS)[number];

export interface DateWindow {
  start: IsoDate;
  end: IsoDate;
  days: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  // Rejects real-looking but invalid days such as 2026-02-30.
  return toIsoDate(new Date(parsed)) === value;
}

export function toIsoDate(date: Date): IsoDate {
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const base = parseIsoDate(value);
  return toIsoDate(new Date(base.getTime() + days * MS_PER_DAY));
}

/** Inclusive day count between two dates. `start === end` is 1 day. */
export function daysBetweenInclusive(start: IsoDate, end: IsoDate): number {
  const from = parseIsoDate(start).getTime();
  const to = parseIsoDate(end).getTime();
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

/**
 * Builds an inclusive window ending on `end`. A 7-day window covers the end day
 * plus the 6 days before it, so every range shares the same endpoint.
 */
export function buildWindow(days: number, end: IsoDate = DEMO_AS_OF): DateWindow {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`Window length must be a positive integer, got ${days}`);
  }
  return { start: addDays(end, -(days - 1)), end, days };
}

export function isWithinWindow(date: IsoDate, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

/** The full demo data window, used by fixtures and generators. */
export const DEMO_WINDOW: DateWindow = buildWindow(90);
