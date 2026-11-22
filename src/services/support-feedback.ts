import { buildWindow, type DemoRangeDays } from '@/domain/demo-window';
import { summarizeSupport, type SupportFilters } from '@/domain/support-feedback';
import { RANGE_PARAM } from '@/domain/url-params';
import { buildCatalogueProducts } from '@/fixtures/demo-catalogue';
import { DEMO_SUPPORT_TICKETS } from '@/fixtures/demo-support';

export const SUPPORT_PRODUCT_PARAM = 'product';
export const SUPPORT_CATEGORY_PARAM = 'category';
export const SUPPORT_CATALOGUE = buildCatalogueProducts().map(({ id, sku, title }) => ({ id, sku, title }));
export const SUPPORT_DEFAULT_RANGE = 30;

export function supportFeedback(range: DemoRangeDays, filters: SupportFilters) {
  return summarizeSupport(DEMO_SUPPORT_TICKETS, SUPPORT_CATALOGUE, buildWindow(range), filters);
}

export function supportFeedbackHref(range: DemoRangeDays, filters: SupportFilters): `/support?${string}` {
  const params = new URLSearchParams({ [RANGE_PARAM]: String(range) });
  if (filters.productId !== null) params.set(SUPPORT_PRODUCT_PARAM, filters.productId);
  if (filters.category !== null) params.set(SUPPORT_CATEGORY_PARAM, filters.category);
  return `/support?${params.toString()}`;
}
