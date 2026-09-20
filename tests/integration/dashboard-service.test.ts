import { describe, expect, it } from 'vitest';
import { loadDashboard } from '@/services/dashboard-service';
import {
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
  createFlakyTrafficRepository,
} from '@/repositories/traffic-repository';
import {
  parseDemoDataMode,
  resolveTrafficRepository,
} from '@/services/demo-data-source';
import { DEMO_WINDOW, buildWindow } from '@/domain/demo-window';

/**
 * Service + repository boundary: the states the dashboard renders must come
 * from the data layer, not from component-level guesswork.
 */

describe('loadDashboard state propagation', () => {
  it('returns ready with populated metrics from the fixture source', async () => {
    const state = await loadDashboard(createFixtureTrafficRepository());

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.summary.sessions).toBeGreaterThan(0);
    expect(state.summary.orders).toBeGreaterThan(0);
    expect(state.summary.revenueCents).toBeGreaterThan(0);
    expect(state.summary.conversionRate).not.toBeNull();
    expect(state.summary.averageOrderValueCents).not.toBeNull();
  });

  it('returns empty — not error, not zeros-as-fact — when there are no sessions', async () => {
    const state = await loadDashboard(createEmptyTrafficRepository());

    expect(state.status).toBe('empty');
    if (state.status !== 'empty') return;
    expect(state.summary.sessions).toBe(0);
    expect(state.summary.conversionRate).toBeNull();
  });

  it('returns error with the underlying message when the source rejects', async () => {
    const state = await loadDashboard(
      createFailingTrafficRepository('Upstream demo source refused.'),
    );

    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Upstream demo source refused.');
  });

  it('recovers on a second attempt against a flaky source, proving retry works', async () => {
    const repository = createFlakyTrafficRepository(1);

    const first = await loadDashboard(repository);
    expect(first.status).toBe('error');

    const second = await loadDashboard(repository);
    expect(second.status).toBe('ready');
  });

  it('returns empty for a window that contains no data', async () => {
    const state = await loadDashboard(
      createFixtureTrafficRepository(),
      buildWindow(7, '2020-01-07'),
    );
    expect(state.status).toBe('empty');
  });
});

describe('demo data source seam', () => {
  it('only honours the documented modes', () => {
    expect(parseDemoDataMode('error')).toBe('error');
    expect(parseDemoDataMode('empty')).toBe('empty');
    expect(parseDemoDataMode('slow')).toBe('slow');
    expect(parseDemoDataMode('flaky')).toBe('flaky');
    expect(parseDemoDataMode('drop-tables')).toBeNull();
    expect(parseDemoDataMode(null)).toBeNull();
  });

  it('falls back to the real fixture for an unknown mode', async () => {
    const state = await loadDashboard(
      resolveTrafficRepository(parseDemoDataMode('nonsense')),
    );
    expect(state.status).toBe('ready');
  });
});

describe('dashboard metrics agree with the fixture', () => {
  it('derives conversion rate and AOV from the same numbers it reports', async () => {
    const state = await loadDashboard(createFixtureTrafficRepository());
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    const { sessions, orders, revenueCents, conversionRate, averageOrderValueCents } =
      state.summary;

    // One order per session in the MVP, so purchase sessions === orders.
    expect(conversionRate).toBeCloseTo(orders / sessions, 12);
    expect(averageOrderValueCents).toBeCloseTo(revenueCents / orders, 12);
  });

  it('reports a plausible DTC conversion rate rather than an arbitrary number', async () => {
    const state = await loadDashboard(createFixtureTrafficRepository());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.summary.conversionRate).toBeGreaterThan(0.005);
    expect(state.summary.conversionRate).toBeLessThan(0.08);
  });

  it('covers the full demo window', async () => {
    const state = await loadDashboard(createFixtureTrafficRepository());
    if (state.status !== 'ready') throw new Error('expected ready');

    expect(state.summary.window.start).toBe(DEMO_WINDOW.start);
    expect(state.summary.window.end).toBe(DEMO_WINDOW.end);
    expect(state.summary.window.days).toBe(90);
  });
});
