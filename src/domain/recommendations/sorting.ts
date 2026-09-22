import { PRIORITY_ORDER } from './config';
import type {
  Priority,
  Recommendation,
  RecommendationQuadrant,
  RecommendationSource,
  RecommendationStatus,
} from '../types';

/** Filtering and ordering for the task list. Pure, so the order is testable. */

export interface RecommendationQuery {
  priorities: readonly Priority[];
  sources: readonly RecommendationSource[];
  quadrants: readonly RecommendationQuadrant[];
  statuses: readonly RecommendationStatus[];
}

export const EMPTY_RECOMMENDATION_QUERY: RecommendationQuery = {
  priorities: [],
  sources: [],
  quadrants: [],
  statuses: [],
};

export function isRecommendationQueryActive(
  query: RecommendationQuery,
): boolean {
  return (
    query.priorities.length > 0 ||
    query.sources.length > 0 ||
    query.quadrants.length > 0 ||
    query.statuses.length > 0
  );
}

export function filterRecommendations(
  items: readonly Recommendation[],
  query: RecommendationQuery,
): Recommendation[] {
  return items.filter((item) => {
    if (query.priorities.length > 0 && !query.priorities.includes(item.priority)) {
      return false;
    }
    if (query.sources.length > 0 && !query.sources.includes(item.source)) {
      return false;
    }
    if (query.quadrants.length > 0 && !query.quadrants.includes(item.quadrant)) {
      return false;
    }
    if (query.statuses.length > 0 && !query.statuses.includes(item.status)) {
      return false;
    }
    return true;
  });
}

/**
 * Open work first, then ignored findings, then completed ones.
 *
 * Ignored sits between the two on purpose: a completed task is finished, but
 * an ignored one is a standing decision someone may want to revisit, so it
 * stays closer to the work than to the archive. Then priority, the Quick Win
 * corner, and effort ascending so the cheapest of equals comes first. The id
 * breaks any remaining tie, keeping the order stable across re-runs.
 */
const STATUS_ORDER: Record<RecommendationStatus, number> = {
  Open: 0,
  Ignored: 1,
  Done: 2,
};

export function sortRecommendations(
  items: readonly Recommendation[],
): Recommendation[] {
  return [...items].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;

    // Within the ignored group, anything whose evidence has moved on since the
    // decision comes first — that is the one worth a second look.
    if (a.status === 'Ignored' && b.status === 'Ignored') {
      const review = (item: Recommendation): number =>
        item.ignore?.needsReview === true ? 0 : 1;
      const byReview = review(a) - review(b);
      if (byReview !== 0) return byReview;
    }

    const byPriority =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (byPriority !== 0) return byPriority;

    const quickWin = (item: Recommendation): number =>
      item.quadrant === 'Quick Win' ? 0 : 1;
    const byQuadrant = quickWin(a) - quickWin(b);
    if (byQuadrant !== 0) return byQuadrant;

    if (a.effort !== b.effort) return a.effort - b.effort;
    if (a.impact !== b.impact) return b.impact - a.impact;
    return a.id.localeCompare(b.id);
  });
}

export interface RecommendationTally {
  total: number;
  open: number;
  done: number;
  ignored: number;
  /** Ignored findings whose evidence has changed since the decision. */
  ignoredNeedingReview: number;
  /**
   * Priority and quadrant counts over OPEN findings only.
   *
   * These sit beside `open` in the same row of cards, so counting closed work
   * here would read as a contradiction: clearing every task would leave "Open
   * 0" next to "Critical 6". The question this row answers is how much is
   * still outstanding, and a finding somebody has done or deliberately set
   * aside is not outstanding. `total`, `done` and `ignored` remain available
   * for anything that needs the whole list.
   */
  byPriority: Record<Priority, number>;
  byQuadrant: Record<RecommendationQuadrant, number>;
}

export function tallyRecommendations(
  items: readonly Recommendation[],
): RecommendationTally {
  const byPriority: Record<Priority, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  const byQuadrant: Record<RecommendationQuadrant, number> = {
    'Quick Win': 0,
    Strategic: 0,
    'Low Priority': 0,
    Defer: 0,
  };

  let open = 0;
  let done = 0;
  let ignored = 0;
  let ignoredNeedingReview = 0;
  for (const item of items) {
    if (item.status === 'Done') done += 1;
    else if (item.status === 'Ignored') {
      ignored += 1;
      if (item.ignore?.needsReview === true) ignoredNeedingReview += 1;
    } else {
      open += 1;
      // Only open findings, so this row of counts stays one population.
      byPriority[item.priority] += 1;
      byQuadrant[item.quadrant] += 1;
    }
  }

  return {
    total: items.length,
    open,
    done,
    ignored,
    ignoredNeedingReview,
    byPriority,
    byQuadrant,
  };
}
