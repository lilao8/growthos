import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUNNEL_CONFIG,
  funnelRecommendations,
  FUNNEL_RULE_VERSION,
  TRANSITION_CHECKS,
} from '@/domain/funnel/recommendations';
import type { FunnelTransition } from '@/domain/funnel/funnel-metrics';
import type { FunnelStage } from '@/domain/types';

function transition(
  from: FunnelStage,
  to: FunnelStage,
  fromSessions: number,
  toSessions: number,
): FunnelTransition {
  const conversion = fromSessions === 0 ? null : toSessions / fromSessions;
  return {
    from,
    to,
    label: `${from} → ${to}`,
    fromSessions,
    toSessions,
    conversion,
    dropOffRate: conversion === null ? null : 1 - conversion,
    dropOffSessions: Math.max(0, fromSessions - toSessions),
    comparable: fromSessions > 0,
  };
}

function advise(transitions: FunnelTransition[], largest: FunnelTransition | null = null) {
  return funnelRecommendations({ transitions, largestDropOff: largest });
}

describe('mapping by step', () => {
  it('maps product view to cart onto price, value, reviews, CTA, images and delivery', () => {
    const items = advise([
      transition('product_view', 'add_to_cart', 1000, 50), // 5%, well below 20%
    ]);
    const ids = items.map((item) => item.id);

    expect(ids).toContain('product_view->add_to_cart:price-position');
    expect(ids).toContain('product_view->add_to_cart:value-proposition');
    expect(ids).toContain('product_view->add_to_cart:reviews-missing');
    expect(ids).toContain('product_view->add_to_cart:cta-clarity');
    expect(ids).toContain('product_view->add_to_cart:imagery-quality');
    expect(ids).toContain('product_view->add_to_cart:delivery-visibility');
  });

  it('maps checkout to purchase onto shipping, payment, complexity, trust and delivery time', () => {
    const items = advise([transition('checkout', 'purchase', 500, 50)]);
    const ids = items.map((item) => item.id);

    expect(ids).toContain('checkout->purchase:shipping-cost');
    expect(ids).toContain('checkout->purchase:payment-methods');
    expect(ids).toContain('checkout->purchase:checkout-complexity');
    expect(ids).toContain('checkout->purchase:trust-signals');
    expect(ids).toContain('checkout->purchase:delivery-time');
  });

  it('covers every adjacent step with its own mapping', () => {
    expect(Object.keys(TRANSITION_CHECKS).sort()).toEqual([
      'add_to_cart->checkout',
      'checkout->purchase',
      'product_view->add_to_cart',
      'session->product_view',
    ]);
  });

  it('raises only advice belonging to the failing step', () => {
    const items = advise([
      transition('session', 'product_view', 1000, 900), // healthy
      transition('checkout', 'purchase', 500, 50), // failing
    ]);
    expect(items.every((item) => item.from === 'checkout')).toBe(true);
  });
});

describe('thresholds', () => {
  it('says nothing about a step at or above its threshold', () => {
    const healthy =
      DEFAULT_FUNNEL_CONFIG.thresholds['product_view->add_to_cart']
        ?.healthyConversion ?? 0.2;
    const items = advise([
      transition('product_view', 'add_to_cart', 1000, Math.round(1000 * healthy)),
    ]);
    expect(items).toHaveLength(0);
  });

  it('raises advice one session below the threshold', () => {
    const items = advise([
      transition('product_view', 'add_to_cart', 1000, 199), // 19.9% vs 20%
    ]);
    expect(items.length).toBeGreaterThan(0);
  });

  it('honours a custom threshold', () => {
    const transitions = [transition('checkout', 'purchase', 500, 300)]; // 60%
    expect(advise(transitions)).toHaveLength(0);

    const strict = funnelRecommendations({
      transitions,
      largestDropOff: null,
      config: {
        thresholds: {
          'checkout->purchase': { healthyConversion: 0.8, minimumSessions: 60 },
        },
      },
    });
    expect(strict.length).toBeGreaterThan(0);
  });

  it('records the threshold it was judged against', () => {
    const items = advise([transition('checkout', 'purchase', 500, 50)]);
    expect(items[0]?.threshold).toBe(
      DEFAULT_FUNNEL_CONFIG.thresholds['checkout->purchase']?.healthyConversion,
    );
  });
});

describe('sample size', () => {
  it('flags low confidence when the step rests on too few sessions', () => {
    const items = advise([transition('checkout', 'purchase', 10, 1)]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.confidence === 'low')).toBe(true);
    expect(items[0]?.sampleSessions).toBe(10);
  });

  it('does not flag a step with a healthy sample', () => {
    const items = advise([transition('checkout', 'purchase', 500, 50)]);
    expect(items.every((item) => item.confidence === 'normal')).toBe(true);
  });

  it('flags exactly at the boundary, and not one above it', () => {
    const minimum =
      DEFAULT_FUNNEL_CONFIG.thresholds['checkout->purchase']?.minimumSessions ?? 60;

    const below = advise([transition('checkout', 'purchase', minimum - 1, 0)]);
    const at = advise([transition('checkout', 'purchase', minimum, 0)]);

    expect(below[0]?.confidence).toBe('low');
    expect(at[0]?.confidence).toBe('normal');
  });

  it('always reports the sample the rate rests on', () => {
    for (const item of advise([transition('checkout', 'purchase', 123, 10)])) {
      expect(item.sampleSessions).toBe(123);
    }
  });
});

describe('no valid stages', () => {
  it('says nothing when a step has no sessions to compare', () => {
    expect(advise([transition('checkout', 'purchase', 0, 0)])).toHaveLength(0);
  });

  it('says nothing for an empty funnel', () => {
    expect(advise([])).toHaveLength(0);
  });
});

describe('framing', () => {
  it('phrases every item as something to verify, never as a finding', () => {
    const items = advise([
      transition('product_view', 'add_to_cart', 1000, 50),
      transition('checkout', 'purchase', 500, 50),
    ]);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      // "may", "might" — never "is" or "because".
      expect(item.hypothesis).toMatch(/\bmay\b/);
      expect(item.howToCheck.length).toBeGreaterThan(10);
      expect(item.ruleVersion).toBe(FUNNEL_RULE_VERSION);
    }
  });

  it('carries the observed numbers alongside each item', () => {
    const items = advise([transition('checkout', 'purchase', 500, 50)]);
    expect(items[0]?.conversion).toBeCloseTo(0.1, 10);
    expect(items[0]?.dropOffRate).toBeCloseTo(0.9, 10);
    expect(items[0]?.dropOffSessions).toBe(450);
  });
});

describe('ordering', () => {
  it('puts the largest drop-off first', () => {
    const cart = transition('product_view', 'add_to_cart', 1000, 100); // 90% lost
    const checkout = transition('checkout', 'purchase', 500, 100); // 80% lost
    const items = advise([cart, checkout], checkout);

    expect(items[0]?.isLargestDropOff).toBe(true);
    expect(items[0]?.from).toBe('checkout');
  });

  it('falls back to the worst drop-off rate when nothing is marked largest', () => {
    const items = advise([
      transition('checkout', 'purchase', 500, 250), // 50% lost
      transition('product_view', 'add_to_cart', 1000, 50), // 95% lost
    ]);
    expect(items[0]?.from).toBe('product_view');
  });

  it('marks only the transition that matches the largest drop-off', () => {
    const cart = transition('product_view', 'add_to_cart', 1000, 100);
    const checkout = transition('checkout', 'purchase', 500, 100);
    const items = advise([cart, checkout], cart);

    expect(
      items.filter((item) => item.isLargestDropOff).every((item) => item.from === 'product_view'),
    ).toBe(true);
  });
});

describe('the largest drop-off is raised even when it is healthy', () => {
  it('raises advice for a healthy step that loses the most', () => {
    // 28.7% conversion clears the 20% threshold, yet it loses 71% of its group
    // — the biggest leak in the funnel. It must not be silent.
    const cart = transition('product_view', 'add_to_cart', 5170, 1483);
    const items = advise([cart], cart);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.raisedBecause).toBe('largest-drop-off');
    expect(items[0]?.isLargestDropOff).toBe(true);
    // The rate is genuinely above the threshold, and the record says so.
    expect(items[0]?.conversion ?? 0).toBeGreaterThan(items[0]?.threshold ?? 1);
  });

  it('labels a failing step as below threshold, not as largest drop-off', () => {
    const checkout = transition('checkout', 'purchase', 613, 223); // 36.4% vs 45%
    const cart = transition('product_view', 'add_to_cart', 5170, 1483);
    const items = advise([cart, checkout], cart);

    const checkoutItems = items.filter((item) => item.from === 'checkout');
    expect(checkoutItems.length).toBeGreaterThan(0);
    expect(
      checkoutItems.every((item) => item.raisedBecause === 'below-threshold'),
    ).toBe(true);
  });

  it('still says nothing about a healthy step that is not the largest loss', () => {
    const healthy = transition('session', 'product_view', 8748, 5170); // 59% vs 55%
    const cart = transition('product_view', 'add_to_cart', 5170, 1483);
    const items = advise([healthy, cart], cart);

    expect(items.some((item) => item.from === 'session')).toBe(false);
  });

  it('puts the largest drop-off first even when another step is below threshold', () => {
    const checkout = transition('checkout', 'purchase', 613, 223);
    const cart = transition('product_view', 'add_to_cart', 5170, 1483);
    const items = advise([checkout, cart], cart);

    expect(items[0]?.isLargestDropOff).toBe(true);
    expect(items[0]?.from).toBe('product_view');
  });
});
