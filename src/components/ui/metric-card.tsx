interface MetricCardProps {
  label: string;
  /** Already formatted by the domain layer — components never compute metrics. */
  value: string;
  /** How the number is defined, so the figure is explainable on sight. */
  definition: string;
  testId: string;
}

export function MetricCard({
  label,
  value,
  definition,
  testId,
}: MetricCardProps) {
  return (
    <div
      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4"
      data-testid={testId}
      // Lets a test count metric cards without also matching their value nodes.
      data-metric-card=""
    >
      <dt className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
        {label}
      </dt>
      {/* The definition lives inside the <dd>, not beside it: a <dl> item may
          contain only <dt>/<dd> pairs, and a stray <p> breaks the list
          structure a screen reader walks. */}
      <dd data-testid={`${testId}-value-group`}>
        <span
          className="mt-2 block text-2xl font-semibold tabular-nums"
          data-testid={`${testId}-value`}
        >
          {value}
        </span>
        <span className="mt-2 block text-xs text-[var(--color-ink-muted)]">
          {definition}
        </span>
      </dd>
    </div>
  );
}
