import { describe, expect, it } from 'vitest';
import {
  generateTrafficFixture,
  getTrafficFixture,
} from '@/fixtures/demo-traffic';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { sessionFactSchema } from '@/domain/schemas';
import { DEMO_WINDOW, isWithinWindow } from '@/domain/demo-window';
import { FUNNEL_STAGES } from '@/domain/types';
import { sumCents } from '@/domain/money';

/**
 * The traffic fixture is the factual basis for every metric in the project, so
 * its internal consistency is checked here rather than assumed.
 */

const fixture = getTrafficFixture();

describe('determinism', () => {
  it('produces identical data for the same seed', () => {
    const a = generateTrafficFixture(4242);
    const b = generateTrafficFixture(4242);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different data for a different seed', () => {
    expect(JSON.stringify(generateTrafficFixture(1))).not.toBe(
      JSON.stringify(generateTrafficFixture(2)),
    );
  });

  it('memoises to the same object rather than regenerating', () => {
    expect(getTrafficFixture()).toBe(getTrafficFixture());
  });
});

describe('session integrity', () => {
  it('every session passes the domain schema', () => {
    for (const session of fixture.sessions) {
      const result = sessionFactSchema.safeParse(session);
      if (!result.success) {
        throw new Error(
          `Invalid session ${session.sessionId}: ${result.error.message}`,
        );
      }
    }
  });

  it('stages are an ordered prefix and never skip a step', () => {
    for (const session of fixture.sessions) {
      session.stages.forEach((stage, index) => {
        expect(stage).toBe(FUNNEL_STAGES[index]);
      });
    }
  });

  it('funnel counts are monotonically non-increasing', () => {
    const counts = FUNNEL_STAGES.map(
      (stage) =>
        fixture.sessions.filter((session) => session.stages.includes(stage))
          .length,
    );
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i] ?? 0).toBeLessThanOrEqual(counts[i - 1] ?? 0);
    }
  });

  it('every session falls inside the demo window', () => {
    for (const session of fixture.sessions) {
      expect(isWithinWindow(session.date, DEMO_WINDOW)).toBe(true);
    }
  });

  it('covers every day of the window', () => {
    const days = new Set(fixture.sessions.map((session) => session.date));
    expect(days.size).toBe(DEMO_WINDOW.days);
  });

  it('has unique session IDs', () => {
    const ids = new Set(fixture.sessions.map((session) => session.sessionId));
    expect(ids.size).toBe(fixture.sessions.length);
  });

  it('has fewer users than sessions, so de-duplication matters', () => {
    const users = new Set(fixture.sessions.map((session) => session.userId));
    expect(users.size).toBeLessThan(fixture.sessions.length);
  });
});

describe('order integrity', () => {
  it('pairs every purchase session with exactly one order', () => {
    const purchaseSessions = fixture.sessions.filter((session) =>
      session.stages.includes('purchase'),
    );
    expect(purchaseSessions.length).toBe(fixture.orders.length);

    for (const session of purchaseSessions) {
      expect(session.orderId).not.toBeNull();
      expect(
        fixture.orders.some((order) => order.id === session.orderId),
      ).toBe(true);
    }
  });

  it('leaves non-purchasing sessions without an order', () => {
    for (const session of fixture.sessions) {
      if (!session.stages.includes('purchase')) {
        expect(session.orderId).toBeNull();
      }
    }
  });

  it('matches each order back to its session, channel and date', () => {
    const byId = new Map(
      fixture.sessions.map((session) => [session.sessionId, session]),
    );
    for (const order of fixture.orders) {
      const session = byId.get(order.sessionId);
      expect(session).toBeDefined();
      expect(order.attributedChannel).toBe(session?.channel);
      expect(order.date).toBe(session?.date);
      expect(order.userId).toBe(session?.userId);
    }
  });

  it('order revenue equals the sum of its line amounts', () => {
    for (const order of fixture.orders) {
      const lines = fixture.orderItems.filter(
        (item) => item.orderId === order.id,
      );
      expect(lines.length).toBeGreaterThan(0);
      const lineTotal = sumCents(
        lines.map(
          (line) => line.unitPriceCents * line.quantity - line.discountCents,
        ),
      );
      expect(order.revenueCents).toBe(lineTotal);
    }
  });

  it('never discounts a line below zero', () => {
    for (const item of fixture.orderItems) {
      expect(item.discountCents).toBeGreaterThanOrEqual(0);
      expect(item.discountCents).toBeLessThanOrEqual(
        item.unitPriceCents * item.quantity,
      );
    }
  });

  it('only sells active products', () => {
    const sellable = new Set(
      buildDemoSeedState()
        .products.filter((product) => product.status === 'active')
        .map((product) => product.id),
    );
    for (const item of fixture.orderItems) {
      expect(sellable).toContain(item.productId);
    }
  });

  it('marks a returning customer as not new on their second order', () => {
    const seen = new Set<string>();
    for (const order of fixture.orders) {
      expect(order.isNewCustomer).toBe(!seen.has(order.userId));
      seen.add(order.userId);
    }
  });
});

describe('channel attribution', () => {
  it('assigns exactly one channel per session and covers the channel set', () => {
    const channels = new Set(fixture.sessions.map((session) => session.channel));
    expect(channels.size).toBeGreaterThanOrEqual(6);
    expect(channels).toContain('Organic Search');
    expect(channels).toContain('AI Referral');
  });

  it('channel session counts add back up to the site total', () => {
    const perChannel = new Map<string, number>();
    for (const session of fixture.sessions) {
      perChannel.set(session.channel, (perChannel.get(session.channel) ?? 0) + 1);
    }
    const total = [...perChannel.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(fixture.sessions.length);
  });

  it('uses AI referral source labels only on the AI Referral channel', () => {
    const aiSources = new Set(['chatgpt', 'perplexity', 'gemini', 'copilot']);
    for (const session of fixture.sessions) {
      if (aiSources.has(session.source)) {
        expect(session.channel).toBe('AI Referral');
      }
    }
  });
});
