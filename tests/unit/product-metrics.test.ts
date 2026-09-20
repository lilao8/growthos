import { describe, expect, it } from 'vitest';
import { computeProductMetrics } from '@/domain/product-metrics';
import { buildWindow } from '@/domain/demo-window';
import type { Order, OrderItem, SessionFact } from '@/domain/types';

const WINDOW = buildWindow(7, '2026-08-31');

let counter = 0;

function session(overrides: Partial<SessionFact>): SessionFact {
  counter += 1;
  return {
    sessionId: `ses_${counter}`,
    userId: `usr_${counter}`,
    date: '2026-08-30',
    channel: 'Direct',
    source: '(direct)',
    landingPageId: 'snap_a',
    stages: ['session', 'product_view'],
    viewedProductIds: ['prd_a'],
    orderId: null,
    ...overrides,
  };
}

function order(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    sessionId: 'ses_x',
    userId: 'usr_x',
    date: '2026-08-30',
    attributedChannel: 'Direct',
    isNewCustomer: true,
    revenueCents: 10_000,
    ...overrides,
  };
}

function item(
  orderId: string,
  productId: string,
  overrides: Partial<OrderItem> = {},
): OrderItem {
  return {
    orderId,
    productId,
    quantity: 1,
    unitPriceCents: 10_000,
    discountCents: 0,
    ...overrides,
  };
}

describe('computeProductMetrics', () => {
  it('uses viewing sessions as the conversion denominator', () => {
    const sessions = [
      session({ sessionId: 's1', viewedProductIds: ['prd_a'] }),
      session({ sessionId: 's2', viewedProductIds: ['prd_a'] }),
      session({ sessionId: 's3', viewedProductIds: ['prd_a'] }),
      session({
        sessionId: 's4',
        viewedProductIds: ['prd_a'],
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        orderId: 'o1',
      }),
    ];
    const metrics = computeProductMetrics(
      sessions,
      [order('o1')],
      [item('o1', 'prd_a')],
      WINDOW,
    );

    const a = metrics.get('prd_a');
    expect(a?.viewSessions).toBe(4);
    expect(a?.purchaseSessions).toBe(1);
    expect(a?.conversionRate).toBe(0.25);
  });

  it('counts a session in the denominator of every product it viewed', () => {
    const sessions = [
      session({
        sessionId: 's1',
        viewedProductIds: ['prd_a', 'prd_b'],
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        orderId: 'o1',
      }),
      session({ sessionId: 's2', viewedProductIds: ['prd_b'] }),
    ];
    const metrics = computeProductMetrics(
      sessions,
      [order('o1')],
      [item('o1', 'prd_a')],
      WINDOW,
    );

    expect(metrics.get('prd_a')?.viewSessions).toBe(1);
    expect(metrics.get('prd_a')?.conversionRate).toBe(1);
    // B was viewed twice and bought zero times: a real 0, not N/A.
    expect(metrics.get('prd_b')?.viewSessions).toBe(2);
    expect(metrics.get('prd_b')?.conversionRate).toBe(0);
  });

  it('splits revenue by order line so product revenue sums to order revenue', () => {
    const sessions = [
      session({
        sessionId: 's1',
        viewedProductIds: ['prd_a', 'prd_b'],
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        orderId: 'o1',
      }),
    ];
    const items = [
      item('o1', 'prd_a', { unitPriceCents: 32_900, discountCents: 1_700 }),
      item('o1', 'prd_b', { unitPriceCents: 27_500, discountCents: 1_400 }),
    ];
    const orderRevenue = 32_900 - 1_700 + (27_500 - 1_400);

    const metrics = computeProductMetrics(
      sessions,
      [order('o1', { revenueCents: orderRevenue })],
      items,
      WINDOW,
    );

    expect(metrics.get('prd_a')?.revenueCents).toBe(31_200);
    expect(metrics.get('prd_b')?.revenueCents).toBe(26_100);
    expect(
      (metrics.get('prd_a')?.revenueCents ?? 0) +
        (metrics.get('prd_b')?.revenueCents ?? 0),
    ).toBe(orderRevenue);
  });

  it('counts quantity towards units sold, not towards sessions', () => {
    const sessions = [
      session({
        sessionId: 's1',
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        orderId: 'o1',
      }),
    ];
    const metrics = computeProductMetrics(
      sessions,
      [order('o1')],
      [item('o1', 'prd_a', { quantity: 3 })],
      WINDOW,
    );

    expect(metrics.get('prd_a')?.unitsSold).toBe(3);
    expect(metrics.get('prd_a')?.purchaseSessions).toBe(1);
  });

  it('separates organic sessions from the rest', () => {
    const sessions = [
      session({ sessionId: 's1', channel: 'Organic Search' }),
      session({ sessionId: 's2', channel: 'Organic Search' }),
      session({ sessionId: 's3', channel: 'Meta' }),
    ];
    const metrics = computeProductMetrics(sessions, [], [], WINDOW);

    expect(metrics.get('prd_a')?.viewSessions).toBe(3);
    expect(metrics.get('prd_a')?.organicSessions).toBe(2);
  });

  it('ignores sessions and orders outside the window', () => {
    const sessions = [
      session({ sessionId: 's1', date: '2026-08-24' }),
      session({ sessionId: 's2', date: '2026-08-25' }),
    ];
    const metrics = computeProductMetrics(sessions, [], [], WINDOW);
    expect(metrics.get('prd_a')?.viewSessions).toBe(1);
  });

  it('returns no entry for a product nobody viewed or bought', () => {
    const metrics = computeProductMetrics([session({})], [], [], WINDOW);
    expect(metrics.get('prd_unseen')).toBeUndefined();
  });

  it('does not count a bounced session as a view', () => {
    const sessions = [
      session({ sessionId: 's1', stages: ['session'], viewedProductIds: [] }),
      session({ sessionId: 's2' }),
    ];
    const metrics = computeProductMetrics(sessions, [], [], WINDOW);
    expect(metrics.get('prd_a')?.viewSessions).toBe(1);
  });
});
