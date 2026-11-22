import { isWithinWindow, type DateWindow } from './demo-window';
import type { Product } from './types';

const RULES = [
  { id: 'shipping', label: 'Shipping', pattern: /\b(delivery|shipment|tracking|parcel|carrier)\b/i },
  { id: 'fit', label: 'Sizing & fit', pattern: /\b(sizing|size chart|too (small|large|tight)|does not fit)\b/i },
  { id: 'quality', label: 'Product quality', pattern: /\b(broken|damaged|torn|leaks?|defective)\b/i },
  { id: 'returns', label: 'Returns & exchanges', pattern: /\b(returns?|exchange|refund)\b/i },
  { id: 'information', label: 'Product information', pattern: /\b(specifications|materials?|dimensions|product page|setup instructions)\b/i },
] as const;

export const SUPPORT_CATEGORIES = [
  ...RULES.map(({ id, label }) => ({ id, label })),
  { id: 'unclassified', label: 'Needs classification' } as const,
];

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]['id'];
export type SupportProduct = Pick<Product, 'id' | 'sku' | 'title'>;

export interface SupportTicket {
  id: string;
  createdAt: string;
  summary: string;
  sku?: string;
  productName?: string;
}

export interface ClassifiedTicket extends SupportTicket {
  category: SupportCategory;
  product: SupportProduct | null;
}

export interface SupportFilters {
  productId: string | null;
  category: SupportCategory | null;
}

export const UNMATCHED_SUPPORT_PRODUCT = 'unmatched';

export function supportCategory(value: string | null): SupportCategory | null {
  return SUPPORT_CATEGORIES.find(({ id }) => id === value)?.id ?? null;
}

export function supportCategoryLabel(id: SupportCategory): string {
  return SUPPORT_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function classifySupportTicket(ticket: SupportTicket, catalogue: readonly SupportProduct[]): ClassifiedTicket {
  const categories = RULES.filter(({ pattern }) => pattern.test(ticket.summary));
  const sku = normalized(ticket.sku ?? '');
  const name = normalized(ticket.productName ?? '');
  const matches = catalogue.filter((product) =>
    sku !== '' ? normalized(product.sku) === sku : name !== '' && normalized(product.title) === name,
  );
  return {
    ...ticket,
    category: categories.length === 1 ? categories[0]!.id : 'unclassified',
    product: matches.length === 1 ? matches[0]! : null,
  };
}

/** Operators can type a unique name prefix. Ticket attribution always uses exact matches. */
export function supportProductForQuery(query: string, catalogue: readonly SupportProduct[]): SupportProduct | null {
  const key = normalized(query);
  if (key === '') return null;
  const exact = catalogue.filter(({ id, sku, title }) => [id, sku, title].some((value) => normalized(value) === key));
  if (exact.length > 0) return exact.length === 1 ? exact[0]! : null;
  const prefixes = catalogue.filter(({ title }) => normalized(title).startsWith(`${key} `));
  return prefixes.length === 1 ? prefixes[0]! : null;
}

export function summarizeSupport(
  tickets: readonly SupportTicket[],
  catalogue: readonly SupportProduct[],
  window: DateWindow,
  filters: SupportFilters,
) {
  // Identical fixture IDs describe the same case. The first record supplies its attributes.
  const unique = new Map<string, SupportTicket>();
  for (const ticket of tickets) if (!unique.has(ticket.id)) unique.set(ticket.id, ticket);
  const rows = [...unique.values()]
    .filter((ticket) => isWithinWindow(ticket.createdAt, window))
    .map((ticket) => classifySupportTicket(ticket, catalogue))
    .filter((ticket) =>
      (filters.category === null || ticket.category === filters.category) &&
      (filters.productId === null || (ticket.product?.id ?? UNMATCHED_SUPPORT_PRODUCT) === filters.productId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

  const groups = new Map<string, { product: SupportProduct; tickets: ClassifiedTicket[] }>();
  for (const ticket of rows) {
    if (ticket.product === null) continue;
    const group = groups.get(ticket.product.id) ?? { product: ticket.product, tickets: [] };
    group.tickets.push(ticket);
    groups.set(ticket.product.id, group);
  }

  const ranking = [...groups.values()].map(({ product, tickets: cases }) => ({
    product,
    count: cases.length,
    categories: SUPPORT_CATEGORIES.map(({ id }) => ({
      id,
      count: cases.filter((ticket) => ticket.category === id).length,
    })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
  })).sort((a, b) => b.count - a.count || a.product.sku.localeCompare(b.product.sku));

  return { window, filters, rows, ranking, unmatched: rows.filter((ticket) => ticket.product === null).length };
}
