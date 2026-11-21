import { addDays, buildWindow, type DateWindow } from '../demo-window';

/**
 * The reporting window and the period it can honestly be compared with.
 *
 * "This period fell" is only a claim when there is a previous period of the
 * same length, immediately before it, entirely inside the data. A previous
 * window that runs off the start of the data set would compare 30 days against
 * fewer days of data and call the difference a decline, so it is refused and
 * reported as a gap instead.
 */

export type WindowGap = 'no-prior-window';

export interface ComparableWindows {
  current: DateWindow;
  /** Same length, ending the day before `current` starts. Null when not covered. */
  previous: DateWindow | null;
  gap: WindowGap | null;
}

export function comparableWindows(
  days: number,
  end: string,
  coverage: DateWindow,
): ComparableWindows {
  const current = buildWindow(days, end);
  const previous = buildWindow(days, addDays(current.start, -1));
  const covered = previous.start >= coverage.start;
  return covered
    ? { current, previous, gap: null }
    : { current, previous: null, gap: 'no-prior-window' };
}
