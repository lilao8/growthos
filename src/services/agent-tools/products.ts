import { z } from 'zod';
import { productHref } from '@/domain/agent/links';
import { makeRef, type MetricRef, type RefScope } from '@/domain/agent/refs';
import type { DemoRangeDays } from '@/domain/demo-window';
import type { ProductMetrics } from '@/domain/product-metrics';
import type { Channel, Product } from '@/domain/types';
import { windowForRange } from '@/services/analytics-service';
import { loadProductList, type ProductRow } from '@/services/product-service';
import type { DemoStateRepository, StateLoadResult } from '@/repositories/types';
import { channelSchema, rangeSchema, TRAFFIC_SOURCE } from './shared';
import type { AgentTool, Gap, ProvidedState, ToolOutcome } from './types';

/**
 * Product performance by SKU.
 *
 * Product conversion is sessions that bought the product ÷ sessions that viewed
 * it. A session can view several products, so these figures do not add up
 * across products, and there is no per-product funnel (see the funnel tool).
 * Metrics come from the product service — the same code path the product page
 * uses — over the requested window and channel.
 */

const MAX_PRODUCTS = 20;

export const productPerformanceInput = z.strictObject({
  range: rangeSchema,
  channel: channelSchema,
  products: z
    .array(z.string().min(1).max(80))
    .max(MAX_PRODUCTS)
    .default([])
    .describe('Product ids, SKUs or names to look up; a name matches every product whose title, SKU or keyword contains it. Empty = the top products by revenue.'),
  query: z
    .string()
    .max(80)
    .nullable()
    .default(null)
    .describe('Case-insensitive match on title, SKU or primary keyword.'),
  limit: z.number().int().min(1).max(MAX_PRODUCTS).default(10),
});

export type ProductPerformanceInput = z.infer<typeof productPerformanceInput>;

export interface ProductPerformanceRow {
  productId: string;
  sku: string;
  title: string;
  status: Product['status'];
  metrics: ProductMetrics;
}

export interface ProductPerformanceData {
  range: DemoRangeDays;
  channel: Channel | null;
  rows: ProductPerformanceRow[];
  /** Requested ids or SKUs that match nothing in the catalogue. */
  notFound: string[];
}

const TOOL = 'products';

/** Wraps a provided value as a read-only repository the product service accepts. */
function readOnlyState(state: ProvidedState): DemoStateRepository {
  const result: StateLoadResult = { status: 'loaded', state: state.value, error: null };
  return {
    load: async () => result,
    save: async () => {
      throw new Error('Agent tools are read-only.');
    },
    reset: async () => {
      throw new Error('Agent tools are read-only.');
    },
  };
}

function matches(product: Product, needle: string): boolean {
  const text = needle.toLowerCase();
  return (
    product.title.toLowerCase().includes(text) ||
    product.sku.toLowerCase().includes(text) ||
    product.primaryKeyword.toLowerCase().includes(text)
  );
}

function refsFor(row: ProductPerformanceRow, scope: RefScope, href: string): MetricRef[] {
  const m = row.metrics;
  return [
    makeRef(scope, 'view_sessions', { label: `${row.title} view sessions`, value: m.viewSessions, unit: 'count', definition: 'product_view_sessions', href }),
    makeRef(scope, 'purchase_sessions', { label: `${row.title} purchasing sessions`, value: m.purchaseSessions, unit: 'count', definition: 'product_purchase_sessions', href }),
    makeRef(scope, 'conversion_rate', { label: `${row.title} product conversion`, value: m.conversionRate, unit: 'ratio', definition: 'product_conversion_rate', href }),
    makeRef(scope, 'revenue', { label: `${row.title} revenue`, value: m.revenueCents, unit: 'cents', definition: 'product_revenue', href }),
  ];
}

export const productPerformanceTool: AgentTool<ProductPerformanceInput, ProductPerformanceData> = {
  name: 'get_product_performance',
  description:
    'Per-product view sessions, purchasing sessions, product conversion rate and apportioned revenue for a window (optionally one channel). Look up by product id or SKU, by text query, or get the top products by revenue. No per-product funnel exists. Read-only.',
  readOnly: true,
  input: productPerformanceInput,
  async execute(input, context): Promise<ToolOutcome<ProductPerformanceData>> {
    if (context.state === null) {
      return { status: 'error', message: 'No catalogue was provided, so products cannot be looked up.' };
    }

    const window = windowForRange(input.range);
    // loadProductList already turns repository failures into an error state.
    const result = await loadProductList({
      state: readOnlyState(context.state),
      traffic: context.traffic,
      window,
      channel: input.channel,
    });
    if (result.status === 'error') return { status: 'error', message: result.message };

    const catalogue: ProductRow[] = result.rows;
    const notFound: string[] = [];
    const matchNotes: string[] = [];
    let selected = catalogue;
    if (input.products.length > 0) {
      selected = [];
      for (const key of input.products) {
        // An exact id or SKU wins; otherwise a name, SKU or keyword that
        // contains the key ("Ridgeline" names a product line, not a SKU).
        const exact = catalogue.find(
          (candidate) =>
            candidate.product.id === key ||
            candidate.product.sku.toLowerCase() === key.toLowerCase(),
        );
        const rows = exact === undefined ? catalogue.filter((candidate) => matches(candidate.product, key)) : [exact];
        if (rows.length === 0) notFound.push(key);
        else if (exact === undefined) matchNotes.push(`"${key}" is a partial name match: ${rows.length} product${rows.length === 1 ? '' : 's'} matched by title, SKU or keyword.`);
        for (const row of rows) if (!selected.includes(row)) selected.push(row);
      }
    } else if (input.query !== null) {
      const query = input.query;
      selected = catalogue.filter((row) => matches(row.product, query));
      if (selected.length === 0) notFound.push(input.query);
      else matchNotes.push(`"${query}" is a partial name match: ${selected.length} product${selected.length === 1 ? '' : 's'} matched by title, SKU or keyword.`);
    }

    const rows: ProductPerformanceRow[] = [...selected]
      .sort((a, b) => b.metrics.revenueCents - a.metrics.revenueCents || (a.product.id < b.product.id ? -1 : 1))
      .slice(0, input.products.length > 0 ? MAX_PRODUCTS : input.limit)
      .map((row) => ({
        productId: row.product.id,
        sku: row.product.sku,
        title: row.product.title,
        status: row.product.status,
        metrics: row.metrics,
      }));

    if (matchNotes.length > 0 && rows.length < selected.length) {
      matchNotes.push(`Showing ${rows.length} of ${selected.length} matched products, by revenue.`);
    } else if (matchNotes.length > 0) {
      matchNotes.push(`Showing all ${rows.length}.`);
    }

    const refs = rows.flatMap((row) =>
      refsFor(
        row,
        { tool: TOOL, window, channel: input.channel, productId: row.productId },
        productHref(row.productId, input.range, input.channel),
      ),
    );

    const gaps: Gap[] = notFound.map((key) => ({
      code: 'product-not-found' as const,
      message: `No product in the catalogue matches "${key}".`,
    }));
    for (const row of rows) {
      if (row.metrics.viewSessions === 0) {
        gaps.push({
          code: 'zero-sessions',
          message: `${row.title} (${row.sku}) had no view sessions between ${window.start} and ${window.end}${input.channel === null ? '' : ` from ${input.channel}`}; its conversion rate is N/A.`,
        });
      }
    }

    const data: ProductPerformanceData = { range: input.range, channel: input.channel, rows, notFound };
    const meta = {
      window,
      previousWindow: null,
      dataSources: [TRAFFIC_SOURCE, `${context.state.source}:catalogue`],
      refs,
      auditRefs: [],
      gaps,
      notes: matchNotes,
    };
    return rows.length === 0
      ? { status: 'empty', data, meta, findings: [] }
      : { status: 'ok', data, meta, findings: [] };
  },
};
