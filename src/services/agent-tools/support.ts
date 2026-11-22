import { z } from 'zod';
import { makeRef, type MetricRef } from '@/domain/agent/refs';
import {
  SUPPORT_CATEGORIES,
  UNMATCHED_SUPPORT_PRODUCT,
  supportCategoryLabel,
  supportProductForQuery,
  type SupportFilters,
} from '@/domain/support-feedback';
import { SUPPORT_CATALOGUE, supportFeedback, supportFeedbackHref } from '@/services/support-feedback';
import { channelSchema, rangeSchema } from './shared';
import type { AgentTool, Gap } from './types';

export const SUPPORT_TOOL_NAME = 'get_support_feedback';

const inputSchema = z.strictObject({
  range: rangeSchema,
  channel: channelSchema,
  products: z.array(z.string().trim().min(1).max(80)).max(20).default([])
    .describe('Leave empty for the SKU ranking, or supply one SKU, product ID or name.'),
  category: z.literal(SUPPORT_CATEGORIES.map(({ id }) => id)).nullable().default(null),
});

interface SupportToolData {
  tickets: number;
  unmatched: number;
  ranking: ReturnType<typeof supportFeedback>['ranking'];
}

export const supportFeedbackTool: AgentTool<z.infer<typeof inputSchema>, SupportToolData> = {
  name: SUPPORT_TOOL_NAME,
  readOnly: true,
  description:
    'Count simulated customer support tickets by SKU and issue category. Returns the date window, count-ranked SKUs, and links to the matching tickets. Support tickets do not carry a marketing channel or order denominator. Read-only.',
  input: inputSchema,
  async execute(input) {
    if (input.channel !== null || input.products.length > 1) {
      return {
        status: 'unsupported',
        reason: 'Support tickets can be filtered for one SKU and issue category. They have no marketing channel attribution.',
        suggestion: 'Ask for all support tickets or one SKU without a channel.',
      };
    }

    const query = input.products[0];
    const product = query === undefined ? null : supportProductForQuery(query, SUPPORT_CATALOGUE);
    const filters: SupportFilters = { productId: product?.id ?? null, category: input.category };
    const report = supportFeedback(input.range, filters);
    const gaps: Gap[] = [];
    const refs: MetricRef[] = [];
    const meta = {
      window: report.window,
      previousWindow: null,
      dataSources: ['fixture:support (simulated NorthTrail support tickets)'],
      auditRefs: [],
      refs,
      gaps,
    };
    if (query !== undefined && product === null) {
      gaps.push({ code: 'product-not-found', message: 'No unique catalogue product matched. Try a full product name or an SKU.' });
      return { status: 'empty', data: { tickets: 0, unmatched: 0, ranking: [] }, meta, findings: [] };
    }

    function addCount(label: string, value: number, target: SupportFilters) {
      refs.push(makeRef(
        { tool: 'support', window: report.window, channel: null, productId: target.productId },
        target.category ?? 'tickets',
        { label, value, definition: 'support_tickets', unit: 'count', href: supportFeedbackHref(input.range, target) },
      ));
    }

    const categoryLabel = input.category === null ? 'support tickets' : `${supportCategoryLabel(input.category)} tickets`;
    if (product !== null || report.rows.length === 0) {
      addCount(product === null ? `Catalogue ${categoryLabel}` : `${product.title} · ${categoryLabel}`, report.rows.length, filters);
    }
    for (const row of report.ranking.slice(0, 3)) {
      if (product === null) addCount(`${row.product.title} · ${categoryLabel}`, row.count, { ...filters, productId: row.product.id });
      if (input.category !== null) continue;
      for (const category of row.categories.slice(0, 2)) {
        addCount(`${row.product.title} · ${supportCategoryLabel(category.id)} tickets`, category.count, {
          productId: row.product.id,
          category: category.id,
        });
      }
    }
    if (report.unmatched > 0) {
      addCount(`Unmatched SKU · ${categoryLabel}`, report.unmatched, { ...filters, productId: UNMATCHED_SUPPORT_PRODUCT });
    }
    if (report.rows.length === 0) {
      gaps.push({ code: 'no-support-tickets', message: 'No simulated tickets match this window and filter.', refIds: refs.map(({ refId }) => refId) });
    }
    if (report.ranking.length > 3) {
      meta.gaps.push({ code: 'support-ranking-limited', message: 'The answer shows the leading SKUs. The support feedback page has the complete ranking.' });
    }
    const data = { tickets: report.rows.length, unmatched: report.unmatched, ranking: report.ranking.slice(0, 3) };
    return report.rows.length === 0
      ? { status: 'empty', data, meta, findings: [] }
      : { status: 'ok', data, meta, findings: [] };
  },
};
