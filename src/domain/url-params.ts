import {
  buildWindow,
  DEMO_RANGE_DAYS,
  DEMO_WINDOW,
  isIsoDate,
  type DateWindow,
  type DemoRangeDays,
} from './demo-window';
import { CHANNELS, type Channel, type IsoDate } from './types';

/**
 * URL parameters shared by pages and by the links that point at them.
 *
 * A link is only evidence if the page it opens computes the same window and
 * scope the link was built for. Pages parse their query with these functions
 * and links are built from the same constants, so the two cannot disagree.
 * Unknown values fall back rather than throw: a hand-edited URL should open a
 * working page, not an error.
 */

export const RANGE_PARAM = 'range';
export const CHANNEL_PARAM = 'channel';

export function parseRangeParam(
  value: string | null | undefined,
  fallback: DemoRangeDays,
): DemoRangeDays {
  // Absent becomes '', and Number('') is 0, which is not a supported range.
  const parsed = Number(value ?? '');
  return (DEMO_RANGE_DAYS as readonly number[]).includes(parsed)
    ? (parsed as DemoRangeDays)
    : fallback;
}

/** null means "all channels" — both when absent and when unrecognised. */
export function parseChannelParam(
  value: string | null | undefined,
): Channel | null {
  const text = value ?? '';
  return (CHANNELS as readonly string[]).includes(text)
    ? (text as Channel)
    : null;
}

/** Reads a single string out of a Next.js searchParams record. */
export function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === 'string') return value;
  return null;
}

export const END_PARAM = 'end';

/**
 * The last day of a window, for links to a comparison period.
 *
 * Accepted only when the whole window it implies lies inside the data; any
 * other value — malformed, outside the data, or a window that would start
 * before the data does — falls back to the demo's end date. Pages then show the
 * window they actually used, so a rejected value is visible, not silent.
 */
export function parseEndParam(
  value: string | null | undefined,
  range: number,
  coverage: DateWindow = DEMO_WINDOW,
): IsoDate {
  const text = value ?? '';
  if (!isIsoDate(text) || text > coverage.end) return coverage.end;
  const window = buildWindow(range, text);
  return window.start >= coverage.start ? text : coverage.end;
}

export const PREVIEW_PARAM = 'preview';

/** Only the exact value `1` turns the read-only audit preview on. */
export function parsePreviewParam(value: string | null | undefined): boolean {
  return value === '1';
}
