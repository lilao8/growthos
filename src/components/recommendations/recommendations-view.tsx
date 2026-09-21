'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '@/components/ui/status-block';
import { formatInteger } from '@/domain/format';
import {
  EFFORT_SCALE,
  IMPACT_SCALE,
  PRIORITY_ORDER,
  QUICK_WIN_EFFORT_MAX,
  QUICK_WIN_IMPACT_MIN,
  SOURCE_LABELS,
} from '@/domain/recommendations/config';
import type { RecommendationQuery } from '@/domain/recommendations/sorting';
import {
  RECOMMENDATION_QUADRANTS,
  RECOMMENDATION_SOURCES,
  RECOMMENDATION_STATUSES,
  type Priority,
  type Recommendation,
  type RecommendationQuadrant,
  type RecommendationSource,
  type RecommendationStatus,
} from '@/domain/types';
import {
  loadRecommendations,
  setRecommendationStatus,
  type RecommendationDeps,
  type RecommendationState,
} from '@/services/recommendation-service';
import {
  resolveStateRepository,
  resolveAmazonAdsRepository,
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/** The task centre: everything the rule engines currently report, in one list. */

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function FilterGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
  testIdPrefix,
  labels,
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  testIdPrefix: string;
  labels?: Record<string, string>;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase"
        id={`${testIdPrefix}-legend`}
      >
        {legend}
      </p>
      <div
        role="group"
        aria-labelledby={`${testIdPrefix}-legend`}
        className="mt-2 flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const pressed = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(option)}
              data-testid={`${testIdPrefix}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              className={`rounded-md border px-2.5 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                pressed
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              {labels?.[option] ?? option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecommendationCard({
  item,
  onToggleDone,
  busy,
}: {
  item: Recommendation;
  onToggleDone: (item: Recommendation) => void;
  busy: boolean;
}) {
  const done = item.status === 'Done';
  return (
    <article
      data-testid={`rec-${item.id}`}
      data-source={item.source}
      data-category={item.category}
      data-priority={item.priority}
      data-status={item.status}
      className={`rounded-md border border-[var(--color-line)] px-4 py-3 ${done ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={item.priority === 'Critical' ? 'accent' : 'muted'}>
            {item.priority}
          </Badge>
          <Badge tone="muted">{SOURCE_LABELS[item.source]}</Badge>
          <Badge tone="muted">{item.quadrant}</Badge>
          {done && <Badge tone="neutral">Done</Badge>}
        </div>
      </div>

      {/* One source can cover several kinds of work — Amazon produces both
          listing-quality and advertising tasks — so the category says which
          engine raised this, not just which module. */}
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        {item.category}
      </p>

      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{item.reason}</p>
      <p className="mt-2 text-sm">
        <span className="font-medium">Suggested action: </span>
        {item.suggestedAction}
      </p>
      {item.evidence !== null && (
        <p
          className="mt-2 font-mono text-xs break-all text-[var(--color-ink-muted)]"
          data-testid={`rec-evidence-${item.id}`}
        >
          Evidence: {item.evidence}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
        <span>
          Impact {item.impact}/5 · Effort {item.effort}/5 · {item.ruleVersion}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          // The domain stores a plain string: it knows nothing about Next's
          // typed routes, and should not. The cast belongs here, at the edge.
          href={item.link as Route}
          data-testid={`rec-link-${item.id}`}
          className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {item.relatedProductId === null
            ? 'Open the source module'
            : 'Open the page this is about'}
        </Link>
        {item.relatedProductId !== null && (
          <Link
            href={`/products/${item.relatedProductId}`}
            data-testid={`rec-product-${item.id}`}
            className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Open the product
          </Link>
        )}
        <button
          type="button"
          onClick={() => onToggleDone(item)}
          disabled={busy}
          data-testid={`rec-toggle-${item.id}`}
          className="rounded-md border border-[var(--color-line-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
        >
          {done ? 'Mark as not done' : 'Mark as done'}
        </button>
      </div>
    </article>
  );
}

export function RecommendationsView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<RecommendationDeps>(
    () => ({
      state: resolveStateRepository(mode),
      traffic: resolveTrafficRepository(mode),
      ads: resolveAmazonAdsRepository(mode),
    }),
    [mode],
  );

  const [priorities, setPriorities] = useState<readonly Priority[]>([]);
  const [sources, setSources] = useState<readonly RecommendationSource[]>([]);
  const [quadrants, setQuadrants] = useState<readonly RecommendationQuadrant[]>(
    [],
  );
  const [statuses, setStatuses] = useState<readonly RecommendationStatus[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RecommendationState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const query: RecommendationQuery = useMemo(
    () => ({ priorities, sources, quadrants, statuses }),
    [priorities, sources, quadrants, statuses],
  );

  useEffect(() => {
    let cancelled = false;
    void loadRecommendations(deps, query).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, query, attempt]);

  const handleToggle = useCallback(
    async (item: Recommendation) => {
      setBusyId(item.id);
      setMessage('');
      const next = item.status === 'Done' ? 'Open' : 'Done';
      const result = await setRecommendationStatus(deps, item.id, next);
      setBusyId(null);
      if (result.status === 'error') {
        setMessage(`${result.message} Nothing was changed.`);
        return;
      }
      setMessage(
        next === 'Done'
          ? 'Marked as done. This is saved and survives a refresh.'
          : 'Moved back to open.',
      );
      setAttempt((value) => value + 1);
    },
    [deps],
  );

  const clearFilters = (): void => {
    setPriorities([]);
    setSources([]);
    setQuadrants([]);
    setStatuses([]);
  };

  if (state === null) {
    return <LoadingBlock label="Collecting findings from every module." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load recommendations"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const { view } = state;

  return (
    <div className="flex flex-col gap-6" data-testid="recommendations-ready">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open tasks"
          value={formatInteger(view.tally.open)}
          definition="Findings the rule engines currently report and nobody has closed."
          testId="rec-open"
        />
        <MetricCard
          label="Critical"
          value={formatInteger(view.tally.byPriority.Critical)}
          definition="High impact and failing outright."
          testId="rec-critical"
        />
        <MetricCard
          label="Quick wins"
          value={formatInteger(view.tally.byQuadrant['Quick Win'])}
          definition={`Impact ${QUICK_WIN_IMPACT_MIN}+ with effort ${QUICK_WIN_EFFORT_MAX} or less. An estimate, not a promise.`}
          testId="rec-quick-wins"
        />
        <MetricCard
          label="Done"
          value={formatInteger(view.tally.done)}
          definition="Closed by someone here. The decision is what gets saved."
          testId="rec-done"
        />
      </dl>

      <Card>
        <CardHeader
          title="Filter"
          description="Filters combine as an intersection; an empty selection means no constraint."
        >
          <button
            type="button"
            onClick={clearFilters}
            disabled={!view.queryActive}
            data-testid="rec-clear-filters"
            className="rounded-md border border-[var(--color-line-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
          >
            Clear filters
          </button>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FilterGroup
            legend="Priority"
            options={PRIORITY_ORDER}
            selected={priorities}
            onToggle={(value) => setPriorities((current) => toggle(current, value))}
            testIdPrefix="rec-filter-priority"
          />
          <FilterGroup
            legend="Source"
            options={RECOMMENDATION_SOURCES}
            selected={sources}
            onToggle={(value) => setSources((current) => toggle(current, value))}
            testIdPrefix="rec-filter-source"
            labels={SOURCE_LABELS}
          />
          <FilterGroup
            legend="Impact vs effort"
            options={RECOMMENDATION_QUADRANTS}
            selected={quadrants}
            onToggle={(value) => setQuadrants((current) => toggle(current, value))}
            testIdPrefix="rec-filter-quadrant"
          />
          <FilterGroup
            legend="Status"
            options={RECOMMENDATION_STATUSES}
            selected={statuses}
            onToggle={(value) => setStatuses((current) => toggle(current, value))}
            testIdPrefix="rec-filter-status"
          />
        </CardBody>
      </Card>

      {state.status === 'empty' ? (
        <EmptyBlock
          title="No findings from any module"
          description="Nothing is being reported. Run the SEO and GEO audits, or check that the demo data loaded — an empty list here means the rules found no problems, not that they were skipped."
        />
      ) : view.items.length === 0 ? (
        <EmptyBlock
          title="No tasks match these filters"
          description={`None of the ${view.allActive.length} open findings match the current selection. Clear the filters to see them all.`}
        />
      ) : (
        <Card>
          <CardHeader
            title="Tasks"
            description="Ordered by priority, then quick wins, then least effort first."
          >
            <span
              className="text-xs text-[var(--color-ink-muted)]"
              data-testid="rec-result-count"
            >
              {view.items.length} / {view.allActive.length}
            </span>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {message !== '' && (
              <p role="status" data-testid="rec-message" className="text-sm">
                {message}
              </p>
            )}
            {view.items.map((item) => (
              <RecommendationCard
                key={item.id}
                item={item}
                onToggleDone={(value) => void handleToggle(value)}
                busy={busyId === item.id}
              />
            ))}
          </CardBody>
        </Card>
      )}

      {view.quietSources.length > 0 && (
        <Card>
          <CardHeader title="Modules reporting nothing" />
          <CardBody>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {view.quietSources
                .map((source) => SOURCE_LABELS[source as RecommendationSource])
                .join(', ')}{' '}
              produced no findings. For the audits that usually means they have
              not been run yet — an empty list is not the same as a clean bill of
              health.
            </p>
          </CardBody>
        </Card>
      )}

      {view.historical.length > 0 && (
        <Card>
          <CardHeader
            title="Completed, source no longer reporting"
            description="Kept so the record of the decision survives. Nothing here is outstanding."
          />
          <CardBody className="flex flex-col gap-3">
            {view.historical.map((item) => (
              <p
                key={item.id}
                data-testid={`rec-historical-${item.id}`}
                className="rounded-md border border-[var(--color-line)] px-4 py-3 text-sm text-[var(--color-ink-muted)]"
              >
                {item.reason} {item.evidence}
              </p>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="How this list is built" />
        <CardBody className="flex flex-col gap-3">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              Every item comes from a rule engine that already exists — the SEO
              and GEO audits, the content opportunity model, the channel report
              and the funnel. Nothing is recalculated here, so if an engine
              changes its mind this list changes with it.
            </li>
            <li>
              <strong>Impact and effort are 1–5 estimates</strong>, recorded per
              rule. They say how this project rates a class of fix, not what any
              particular fix will return. A quick win is a guess that something
              is cheap and worth doing, <strong>never a promise of revenue</strong>.
            </li>
            <li>
              A task&apos;s identity is its rule plus the thing it was raised
              against, so regenerating the list never duplicates it and a
              completed task stays completed.
            </li>
            <li>
              Channels below the minimum traffic produce no recommendation at
              all: a rate built on noise is not a finding.
            </li>
          </ul>

          <details className="rounded-md border border-[var(--color-line)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              What the 1–5 scales mean
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-4 text-xs text-[var(--color-ink-muted)] sm:grid-cols-2">
              <div>
                <p className="font-medium text-[var(--color-ink)]">Impact</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {([1, 2, 3, 4, 5] as const).map((score) => (
                    <li key={score}>
                      {score}: {IMPACT_SCALE[score]}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-[var(--color-ink)]">Effort</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {([1, 2, 3, 4, 5] as const).map((score) => (
                    <li key={score}>
                      {score}: {EFFORT_SCALE[score]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}
