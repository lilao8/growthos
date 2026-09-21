/**
 * Small inline-SVG charts.
 *
 * Deliberately hand-written rather than pulled from a charting library: these
 * two shapes are all the project needs, and a dependency of that size would be
 * mostly unused code.
 *
 * Accessibility contract: nothing is available only as a picture. Every chart
 * sits beside a real table carrying the same numbers and a one-line text
 * summary, so the drawing itself carries no information a reader would miss.
 *
 * The line chart is therefore `aria-hidden`: an unlabelled `role="img"` is
 * announced as bare "image", which is worse than silence. The bar chart is a
 * real list of labelled rows — its labels are text, so it stays readable and
 * must NOT be given `role="img"`, which would strip the list semantics from
 * its items.
 */

export interface TrendSeriesPoint {
  label: string;
  value: number;
}

const WIDTH = 720;
const HEIGHT = 180;
const PADDING = 4;

export function TrendChart({ points }: { points: readonly TrendSeriesPoint[] }) {
  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const stepX =
    points.length === 1 ? 0 : (WIDTH - PADDING * 2) / (points.length - 1);

  const coords = points.map((point, index) => {
    const x = PADDING + index * stepX;
    const y = HEIGHT - PADDING - (point.value / max) * (HEIGHT - PADDING * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = `M${coords.join(' L')}`;
  const area = `${line} L${(PADDING + (points.length - 1) * stepX).toFixed(1)},${HEIGHT - PADDING} L${PADDING},${HEIGHT - PADDING} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-44 w-full"
      data-testid="trend-chart"
    >
      <path d={area} fill="var(--color-accent)" opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
}

/** Horizontal bars, used for channel share. Labels live in the table below. */
export function BarChart({ data }: { data: readonly BarDatum[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((datum) => datum.value), 1);

  return (
    <ul className="flex flex-col gap-2" data-testid="bar-chart">
      {data.map((datum) => (
        <li key={datum.label} className="flex items-center gap-3 text-xs">
          <span className="w-28 shrink-0 truncate text-[var(--color-ink-muted)]">
            {datum.label}
          </span>
          {/* The bar itself is decoration: the label is text and the exact
              figure is in the table below. */}
          <span
            aria-hidden="true"
            className="h-3 min-w-0 flex-1 rounded-sm bg-[var(--color-surface-muted)]"
          >
            <span
              className="block h-3 rounded-sm bg-[var(--color-accent)]"
              style={{ width: `${Math.max(1, (datum.value / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
