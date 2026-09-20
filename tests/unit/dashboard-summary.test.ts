import { describe, expect, it } from 'vitest';
import { summarizeDashboard } from '@/domain/dashboard-summary';
import { buildWindow } from '@/domain/demo-window';
import type { Channel, FunnelStage, Order, SessionFact } from '@/domain/types';

const WINDOW = buildWindow(7, '2026-08-31');

let counter = 0;

function session(
  overrides: Partial<SessionFact> & { stages: FunnelStage[] },
): SessionFact {
  counter += 1;
  return {
    sessionId: `ses_${counter}`,
    userId: `usr_${counter}`,
    date: '2026-08-30',
    channel: 'Direct' as Channel,
    source: '(direct)',
    landingPageId: 'snap_a',
    orderId: null,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  counter += 1;
  return {
    id: `ord_${counter}`,
    sessionId: `ses_${counter}`,
    userId: `usr_${counter}`,
    date: '2026-08-30',
    attributedChannel: 'Direct',
    isNewCustomer: true,
    revenueCents: 10_000,
    ...overrides,
  };
}

describe('summarizeDashboard', () => {
  it('computes the six metrics from the same session population', () => {
    const sessions = [
      session({ stages: ['session'], channel: 'Organic Search' }),
      session({ stages: ['session', 'product_view'], channel: 'Organic Search' }),
      session({
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        channel: 'Organic Search',
        orderId: 'ord_a',
      }),
      session({
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
        channel: 'Meta',
        orderId: 'ord_b',
      }),
    ];
    const orders = [
      order({ id: 'ord_a', revenueCents: 32_900 }),
      order({ id: 'ord_b', revenueCents: 27_500 }),
    ];

    const summary = summarizeDashboard(sessions, orders, WINDOW);

    expect(summary.sessions).toBe(4);
    expect(summary.orders).toBe(2);
    expect(summary.revenueCents).toBe(60_400);
    expect(summary.conversionRate).toBe(0.5);
    expect(summary.averageOrderValueCents).toBe(30_200);
    expect(summary.organicSessions).toBe(3);
  });

  it('returns null metrics, not zero or Infinity, when there is no data', () => {
    const summary = summarizeDashboard([], [], WINDOW);

    expect(summary.sessions).toBe(0);
    expect(summary.orders).toBe(0);
    expect(summary.revenueCents).toBe(0);
    expect(summary.conversionRate).toBeNull();
    expect(summary.averageOrderValueCents).toBeNull();
    expect(summary.organicSessions).toBe(0);
  });

  it('reports a real zero conversion rate when sessions exist but nobody buys', () => {
    const summary = summarizeDashboard(
      [session({ stages: ['session'] }), session({ stages: ['session'] })],
      [],
      WINDOW,
    );

    expect(summary.conversionRate).toBe(0);
    // AOV still has no denominator, so it stays N/A rather than becoming 0.
    expect(summary.averageOrderValueCents).toBeNull();
  });

  it('excludes sessions and orders outside the window', () => {
    const sessions = [
      session({ stages: ['session'], date: '2026-08-24' }), // one day before
      session({ stages: ['session'], date: '2026-08-25' }), // first day
      session({ stages: ['session'], date: '2026-08-31' }), // last day
      session({ stages: ['session'], date: '2026-09-01' }), // one day after
    ];
    const orders = [
      order({ date: '2026-08-24', revenueCents: 1_000 }),
      order({ date: '2026-08-25', revenueCents: 2_000 }),
    ];

    const summary = summarizeDashboard(sessions, orders, WINDOW);

    expect(summary.sessions).toBe(2);
    expect(summary.revenueCents).toBe(2_000);
  });

  it('de-duplicates repeated session IDs rather than double counting', () => {
    const duplicated = session({ stages: ['session'] });
    const summary = summarizeDashboard([duplicated, duplicated], [], WINDOW);
    expect(summary.sessions).toBe(1);
  });

  it('counts a purchasing session once even with several purchase stages listed', () => {
    const sessions = [
      session({
        stages: ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase'],
      }),
      session({ stages: ['session'] }),
    ];
    const summary = summarizeDashboard(sessions, [order()], WINDOW);
    expect(summary.conversionRate).toBe(0.5);
  });

  it('organic traffic counts only the Organic Search channel', () => {
    const sessions = [
      session({ stages: ['session'], channel: 'Organic Search' }),
      session({ stages: ['session'], channel: 'Paid Search' }),
      session({ stages: ['session'], channel: 'AI Referral' }),
    ];
    const summary = summarizeDashboard(sessions, [], WINDOW);
    expect(summary.organicSessions).toBe(1);
  });
});
