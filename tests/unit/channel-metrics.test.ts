import { describe, expect, it } from 'vitest';
import {
  analyticsTotals,
  channelRows,
  dailySeries,
  landingPageRows,
  sourceRows,
  type AnalyticsInput,
} from '@/domain/analytics/channel-metrics';
import { buildWindow } from '@/domain/demo-window';
import type {
  Channel,
  ChannelSpend,
  Order,
  SessionFact,
} from '@/domain/types';

const WINDOW = buildWindow(7, '2026-08-31');

let counter = 0;

function session(overrides: Partial<SessionFact> = {}): SessionFact {
  counter += 1;
  const purchased = overrides.orderId !== undefined && overrides.orderId !== null;
  return {
    sessionId: `ses_${counter}`,
    userId: `usr_${counter}`,
    date: '2026-08-30',
    channel: 'Organic Search',
    source: 'google',
    landingPageId: 'snap_a',
    stages: purchased
      ? ['session', 'product_view', 'add_to_cart', 'checkout', 'purchase']
      : ['session'],
    viewedProductIds: purchased ? ['prd_a'] : [],
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
    attributedChannel: 'Organic Search',
    isNewCustomer: true,
    revenueCents: 10_000,
    ...overrides,
  };
}

function spend(
  channel: Channel,
  adSpendCents: number,
  acquisitionSpendCents = adSpendCents,
  date = '2026-08-30',
): ChannelSpend {
  return { date, channel, acquisitionSpendCents, adSpendCents };
}

function input(
  sessions: SessionFact[],
  orders: Order[] = [],
  channelSpend: ChannelSpend[] = [],
): AnalyticsInput {
  return { sessions, orders, channelSpend, window: WINDOW };
}

function rowFor(rows: ReturnType<typeof channelRows>, channel: Channel) {
  const found = rows.find((row) => row.channel === channel);
  if (found === undefined) throw new Error(`No row for ${channel}`);
  return found;
}

describe('channel reconciliation', () => {
  it('channel sessions, orders and revenue add up to the site total', () => {
    const sessions = [
      session({ channel: 'Organic Search', orderId: 'o1' }),
      session({ channel: 'Organic Search' }),
      session({ channel: 'Meta', orderId: 'o2' }),
      session({ channel: 'Email' }),
    ];
    const orders = [
      order('o1', { attributedChannel: 'Organic Search', revenueCents: 30_000 }),
      order('o2', { attributedChannel: 'Meta', revenueCents: 20_000 }),
    ];
    const data = input(sessions, orders);

    const rows = channelRows(data);
    const totals = analyticsTotals(data);

    const sumSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
    const sumOrders = rows.reduce((sum, row) => sum + row.orders, 0);
    const sumRevenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);

    expect(sumSessions).toBe(totals.sessions);
    expect(sumOrders).toBe(totals.orders);
    expect(sumRevenue).toBe(totals.revenueCents);
  });

  it('returns a row for every channel, including ones with no traffic', () => {
    const rows = channelRows(input([session({ channel: 'Direct' })]));
    expect(rows).toHaveLength(8);
    expect(rowFor(rows, 'TikTok').sessions).toBe(0);
    expect(rowFor(rows, 'TikTok').conversionRate).toBeNull();
  });
});

describe('user de-duplication', () => {
  it('counts a user once per channel and once site-wide', () => {
    const sessions = [
      session({ userId: 'usr_1', channel: 'Organic Search' }),
      session({ userId: 'usr_1', channel: 'Organic Search' }),
      session({ userId: 'usr_1', channel: 'Email' }),
    ];
    const rows = channelRows(input(sessions));
    const totals = analyticsTotals(input(sessions));

    expect(rowFor(rows, 'Organic Search').users).toBe(1);
    expect(rowFor(rows, 'Email').users).toBe(1);
    // The same person in two channels: rows sum to 2, the site total is 1.
    expect(rows.reduce((sum, row) => sum + row.users, 0)).toBe(2);
    expect(totals.users).toBe(1);
  });

  it('de-duplicates users across days, not just within a day', () => {
    const sessions = [
      session({ userId: 'usr_1', date: '2026-08-28' }),
      session({ userId: 'usr_1', date: '2026-08-30' }),
    ];
    expect(analyticsTotals(input(sessions)).users).toBe(1);
    expect(analyticsTotals(input(sessions)).sessions).toBe(2);
  });
});

describe('aggregated rather than averaged rates', () => {
  it('weights busy days more than quiet ones', () => {
    // Day A: 1 session, 1 order (100%). Day B: 99 sessions, 0 orders (0%).
    // Averaging the two days gives 50%; aggregating gives 1%.
    const sessions = [
      session({ date: '2026-08-29', orderId: 'o1' }),
      ...Array.from({ length: 99 }, () => session({ date: '2026-08-30' })),
    ];
    const totals = analyticsTotals(input(sessions, [order('o1')]));
    expect(totals.conversionRate).toBeCloseTo(0.01, 10);
  });
});

describe('CAC', () => {
  it('divides acquisition spend by new customers, not by orders', () => {
    const sessions = [
      session({ channel: 'Paid Search', orderId: 'o1' }),
      session({ channel: 'Paid Search', orderId: 'o2' }),
    ];
    const orders = [
      order('o1', { attributedChannel: 'Paid Search', isNewCustomer: true }),
      // A repeat customer: an order, but not a new customer.
      order('o2', { attributedChannel: 'Paid Search', isNewCustomer: false }),
    ];
    const rows = channelRows(input(sessions, orders, [spend('Paid Search', 10_000)]));

    const paid = rowFor(rows, 'Paid Search');
    expect(paid.orders).toBe(2);
    expect(paid.newCustomers).toBe(1);
    expect(paid.cacCents).toBe(10_000);
  });

  it('is N/A when nobody new was acquired', () => {
    const rows = channelRows(
      input(
        [session({ channel: 'Paid Search' })],
        [],
        [spend('Paid Search', 10_000)],
      ),
    );
    expect(rowFor(rows, 'Paid Search').cacCents).toBeNull();
  });

  it('exists for a channel with acquisition cost but no media spend', () => {
    const rows = channelRows(
      input(
        [session({ channel: 'Email', orderId: 'o1' })],
        [order('o1', { attributedChannel: 'Email' })],
        [spend('Email', 0, 400)],
      ),
    );
    const email = rowFor(rows, 'Email');
    expect(email.cacCents).toBe(400);
    // ...but ROAS does not, because no media was bought.
    expect(email.roas).toBeNull();
  });
});

describe('ROAS', () => {
  it('is revenue over ad spend for a channel that bought media', () => {
    const rows = channelRows(
      input(
        [session({ channel: 'Meta', orderId: 'o1' })],
        [order('o1', { attributedChannel: 'Meta', revenueCents: 30_000 })],
        [spend('Meta', 10_000)],
      ),
    );
    expect(rowFor(rows, 'Meta').roas).toBe(3);
  });

  it('is N/A — never zero or infinite — for an earned channel', () => {
    const rows = channelRows(
      input(
        [session({ channel: 'Organic Search', orderId: 'o1' })],
        [order('o1', { attributedChannel: 'Organic Search' })],
        [spend('Organic Search', 0, 0)],
      ),
    );
    const organic = rowFor(rows, 'Organic Search');
    expect(organic.roas).toBeNull();
    expect(organic.revenueCents).toBeGreaterThan(0);
  });

  it('site ROAS counts only revenue from channels that bought media', () => {
    const sessions = [
      session({ channel: 'Meta', orderId: 'o1' }),
      session({ channel: 'Organic Search', orderId: 'o2' }),
    ];
    const orders = [
      order('o1', { attributedChannel: 'Meta', revenueCents: 30_000 }),
      order('o2', { attributedChannel: 'Organic Search', revenueCents: 70_000 }),
    ];
    const totals = analyticsTotals(
      input(sessions, orders, [spend('Meta', 10_000), spend('Organic Search', 0, 0)]),
    );

    expect(totals.revenueCents).toBe(100_000);
    // Only Meta's revenue counts against Meta's spend.
    expect(totals.paidAttributedRevenueCents).toBe(30_000);
    expect(totals.roas).toBe(3);
  });

  it('site ROAS is N/A when nothing was spent on media at all', () => {
    const totals = analyticsTotals(
      input(
        [session({ orderId: 'o1' })],
        [order('o1')],
        [spend('Organic Search', 0, 0)],
      ),
    );
    expect(totals.roas).toBeNull();
  });
});

describe('date boundaries', () => {
  it('includes both endpoints and excludes the days either side', () => {
    const sessions = [
      session({ date: '2026-08-24' }), // day before the window
      session({ date: '2026-08-25' }), // first day
      session({ date: '2026-08-31' }), // last day
      session({ date: '2026-09-01' }), // day after
    ];
    expect(analyticsTotals(input(sessions)).sessions).toBe(2);
  });

  it('excludes spend outside the window as well', () => {
    const totals = analyticsTotals(
      input(
        [session()],
        [],
        [
          spend('Meta', 10_000, 10_000, '2026-08-24'),
          spend('Meta', 500, 500, '2026-08-30'),
        ],
      ),
    );
    expect(totals.adSpendCents).toBe(500);
  });

  it('excludes orders dated outside the window', () => {
    const totals = analyticsTotals(
      input(
        [session({ orderId: 'o1' })],
        [order('o1', { date: '2026-09-02', revenueCents: 99_999 })],
      ),
    );
    expect(totals.revenueCents).toBe(0);
    expect(totals.orders).toBe(0);
  });
});

describe('empty and missing data', () => {
  it('returns null rates and zero counts for an empty range', () => {
    const totals = analyticsTotals(input([]));
    expect(totals.sessions).toBe(0);
    expect(totals.users).toBe(0);
    expect(totals.conversionRate).toBeNull();
    expect(totals.averageOrderValueCents).toBeNull();
    expect(totals.cacCents).toBeNull();
    expect(totals.roas).toBeNull();
  });

  it('reports a real zero conversion rate when sessions exist but nobody buys', () => {
    const totals = analyticsTotals(input([session(), session()]));
    expect(totals.conversionRate).toBe(0);
    expect(totals.averageOrderValueCents).toBeNull();
  });

  it('copes with spend recorded for a channel that had no sessions', () => {
    const rows = channelRows(input([], [], [spend('TikTok', 5_000)]));
    const tiktok = rowFor(rows, 'TikTok');
    expect(tiktok.sessions).toBe(0);
    expect(tiktok.adSpendCents).toBe(5_000);
    expect(tiktok.roas).toBe(0); // real zero: money spent, no revenue
    expect(tiktok.cacCents).toBeNull(); // no new customers to divide by
  });
});

describe('dailySeries', () => {
  it('emits one point per day, including days with no traffic', () => {
    const points = dailySeries(input([session({ date: '2026-08-30' })]));
    expect(points).toHaveLength(7);
    expect(points[0]?.date).toBe('2026-08-25');
    expect(points[6]?.date).toBe('2026-08-31');
    expect(points.find((point) => point.date === '2026-08-26')?.sessions).toBe(0);
  });

  it('daily sessions add up to the range total', () => {
    const sessions = [
      session({ date: '2026-08-26' }),
      session({ date: '2026-08-26' }),
      session({ date: '2026-08-31' }),
    ];
    const points = dailySeries(input(sessions));
    expect(points.reduce((sum, point) => sum + point.sessions, 0)).toBe(
      analyticsTotals(input(sessions)).sessions,
    );
  });
});

describe('source and landing page breakdowns', () => {
  it('source sessions add up to the channel total', () => {
    const sessions = [
      session({ channel: 'AI Referral', source: 'chatgpt' }),
      session({ channel: 'AI Referral', source: 'chatgpt' }),
      session({ channel: 'AI Referral', source: 'perplexity' }),
      session({ channel: 'Organic Search', source: 'google' }),
    ];
    const rows = sourceRows(input(sessions), 'AI Referral');
    const channel = rowFor(channelRows(input(sessions)), 'AI Referral');

    expect(rows.reduce((sum, row) => sum + row.sessions, 0)).toBe(
      channel.sessions,
    );
    expect(rows[0]?.source).toBe('chatgpt');
  });

  it('landing page sessions add up to the site total', () => {
    const sessions = [
      session({ landingPageId: 'snap_a' }),
      session({ landingPageId: 'snap_b' }),
      session({ landingPageId: 'snap_b' }),
    ];
    const rows = landingPageRows(input(sessions));
    expect(rows.reduce((sum, row) => sum + row.sessions, 0)).toBe(3);
    expect(rows[0]?.landingPageId).toBe('snap_b');
  });
});

describe('low-volume confidence flag', () => {
  it('flags a channel whose rates rest on too few orders', () => {
    const sessions = [
      ...Array.from({ length: 200 }, () => session({ channel: 'TikTok' })),
      session({ channel: 'TikTok', orderId: 'o1' }),
    ];
    const rows = channelRows(input(sessions, [
      order('o1', { attributedChannel: 'TikTok' }),
    ]));

    const tiktok = rowFor(rows, 'TikTok');
    expect(tiktok.orders).toBe(1);
    expect(tiktok.lowVolume).toBe(true);
    // The figures are still reported — flagged, not hidden.
    expect(tiktok.conversionRate).not.toBeNull();
  });

  it('does not flag a channel with enough orders to be stable', () => {
    const orders = Array.from({ length: 30 }, (_, index) =>
      order(`o${index}`, { attributedChannel: 'Organic Search' }),
    );
    const sessions = orders.map((placed) =>
      session({ channel: 'Organic Search', orderId: placed.id }),
    );
    expect(rowFor(channelRows(input(sessions, orders)), 'Organic Search').lowVolume).toBe(
      false,
    );
  });

  it('flags a channel with no orders at all', () => {
    expect(rowFor(channelRows(input([])), 'Meta').lowVolume).toBe(true);
  });
});
