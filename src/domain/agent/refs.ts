import type { DateWindow } from '../demo-window';
import type { MetricValue } from '../metrics';
import type { Channel } from '../types';

/**
 * Citable figures.
 *
 * Every key number a tool returns is wrapped in a ref with a deterministic id.
 * The answer validator (Dispatch 19) accepts a number only by ref, so a figure
 * the model writes itself has nothing to point at. The definition key names
 * the project's metric table, so "conversion rate" always means one thing.
 */

export const METRIC_DEFINITIONS = {
  sessions: 'Distinct sessions in the window.',
  orders: 'Distinct paid orders in the window, attributed to one channel each.',
  revenue:
    'Paid item amount minus discount; excludes tax, shipping and refunds (refunds are not modelled).',
  conversion_rate: 'Purchasing sessions ÷ sessions (at most one order per session).',
  average_order_value: 'Revenue ÷ orders.',
  cac: 'Acquisition spend ÷ new customers; independent of order count.',
  ad_spend: 'Media spend attributed to the channel in the window.',
  roas: 'Paid-attributed revenue ÷ ad spend; N/A for channels without ad spend.',
  stage_sessions: 'Distinct sessions that reached this funnel stage, in order.',
  stage_conversion: 'Sessions at the next stage ÷ sessions at this stage.',
  drop_off_rate: '1 − stage conversion.',
  overall_funnel_conversion: 'Purchasing sessions ÷ sessions, over the same population.',
  product_view_sessions: 'Distinct sessions that viewed this product.',
  product_purchase_sessions:
    'Distinct sessions whose order included this product. A session that bought several products counts once for each.',
  product_conversion_rate:
    'Sessions that bought this product ÷ sessions that viewed it. Not additive across products.',
  product_revenue: 'Order-line revenue apportioned to this product.',
  support_tickets: 'Distinct simulated support tickets, counted by creation date.',
  audit_check: 'One rule verdict from the versioned SEO or GEO engine.',
} as const;

export type MetricDefinitionKey = keyof typeof METRIC_DEFINITIONS;

export type MetricUnit = 'count' | 'ratio' | 'cents' | 'multiple';

export interface MetricRef {
  refId: string;
  label: string;
  value: MetricValue;
  unit: MetricUnit;
  definition: MetricDefinitionKey;
  window: DateWindow;
  channel: Channel | null;
  productId: string | null;
  /** Opens the page that shows this same figure. */
  href: string;
}

export interface RefScope {
  tool: string;
  window: DateWindow;
  channel: Channel | null;
  productId: string | null;
}

/**
 * Deterministic and readable: the same figure for the same scope always gets
 * the same id, across calls and across runs, so a replay can be checked.
 */
export function refId(scope: RefScope, metric: string): string {
  const channel = scope.channel ?? 'all';
  const product = scope.productId ?? 'all';
  return `${scope.tool}:${scope.window.start}..${scope.window.end}:${channel}:${product}:${metric}`;
}

export function makeRef(
  scope: RefScope,
  metric: string,
  fields: Omit<MetricRef, 'refId' | 'window' | 'channel' | 'productId'>,
): MetricRef {
  return {
    refId: refId(scope, metric),
    window: scope.window,
    channel: scope.channel,
    productId: scope.productId,
    ...fields,
  };
}
