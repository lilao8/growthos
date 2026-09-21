'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { formatCents } from '@/domain/money';
import {
  formatInteger,
  formatMoneyMetric,
  formatPercent,
  NOT_AVAILABLE,
} from '@/domain/format';
import {
  EMPTY_QUERY,
  isQueryActive,
  type ProductQuery,
} from '@/domain/product-filters';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  type ProductCategory,
  type ProductStatus,
} from '@/domain/types';
import {
  loadProductList,
  type ProductListState,
  type ProductServiceDeps,
} from '@/services/product-service';
import {
  resolveStateRepository,
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/** Catalogue screen: search, combined filters and the derived-metric table. */

const NOT_AUDITED = 'Not audited';

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
  // Toggle buttons rather than hidden checkboxes inside labels: the control the
  // user sees is the control that receives focus and clicks, and aria-pressed
  // announces the on/off state without relying on the fill colour.
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
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusTone(status: ProductStatus): 'neutral' | 'muted' {
  return status === 'active' ? 'neutral' : 'muted';
}

export function ProductsView({ mode }: { mode: DemoDataMode | null }) {
  const deps = useMemo<ProductServiceDeps>(
    () => ({
      state: resolveStateRepository(mode),
      traffic: resolveTrafficRepository(mode),
    }),
    [mode],
  );

  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<readonly ProductCategory[]>([]);
  const [statuses, setStatuses] = useState<readonly ProductStatus[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProductListState | null>(null);

  const query: ProductQuery = useMemo(
    () => ({ search, categories, statuses }),
    [search, categories, statuses],
  );

  useEffect(() => {
    let cancelled = false;
    void loadProductList(deps, query).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, query, attempt]);

  const clearFilters = () => {
    setSearch(EMPTY_QUERY.search);
    setCategories([]);
    setStatuses([]);
  };

  const filtersActive = isQueryActive(query);

  // The note card below sits outside the ready guard, so this is derived
  // once here rather than reaching into a narrowed state further down.
  const anyAudited =
    state?.status === 'ready' &&
    state.rows.some((row) => row.seoScore !== null || row.geoScore !== null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Find a product"
          description="Search matches title, SKU, slug and primary keyword. Filters combine as an intersection."
        >
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            data-testid="clear-filters"
            className="rounded-md border border-[var(--color-line-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
          >
            Clear filters
          </button>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="product-search"
              className="text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase"
            >
              Search
            </label>
            <input
              id="product-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. ridgeline, NT-TENT, sleeping bag"
              data-testid="product-search"
              className="mt-2 w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            />
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:gap-10">
            <FilterGroup
              legend="Category"
              options={PRODUCT_CATEGORIES}
              selected={categories}
              onToggle={(value) =>
                setCategories((current) => toggle(current, value))
              }
              testIdPrefix="filter-category"
            />
            <FilterGroup
              legend="Status"
              options={PRODUCT_STATUSES}
              selected={statuses}
              onToggle={(value) =>
                setStatuses((current) => toggle(current, value))
              }
              testIdPrefix="filter-status"
            />
          </div>
        </CardBody>
      </Card>

      {state === null && <LoadingBlock label="Loading the product catalogue." />}

      {state?.status === 'error' && (
        <ErrorBlock
          title="Could not load products"
          message={state.message}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}

      {state?.status === 'empty' && (
        <EmptyBlock
          title={
            state.queryActive
              ? 'No products match these filters'
              : 'The catalogue is empty'
          }
          description={
            state.queryActive
              ? `None of the ${state.totalCount} products match the current search and filters. Clear the filters to see the whole catalogue.`
              : 'There are no products in the demo catalogue.'
          }
        />
      )}

      {state?.status === 'ready' && (
        <Card>
          <CardHeader
            title="Catalogue"
            description={`Showing ${state.rows.length} of ${state.totalCount} products. Conversion rate and revenue are demo figures for the 90-day window.`}
          >
            <span
              className="text-xs text-[var(--color-ink-muted)]"
              data-testid="result-count"
            >
              {state.rows.length} / {state.totalCount}
            </span>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <TableWrapper>
              <Table caption="Product catalogue with derived demo metrics">
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Product</TH>
                    <TH>Category</TH>
                    <TH>Price</TH>
                    <TH>Inventory</TH>
                    <TH>SEO</TH>
                    <TH>GEO</TH>
                    <TH>Conv. rate</TH>
                    <TH>Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {state.rows.map(({ product, metrics, seoScore, geoScore, seoStale, geoStale }) => (
                    <TR key={product.id}>
                      <TD>
                        <span className="font-mono text-xs">{product.sku}</span>
                      </TD>
                      <TH scope="row">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/products/${product.id}`}
                            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                            data-testid={`product-link-${product.sku}`}
                          >
                            {product.title}
                          </Link>
                          {product.status !== 'active' && (
                            <Badge tone={statusTone(product.status)}>
                              {product.status}
                            </Badge>
                          )}
                        </span>
                      </TH>
                      <TD>{product.category}</TD>
                      <TD numeric>{formatCents(product.priceCents)}</TD>
                      <TD numeric>{formatInteger(product.inventory)}</TD>
                      <TD>
                        {seoScore === null ? (
                          <span className="text-[var(--color-ink-muted)]">
                            {NOT_AUDITED}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 tabular-nums">
                            {seoScore}
                            {seoStale && <Badge tone="muted">Stale</Badge>}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {geoScore === null ? (
                          <span className="text-[var(--color-ink-muted)]">
                            {NOT_AUDITED}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 tabular-nums">
                            {geoScore}
                            {geoStale && <Badge tone="muted">Stale</Badge>}
                          </span>
                        )}
                      </TD>
                      <TD numeric>
                        {metrics.conversionRate === null
                          ? NOT_AVAILABLE
                          : formatPercent(metrics.conversionRate)}
                      </TD>
                      <TD numeric>{formatMoneyMetric(metrics.revenueCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="How to read this table" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              {/* Conditional, because the unconditional version contradicted
                  the table the moment an audit had been run — and it named
                  internal build stages, which mean nothing to a reader. */}
              <strong>SEO and GEO</strong>{' '}
              {anyAudited ? (
                <>
                  come from the SEO and GEO audit engines. A score is only shown
                  once that page has actually been audited; &ldquo;
                  {NOT_AUDITED}&rdquo; means no audit has run for it, and
                  &ldquo;(stale)&rdquo; means the page changed after its last
                  one.
                </>
              ) : (
                <>
                  read &ldquo;{NOT_AUDITED}&rdquo; because no audit has run yet.
                  Run one from the SEO or GEO module; a number here before then
                  would be invented.
                </>
              )}
            </li>
            <li>
              <strong>Conversion rate</strong> is sessions that purchased this
              product ÷ sessions that viewed it. One session can view several
              products, so these rates share sessions and must not be added or
              averaged across products.
            </li>
            <li>
              <strong>Revenue</strong> is apportioned by order line, so product
              revenue sums exactly to order revenue. Demo data, 90-day window.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
