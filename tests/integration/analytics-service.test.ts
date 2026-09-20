import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadAnalytics,
  parseAnalyticsRange,
  windowForRange,
  type AnalyticsDeps,
} from '@/services/analytics-service';
import { loadDashboard } from '@/services/dashboard-service';
import {
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
} from '@/repositories/traffic-repository';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { getTrafficFixture } from '@/fixtures/demo-traffic';
import { DEMO_WINDOW } from '@/domain/demo-window';

/**
 * Analytics over the real fixture: reconciliation against the site totals,
 * range filtering, and agreement with the dashboard.
 */

const NAMESPACE = 'growthos.test.analytics';

function deps(): AnalyticsDeps {
  return {
    traffic: createFixtureTrafficRepository(),
    state: createBrowserStateRepository(buildDemoSeedState(), {
      namespace: NAMESPACE,
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('range handling', () => {
  it('only accepts the documented ranges', () => {
    expect(parseAnalyticsRange('7')).toBe(7);
    expect(parseAnalyticsRange('30')).toBe(30);
    expect(parseAnalyticsRange('90')).toBe(90);
    expect(parseAnalyticsRange('45')).toBe(90);
    expect(parseAnalyticsRange('nonsense')).toBe(90);
    expect(parseAnalyticsRange(null)).toBe(90);
  });

  it('ends every range on the same fixed demo day', () => {
    for (const range of [7, 30, 90] as const) {
      const window = windowForRange(range);
      expect(window.end).toBe(DEMO_WINDOW.end);
      expect(window.days).toBe(range);
    }
  });

  it('narrows the numbers as the range narrows', () => {
    // Longer ranges cover strictly more days, so they cannot report less.
    return Promise.all([
      loadAnalytics(deps(), 7),
      loadAnalytics(deps(), 30),
      loadAnalytics(deps(), 90),
    ]).then(([week, month, quarter]) => {
      if (
        week.status !== 'ready' ||
        month.status !== 'ready' ||
        quarter.status !== 'ready'
      ) {
        throw new Error('expected ready');
      }
      expect(week.view.totals.sessions).toBeLessThan(
        month.view.totals.sessions,
      );
      expect(month.view.totals.sessions).toBeLessThan(
        quarter.view.totals.sessions,
      );
      expect(week.view.daily).toHaveLength(7);
      expect(month.view.daily).toHaveLength(30);
      expect(quarter.view.daily).toHaveLength(90);
    });
  });

  it('passes one window to every part of the view', () => {
    return loadAnalytics(deps(), 30).then((state) => {
      if (state.status !== 'ready') throw new Error('expected ready');
      expect(state.view.window.days).toBe(30);
      expect(state.view.totals.window).toEqual(state.view.window);
      expect(state.view.daily[0]?.date).toBe(state.view.window.start);
      expect(state.view.daily.at(-1)?.date).toBe(state.view.window.end);
    });
  });
});

describe('reconciliation against the site totals', () => {
  it('channel sessions, orders and revenue add up', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');
    const { totals, channels } = state.view;

    expect(channels.reduce((sum, row) => sum + row.sessions, 0)).toBe(
      totals.sessions,
    );
    expect(channels.reduce((sum, row) => sum + row.orders, 0)).toBe(
      totals.orders,
    );
    expect(channels.reduce((sum, row) => sum + row.revenueCents, 0)).toBe(
      totals.revenueCents,
    );
  });

  it('channel users overlap, so they exceed the de-duplicated site total', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');
    const { totals, channels } = state.view;

    const summed = channels.reduce((sum, row) => sum + row.users, 0);
    expect(summed).toBeGreaterThan(totals.users);
    expect(totals.users).toBeLessThanOrEqual(totals.sessions);
  });

  it('AI source sessions add up to the AI Referral channel total', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const aiChannel = state.view.channels.find(
      (row) => row.channel === 'AI Referral',
    );
    const summed = state.view.aiSources.reduce(
      (sum, row) => sum + row.sessions,
      0,
    );
    expect(summed).toBe(aiChannel?.sessions);
    expect(state.view.aiSources.length).toBeGreaterThan(1);
  });

  it('daily sessions add up to the range total', async () => {
    const state = await loadAnalytics(deps(), 30);
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(
      state.view.daily.reduce((sum, point) => sum + point.sessions, 0),
    ).toBe(state.view.totals.sessions);
    expect(state.view.daily.reduce((sum, point) => sum + point.orders, 0)).toBe(
      state.view.totals.orders,
    );
  });
});

describe('spend, CAC and ROAS on the real fixture', () => {
  it('reports ROAS only for channels that bought media', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.view.channels) {
      if (row.adSpendCents > 0) {
        expect(row.roas).not.toBeNull();
      } else {
        expect(row.roas).toBeNull();
      }
    }
  });

  it('gives the earned channels no spend, a zero CAC and no ROAS', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const channel of ['Organic Search', 'Direct', 'AI Referral'] as const) {
      const row = state.view.channels.find((item) => item.channel === channel);
      expect(row?.adSpendCents).toBe(0);
      expect(row?.acquisitionSpendCents).toBe(0);
      // CAC has a valid denominator — customers were acquired — and a numerator
      // of zero, so the honest arithmetic is 0, not N/A. The UI says what that
      // zero excludes: content and SEO labour are not modelled, so organic is
      // not actually free.
      expect(row?.newCustomers ?? 0).toBeGreaterThan(0);
      expect(row?.cacCents).toBe(0);
      // ROAS has no denominator at all, so it stays N/A.
      expect(row?.roas).toBeNull();
    }
  });

  it('gives Email a CAC but no ROAS — a platform fee is not media spend', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const email = state.view.channels.find((row) => row.channel === 'Email');
    expect(email?.acquisitionSpendCents).toBeGreaterThan(0);
    expect(email?.adSpendCents).toBe(0);
    expect(email?.cacCents).not.toBeNull();
    expect(email?.roas).toBeNull();
  });

  it('produces plausible paid ROAS figures rather than arbitrary ones', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const channel of ['Paid Search', 'Meta', 'TikTok'] as const) {
      const row = state.view.channels.find((item) => item.channel === channel);
      expect(row?.roas ?? 0).toBeGreaterThan(0.5);
      expect(row?.roas ?? 99).toBeLessThan(12);
    }
  });

  it('acquisition spend is never less than ad spend', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const row of state.view.channels) {
      expect(row.acquisitionSpendCents).toBeGreaterThanOrEqual(row.adSpendCents);
    }
  });

  it('spend rows exist for every channel on every day of the window', () => {
    const fixture = getTrafficFixture();
    expect(fixture.channelSpend).toHaveLength(8 * DEMO_WINDOW.days);
    const dates = new Set(fixture.channelSpend.map((row) => row.date));
    expect(dates.size).toBe(DEMO_WINDOW.days);
  });
});

describe('dashboard and analytics agree', () => {
  it('report identical figures for the same window', async () => {
    const analytics = await loadAnalytics(deps(), 90);
    const dashboard = await loadDashboard(createFixtureTrafficRepository());

    if (analytics.status !== 'ready' || dashboard.status !== 'ready') {
      throw new Error('expected ready');
    }

    expect(dashboard.summary.sessions).toBe(analytics.view.totals.sessions);
    expect(dashboard.summary.orders).toBe(analytics.view.totals.orders);
    expect(dashboard.summary.revenueCents).toBe(
      analytics.view.totals.revenueCents,
    );
    expect(dashboard.summary.conversionRate).toBe(
      analytics.view.totals.conversionRate,
    );
    expect(dashboard.summary.averageOrderValueCents).toBe(
      analytics.view.totals.averageOrderValueCents,
    );
    expect(dashboard.summary.cacCents).toBe(analytics.view.totals.cacCents);
    expect(dashboard.summary.roas).toBe(analytics.view.totals.roas);
    expect(dashboard.summary.users).toBe(analytics.view.totals.users);
  });

  it('agree on organic traffic and organic revenue', async () => {
    const analytics = await loadAnalytics(deps(), 90);
    const dashboard = await loadDashboard(createFixtureTrafficRepository());
    if (analytics.status !== 'ready' || dashboard.status !== 'ready') {
      throw new Error('expected ready');
    }

    const organic = analytics.view.channels.find(
      (row) => row.channel === 'Organic Search',
    );
    expect(dashboard.summary.organicSessions).toBe(organic?.sessions);
    expect(dashboard.summary.organicRevenueCents).toBe(organic?.revenueCents);
  });

  it('share the same daily series and channel rows', async () => {
    const analytics = await loadAnalytics(deps(), 90);
    const dashboard = await loadDashboard(createFixtureTrafficRepository());
    if (analytics.status !== 'ready' || dashboard.status !== 'ready') {
      throw new Error('expected ready');
    }

    expect(dashboard.daily).toEqual(analytics.view.daily);
    expect(dashboard.channels).toEqual(analytics.view.channels);
  });
});

describe('top lists', () => {
  it('names landing pages after their product where one exists', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.view.landingPages.length).toBeGreaterThan(0);
    expect(
      state.view.landingPages.every((row) => row.productTitle !== null),
    ).toBe(true);
  });

  it('orders top products by revenue, highest first', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const revenues = state.view.topProducts.map(
      (row) => row.metrics.revenueCents,
    );
    expect([...revenues].sort((a, b) => b - a)).toEqual(revenues);
    expect(state.view.topProducts.length).toBeGreaterThan(0);
  });

  it('still works without the catalogue, falling back to page ids', async () => {
    const state = await loadAnalytics(
      { traffic: createFixtureTrafficRepository() },
      90,
    );
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.view.landingPages.length).toBeGreaterThan(0);
    expect(state.view.landingPages[0]?.productTitle).toBeNull();
    expect(state.view.totals.sessions).toBeGreaterThan(0);
  });
});

describe('failure and empty states', () => {
  it('returns empty when there are no sessions', async () => {
    const state = await loadAnalytics(
      { traffic: createEmptyTrafficRepository() },
      90,
    );
    expect(state.status).toBe('empty');
    if (state.status !== 'empty') return;
    expect(state.view.totals.conversionRate).toBeNull();
  });

  it('returns error when the traffic source fails', async () => {
    const state = await loadAnalytics(
      { traffic: createFailingTrafficRepository('Traffic source down.') },
      90,
    );
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Traffic source down.');
  });
});

describe('demo data plausibility', () => {
  it('reports a site conversion rate in a believable DTC band', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.view.totals.conversionRate ?? 0).toBeGreaterThan(0.01);
    expect(state.view.totals.conversionRate ?? 1).toBeLessThan(0.05);
  });

  it('has enough sessions for channel figures to be meaningful', async () => {
    const state = await loadAnalytics(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.view.totals.sessions).toBeGreaterThan(5000);
    for (const row of state.view.channels) {
      expect(row.sessions).toBeGreaterThan(50);
    }
  });
});
