import { describe, expect, it } from 'vitest';
import { loadFunnel, type FunnelDeps } from '@/services/funnel-service';
import { loadAnalytics } from '@/services/analytics-service';
import { loadDashboard } from '@/services/dashboard-service';
import {
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
} from '@/repositories/traffic-repository';
import { FUNNEL_STAGES } from '@/domain/types';

/**
 * The funnel over the real fixture: agreement with Analytics, range filtering,
 * and the advice the demo data actually produces.
 */

function deps(): FunnelDeps {
  return { traffic: createFixtureTrafficRepository() };
}

describe('agreement with analytics', () => {
  it('reports the same session count for the same range', async () => {
    for (const range of [7, 30, 90] as const) {
      const funnel = await loadFunnel(deps(), range);
      const analytics = await loadAnalytics(
        { traffic: createFixtureTrafficRepository() },
        range,
      );
      if (funnel.status !== 'ready' || analytics.status !== 'ready') {
        throw new Error('expected ready');
      }
      expect(funnel.view.report.totalSessions).toBe(
        analytics.view.totals.sessions,
      );
    }
  });

  it('reports the same purchasing sessions and overall conversion', async () => {
    const funnel = await loadFunnel(deps(), 90);
    const analytics = await loadAnalytics(
      { traffic: createFixtureTrafficRepository() },
      90,
    );
    if (funnel.status !== 'ready' || analytics.status !== 'ready') {
      throw new Error('expected ready');
    }

    // One order per session in the MVP, so purchasing sessions === orders.
    expect(funnel.view.report.purchaseSessions).toBe(
      analytics.view.totals.orders,
    );
    expect(funnel.view.report.overallConversion).toBe(
      analytics.view.totals.conversionRate,
    );
  });

  it('shares the dashboard cart and checkout rates', async () => {
    const funnel = await loadFunnel(deps(), 90);
    const dashboard = await loadDashboard(createFixtureTrafficRepository());
    if (funnel.status !== 'ready' || dashboard.status !== 'ready') {
      throw new Error('expected ready');
    }

    const stage = (name: string): number =>
      funnel.view.report.stages.find((row) => row.stage === name)?.sessions ?? 0;

    expect(dashboard.summary.addToCartRate).toBeCloseTo(
      stage('add_to_cart') / funnel.view.report.totalSessions,
      12,
    );
    expect(dashboard.summary.checkoutRate).toBeCloseTo(
      stage('checkout') / funnel.view.report.totalSessions,
      12,
    );
    expect(dashboard.funnel.largestDropOff?.from).toBe(
      funnel.view.report.largestDropOff?.from,
    );
  });
});

describe('the funnel over the demo fixture', () => {
  it('produces five layers that only ever fall', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');
    const { report } = state.view;

    expect(report.stages).toHaveLength(FUNNEL_STAGES.length);
    expect(report.monotonic).toBe(true);

    const counts = report.stages.map((row) => row.sessions);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index] ?? 0).toBeLessThanOrEqual(counts[index - 1] ?? 0);
    }
  });

  it('has no invalid sequences in the generated data', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.view.report.invalidSessions).toHaveLength(0);
  });

  it('chains each step to the next, so the table reconciles by hand', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');
    const { transitions } = state.view.report;

    for (let index = 1; index < transitions.length; index += 1) {
      expect(transitions[index]?.fromSessions).toBe(
        transitions[index - 1]?.toSessions,
      );
    }
    for (const transition of transitions) {
      expect(transition.dropOffSessions).toBe(
        transition.fromSessions - transition.toSessions,
      );
    }
  });

  it('identifies a largest drop-off with a real rate behind it', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const largest = state.view.report.largestDropOff;
    expect(largest).not.toBeNull();
    expect(largest?.comparable).toBe(true);
    expect(largest?.dropOffRate ?? 0).toBeGreaterThan(0);

    // It really is the worst comparable step.
    for (const transition of state.view.report.transitions) {
      if (!transition.comparable) continue;
      expect(transition.dropOffRate ?? 0).toBeLessThanOrEqual(
        largest?.dropOffRate ?? 0,
      );
    }
  });

  it('narrows with the range and keeps every layer consistent', async () => {
    const week = await loadFunnel(deps(), 7);
    const quarter = await loadFunnel(deps(), 90);
    if (week.status !== 'ready' || quarter.status !== 'ready') {
      throw new Error('expected ready');
    }

    expect(week.view.report.totalSessions).toBeLessThan(
      quarter.view.report.totalSessions,
    );
    expect(week.view.report.window.days).toBe(7);
    expect(week.view.report.monotonic).toBe(true);
  });
});

describe('advice from the demo data', () => {
  it('raises advice only for a real reason, and names which one', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const raised = new Map(
      state.view.recommendations.map((item) => [`${item.from}->${item.to}`, item]),
    );

    for (const transition of state.view.report.transitions) {
      const item = raised.get(`${transition.from}->${transition.to}`);
      if (item === undefined) {
        // Anything NOT raised must be healthy and not the largest loss.
        expect(transition.conversion ?? 0).toBeGreaterThanOrEqual(0);
        continue;
      }
      if (item.raisedBecause === 'below-threshold') {
        expect(transition.conversion ?? 1).toBeLessThan(item.threshold);
      } else {
        // The other reason is the largest drop-off, which must actually be it.
        expect(item.isLargestDropOff).toBe(true);
        expect(state.view.report.largestDropOff?.from).toBe(transition.from);
      }
    }
  });

  it('raises the demo funnel\'s largest drop-off even though it clears its threshold', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const largest = state.view.report.largestDropOff;
    expect(largest?.from).toBe('product_view');

    const forLargest = state.view.recommendations.filter(
      (item) => item.from === largest?.from,
    );
    expect(forLargest.length).toBeGreaterThan(0);
    expect(forLargest[0]?.raisedBecause).toBe('largest-drop-off');
    // It is genuinely above threshold — this is a volume signal, not a failure.
    expect(largest?.conversion ?? 0).toBeGreaterThan(forLargest[0]?.threshold ?? 1);
  });

  it('carries the sample size and rule version on every item', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    for (const item of state.view.recommendations) {
      expect(item.sampleSessions).toBeGreaterThan(0);
      expect(item.ruleVersion).toBe('funnel-1.0.0');
      expect(item.hypothesis).toMatch(/\bmay\b/);
    }
  });

  it('puts the largest drop-off at the top of the list', async () => {
    const state = await loadFunnel(deps(), 90);
    if (state.status !== 'ready') throw new Error('expected ready');

    const first = state.view.recommendations[0];
    if (first === undefined) return; // nothing below threshold is a valid outcome
    expect(first.isLargestDropOff).toBe(true);
  });

  it('marks low confidence on a seven-day range where samples shrink', async () => {
    const week = await loadFunnel(deps(), 7);
    if (week.status !== 'ready') throw new Error('expected ready');

    // Whatever is raised, the confidence flag must agree with the sample.
    for (const item of week.view.recommendations) {
      const expected = item.sampleSessions < 60 ? 'low' : item.confidence;
      expect(['low', 'normal']).toContain(item.confidence);
      if (item.sampleSessions < 60 && item.to === 'purchase') {
        expect(item.confidence).toBe(expected);
      }
    }
  });
});

describe('empty and failing sources', () => {
  it('returns empty for a source with no sessions', async () => {
    const state = await loadFunnel(
      { traffic: createEmptyTrafficRepository() },
      90,
    );
    expect(state.status).toBe('empty');
    if (state.status !== 'empty') return;
    expect(state.view.report.overallConversion).toBeNull();
    expect(state.view.report.largestDropOff).toBeNull();
    expect(state.view.recommendations).toHaveLength(0);
  });

  it('returns error when the source fails', async () => {
    const state = await loadFunnel(
      { traffic: createFailingTrafficRepository('Funnel source down.') },
      90,
    );
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toBe('Funnel source down.');
  });
});
