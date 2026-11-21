import { safeRatio, type MetricValue } from '../metrics';

/**
 * Two-period comparison of one metric.
 *
 * Direction is arithmetic, not significance: a change of one order on a small
 * base is reported as `down` just as faithfully as a large fall, which is why
 * every comparison travels with the sample sizes of both windows. Missing
 * values on either side make the direction `unknown` rather than a guess.
 */

export type ChangeDirection = 'up' | 'down' | 'flat' | 'unknown';

export interface MetricComparison {
  current: MetricValue;
  previous: MetricValue;
  /** current − previous, in the metric's own unit. */
  absoluteChange: MetricValue;
  /** (current − previous) ÷ previous. Null when previous is 0 or missing. */
  relativeChange: MetricValue;
  direction: ChangeDirection;
}

export function compareValues(
  current: MetricValue,
  previous: MetricValue,
): MetricComparison {
  if (current === null || previous === null) {
    return {
      current,
      previous,
      absoluteChange: null,
      relativeChange: null,
      direction: 'unknown',
    };
  }
  const absoluteChange = current - previous;
  return {
    current,
    previous,
    absoluteChange,
    relativeChange: safeRatio(absoluteChange, previous),
    direction:
      absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat',
  };
}
