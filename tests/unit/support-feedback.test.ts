import { describe, expect, it } from 'vitest';
import { buildWindow } from '@/domain/demo-window';
import { classifySupportTicket, summarizeSupport, supportProductForQuery, UNMATCHED_SUPPORT_PRODUCT, type SupportTicket } from '@/domain/support-feedback';

const tent = { id: 'tent-two', sku: 'TENT-2', title: 'Ridgeline 2P Backpacking Tent' };
const largerTent = { id: 'tent-three', sku: 'TENT-3', title: 'Ridgeline 3P Backpacking Tent' };
const catalogue = [tent, largerTent];
const base = { id: 'T-01', createdAt: '2026-08-02', summary: 'The parcel is still at the depot.' };

describe('support feedback', () => {
  it('matches an explicit SKU before a conflicting product name', () => {
    const ticket = classifySupportTicket({ ...base, sku: ' tent-2 ', productName: largerTent.title }, catalogue);
    expect(ticket).toMatchObject({ product: tent, category: 'shipping' });
    expect(classifySupportTicket({ ...base, sku: 'unknown', productName: tent.title }, catalogue).product).toBeNull();
  });

  it('requires a unique full name for attribution and distinguishes operator lookup', () => {
    expect(classifySupportTicket({ ...base, productName: tent.title }, catalogue).product).toEqual(tent);
    expect(classifySupportTicket({ ...base, productName: 'Ridgeline 2P' }, catalogue).product).toBeNull();
    expect(classifySupportTicket({ ...base, productName: tent.title }, [tent, { ...tent, id: 'duplicate-name' }]).product).toBeNull();
    expect(supportProductForQuery('Ridgeline', catalogue)).toBeNull();
    expect(supportProductForQuery('Ridgeline 2P', catalogue)).toEqual(tent);
  });

  it('flags overlapping categories and missing clues', () => {
    expect(classifySupportTicket({ ...base, summary: 'Asked for a refund after the item was damaged.' }, catalogue).category).toBe('unclassified');
    expect(classifySupportTicket({ ...base, summary: 'Asked for help.' }, catalogue).category).toBe('unclassified');
  });

  it('counts distinct cases at both window edges, ranks matching SKUs, and keeps unmatched separate', () => {
    const tickets: SupportTicket[] = [
      { ...base, sku: tent.sku },
      { ...base, sku: tent.sku },
      { ...base, id: 'T-02', createdAt: '2026-08-31', sku: tent.sku },
      { ...base, id: 'T-03', sku: largerTent.sku },
      { ...base, id: 'T-04', productName: 'Ridgeline' },
      { ...base, id: 'T-05', createdAt: '2026-08-01', sku: tent.sku },
    ];
    const window = buildWindow(30);
    const all = summarizeSupport(tickets, catalogue, window, { productId: null, category: null });
    expect(all.rows.map((ticket) => ticket.id)).toEqual(['T-02', 'T-01', 'T-03', 'T-04']);
    expect(all.ranking.map(({ product, count }) => [product.sku, count])).toEqual([[tent.sku, 2], [largerTent.sku, 1]]);
    expect(all.unmatched).toBe(1);
    expect(summarizeSupport(tickets, catalogue, window, { productId: UNMATCHED_SUPPORT_PRODUCT, category: 'shipping' }).rows.map(({ id }) => id)).toEqual(['T-04']);
    expect(summarizeSupport(tickets, catalogue, window, { productId: tent.id, category: 'returns' }).rows).toEqual([]);
  });
});
