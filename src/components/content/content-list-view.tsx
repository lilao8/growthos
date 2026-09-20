'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '@/components/ui/status-block';
import {
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import {
  isContentQueryActive,
  type ContentQuery,
} from '@/domain/content/content-filters';
import { OPPORTUNITY_WEIGHTS } from '@/domain/content/opportunity';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  FUNNEL_STAGES_CONTENT,
  SEARCH_INTENTS,
  type ContentFunnelStage,
  type ContentStatus,
  type ContentType,
  type Product,
  type SearchIntent,
} from '@/domain/types';
import {
  createContentIdea,
  loadContentList,
  setContentStatus,
  type ContentListState,
  type ContentServiceDeps,
} from '@/services/content-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import {
  BLANK_CONTENT_FORM,
  ContentForm,
  type ContentFormValues,
} from './content-form';

/** The content plan: filters, the prioritised list, and creating a new idea. */

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
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  testIdPrefix: string;
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
                  : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ContentListView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<ContentServiceDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<readonly ContentStatus[]>([]);
  const [intents, setIntents] = useState<readonly SearchIntent[]>([]);
  const [stages, setStages] = useState<readonly ContentFunnelStage[]>([]);
  const [types, setTypes] = useState<readonly ContentType[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ContentListState | null>(null);
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const query: ContentQuery = useMemo(
    () => ({ search, statuses, intents, stages, types }),
    [search, statuses, intents, stages, types],
  );

  useEffect(() => {
    let cancelled = false;
    void loadContentList(deps, query).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, query, attempt]);

  // The product list is only needed to populate the target-product picker.
  useEffect(() => {
    let cancelled = false;
    void deps.state.load().then((result) => {
      if (!cancelled) setProducts(result.state.products);
    });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const handleCreate = useCallback(
    async (values: ContentFormValues) => {
      const result = await createContentIdea(deps, values);
      if (result.status === 'saved') reload();
      return result;
    },
    [deps, reload],
  );

  const handleStatusChange = useCallback(
    async (ideaId: string, next: string) => {
      setStatusMessage('');
      const result = await setContentStatus(deps, ideaId, next);
      if (result.status === 'saved') {
        setStatusMessage(`Moved to ${next}.`);
        reload();
        return;
      }
      setStatusMessage(
        result.status === 'error'
          ? `${result.message} The status was not changed.`
          : 'That status is not valid. Nothing was changed.',
      );
    },
    [deps, reload],
  );

  const filtersActive = isContentQueryActive(query);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Plan"
          description="Search matches topic and keywords. Filters combine as an intersection."
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatuses([]);
                setIntents([]);
                setStages([]);
                setTypes([]);
              }}
              disabled={!filtersActive}
              data-testid="content-clear-filters"
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => setCreating((open) => !open)}
              aria-expanded={creating}
              data-testid="content-new"
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              New content idea
            </button>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="content-search"
              className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase"
            >
              Search
            </label>
            <input
              id="content-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. sleeping bag, r value, warranty"
              data-testid="content-search"
              className="mt-2 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FilterGroup
              legend="Status"
              options={CONTENT_STATUSES}
              selected={statuses}
              onToggle={(value) => setStatuses((current) => toggle(current, value))}
              testIdPrefix="content-filter-status"
            />
            <FilterGroup
              legend="Search intent"
              options={SEARCH_INTENTS}
              selected={intents}
              onToggle={(value) => setIntents((current) => toggle(current, value))}
              testIdPrefix="content-filter-intent"
            />
            <FilterGroup
              legend="Funnel stage"
              options={FUNNEL_STAGES_CONTENT}
              selected={stages}
              onToggle={(value) => setStages((current) => toggle(current, value))}
              testIdPrefix="content-filter-stage"
            />
            <FilterGroup
              legend="Content type"
              options={CONTENT_TYPES}
              selected={types}
              onToggle={(value) => setTypes((current) => toggle(current, value))}
              testIdPrefix="content-filter-type"
            />
          </div>
        </CardBody>
      </Card>

      {creating && (
        <Card>
          <CardHeader
            title="New content idea"
            description="Nothing is published anywhere — this is a planning record."
          />
          <CardBody>
            <ContentForm
              initial={BLANK_CONTENT_FORM}
              products={products}
              submitLabel="Create content idea"
              onSubmit={handleCreate}
              onCancel={() => setCreating(false)}
            />
          </CardBody>
        </Card>
      )}

      {state === null && <LoadingBlock label="Loading the content plan." />}

      {state?.status === 'error' && (
        <ErrorBlock
          title="Could not load the content plan"
          message={state.message}
          onRetry={reload}
        />
      )}

      {state?.status === 'empty' && (
        <EmptyBlock
          title={
            state.queryActive
              ? 'No content ideas match these filters'
              : 'The content plan is empty'
          }
          description={
            state.queryActive
              ? `None of the ${state.totalCount} ideas match the current search and filters. Clear the filters to see the whole plan.`
              : 'Create the first content idea to start planning.'
          }
        />
      )}

      {state?.status === 'ready' && (
        <Card>
          <CardHeader
            title="Content ideas"
            description="Ordered by opportunity score — the top row is the one to write next."
          >
            <span
              className="text-xs text-[var(--color-ink-muted)]"
              data-testid="content-result-count"
            >
              {state.rows.length} / {state.totalCount}
            </span>
          </CardHeader>
          <CardBody className="px-0 py-0">
            {statusMessage !== '' && (
              <p
                role="status"
                data-testid="content-status-message"
                className="px-5 pt-4 text-sm"
              >
                {statusMessage}
              </p>
            )}
            <TableWrapper>
              <Table caption="Content plan ordered by opportunity score">
                <THead>
                  <TR>
                    <TH>Opportunity</TH>
                    <TH>Topic</TH>
                    <TH>Primary keyword</TH>
                    <TH>Intent</TH>
                    <TH>Stage</TH>
                    <TH>Type</TH>
                    <TH>Target product</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {state.rows.map((row) => (
                    <TR key={row.idea.id}>
                      <TD numeric>
                        <span
                          className="font-semibold"
                          data-testid={`opportunity-${row.idea.id}`}
                        >
                          {row.breakdown.score}
                        </span>
                      </TD>
                      <TH scope="row">
                        <Link
                          href={`/content/${row.idea.id}`}
                          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                          data-testid={`content-link-${row.idea.id}`}
                        >
                          {row.idea.topic}
                        </Link>
                      </TH>
                      <TD>{row.idea.primaryKeyword}</TD>
                      <TD>{row.idea.searchIntent}</TD>
                      <TD>{row.idea.funnelStage}</TD>
                      <TD>{row.idea.contentType}</TD>
                      <TD>
                        {row.product !== null ? (
                          <Link
                            href={`/products/${row.product.id}`}
                            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                          >
                            {row.product.title}
                          </Link>
                        ) : row.danglingProduct ? (
                          <Badge tone="muted">Missing product</Badge>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]">—</span>
                        )}
                      </TD>
                      <TD>
                        <label className="sr-only" htmlFor={`status-${row.idea.id}`}>
                          Status for {row.idea.topic}
                        </label>
                        <select
                          id={`status-${row.idea.id}`}
                          value={row.idea.status}
                          onChange={(event) =>
                            void handleStatusChange(row.idea.id, event.target.value)
                          }
                          data-testid={`status-select-${row.idea.id}`}
                          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                        >
                          {CONTENT_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="How the opportunity score works" />
        <CardBody>
          <p className="text-sm">
            score = {OPPORTUNITY_WEIGHTS.seoOpportunity} × SEO opportunity +{' '}
            {OPPORTUNITY_WEIGHTS.geoOpportunity} × GEO opportunity +{' '}
            {OPPORTUNITY_WEIGHTS.commercialIntent} × commercial intent +{' '}
            {OPPORTUNITY_WEIGHTS.productRelevance} × product relevance
          </p>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              All four inputs are on a 0–100 scale and the weights add to 1, so
              the score is also 0–100.
            </li>
            <li>
              <strong>SEO and GEO opportunity are entered by an editor.</strong>{' '}
              They are a judgement about a topic, not the SEO or GEO audit scores
              — those measure a page that already exists — and not search volume,
              because this project connects to no keyword tool.
            </li>
            <li>
              Commercial intent is the only derived input: Transactional 100,
              Commercial 80, Informational 40, Navigational 30.
            </li>
            <li>
              A high score says a topic looks worth writing. It does not predict
              traffic or revenue.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
