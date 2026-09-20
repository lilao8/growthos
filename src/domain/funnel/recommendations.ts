import type { MetricValue } from '../metrics';
import type { FunnelStage } from '../types';
import type { FunnelTransition } from './funnel-metrics';

/**
 * Funnel recommendation engine.
 *
 * Every item this produces is a **hypothesis to test**, not a diagnosis. The
 * data says where sessions are lost; it does not say why. A high drop-off at
 * checkout is consistent with surprise shipping cost, a clumsy form, or a
 * payment method people do not have — the funnel cannot distinguish them, and
 * saying otherwise would be treating correlation as cause.
 *
 * Every item therefore carries: the transition it came from, the sessions it
 * was computed on, and a confidence flag when that sample is too small to lean
 * on.
 */

export const FUNNEL_RULE_VERSION = 'funnel-1.0.0';

export interface TransitionThreshold {
  /** At or above this conversion rate, the step is treated as healthy. */
  healthyConversion: number;
  /**
   * Below this many sessions entering the step, any rate is noisy enough that
   * the output is marked low confidence.
   */
  minimumSessions: number;
}

export interface FunnelConfig {
  thresholds: Record<string, TransitionThreshold>;
}

function key(from: FunnelStage, to: FunnelStage): string {
  return `${from}->${to}`;
}

/**
 * Thresholds are the project's own rough expectations for a DTC store, not
 * industry standards — no such published benchmark applies across categories.
 * They live here so they can be argued with and changed in one place.
 */
export const DEFAULT_FUNNEL_CONFIG: FunnelConfig = {
  thresholds: {
    [key('session', 'product_view')]: {
      healthyConversion: 0.55,
      minimumSessions: 200,
    },
    [key('product_view', 'add_to_cart')]: {
      healthyConversion: 0.2,
      minimumSessions: 150,
    },
    [key('add_to_cart', 'checkout')]: {
      healthyConversion: 0.4,
      minimumSessions: 100,
    },
    [key('checkout', 'purchase')]: {
      healthyConversion: 0.45,
      minimumSessions: 60,
    },
  },
};

export interface FunnelCheck {
  id: string;
  /** What to look at. Phrased as something to verify, never as a finding. */
  hypothesis: string;
  /** How an operator would test it. */
  howToCheck: string;
}

/**
 * What each step's loss is plausibly about. These mappings are the reason the
 * advice is local: losing people between the product page and the cart is a
 * different problem from losing them inside the checkout.
 */
export const TRANSITION_CHECKS: Record<string, readonly FunnelCheck[]> = {
  [key('session', 'product_view')]: [
    {
      id: 'landing-relevance',
      hypothesis: 'Landing pages may not match what the visit was looking for.',
      howToCheck:
        'Compare the top landing pages against the queries and campaigns sending traffic to them.',
    },
    {
      id: 'navigation-clarity',
      hypothesis: 'Category navigation and search may not lead to products quickly.',
      howToCheck:
        'Walk the path from each top landing page to a product page and count the clicks.',
    },
    {
      id: 'page-performance',
      hypothesis: 'Slow or unstable pages may lose visits before anything loads.',
      howToCheck:
        'Measure load performance on the top landing pages, on a throttled mobile connection.',
    },
  ],
  [key('product_view', 'add_to_cart')]: [
    {
      id: 'price-position',
      hypothesis: 'Price may be out of line with what comparable products ask.',
      howToCheck:
        'Compare price against the alternatives a shopper would see in the same search.',
    },
    {
      id: 'value-proposition',
      hypothesis:
        'The page may not make the case for the product in concrete terms.',
      howToCheck:
        'Check whether the first screen states weight, capacity, rating or whatever the category buys on.',
    },
    {
      id: 'reviews-missing',
      hypothesis: 'Absent or thin reviews may leave the claim unsupported.',
      howToCheck: 'Check review count and recency against the better-converting products.',
    },
    {
      id: 'cta-clarity',
      hypothesis: 'The add-to-cart control may be unclear or below the fold.',
      howToCheck:
        'View the page at mobile width and confirm the action is visible without scrolling.',
    },
    {
      id: 'imagery-quality',
      hypothesis: 'Images may not show the product in use, at scale or in detail.',
      howToCheck:
        'Compare the image set against what the category leaders show, including scale references.',
    },
    {
      id: 'delivery-visibility',
      hypothesis: 'Delivery cost and timing may not be visible before the cart.',
      howToCheck:
        'Check whether shipping cost and delivery estimate appear on the product page itself.',
    },
  ],
  [key('add_to_cart', 'checkout')]: [
    {
      id: 'cart-visibility',
      hypothesis:
        'Adding to cart may not make the next step obvious, leaving people stalled.',
      howToCheck:
        'Add an item and confirm the path to checkout is visible without hunting for it.',
    },
    {
      id: 'cost-surprise-at-cart',
      hypothesis:
        'Costs first revealed at the cart may be causing people to reconsider.',
      howToCheck:
        'Compare the price shown on the product page against the cart subtotal including shipping and tax.',
    },
    {
      id: 'cart-persistence',
      hypothesis: 'Carts may not survive a return visit, so intent is lost between sessions.',
      howToCheck: 'Add an item, leave, return later and confirm the cart is still there.',
    },
  ],
  [key('checkout', 'purchase')]: [
    {
      id: 'shipping-cost',
      hypothesis: 'Shipping cost at checkout may be higher than expected.',
      howToCheck:
        'Compare shipping cost and any free-shipping threshold against the average order value.',
    },
    {
      id: 'payment-methods',
      hypothesis: 'The payment methods offered may not cover what buyers use.',
      howToCheck:
        'List the methods available and compare against what the market expects — wallets included.',
    },
    {
      id: 'checkout-complexity',
      hypothesis: 'The checkout may be asking for too much, or across too many steps.',
      howToCheck:
        'Count the fields and steps required to buy, and whether guest checkout exists.',
    },
    {
      id: 'trust-signals',
      hypothesis:
        'The checkout may not carry the reassurance a first-time buyer needs.',
      howToCheck:
        'Check for returns policy, security indicators and contact details inside the checkout.',
    },
    {
      id: 'delivery-time',
      hypothesis: 'Quoted delivery time may be slower than buyers will accept.',
      howToCheck:
        'Compare the delivery estimate shown at checkout against what competitors promise.',
    },
  ],
};

export type Confidence = 'normal' | 'low';

/**
 * Why a step was raised. These are different questions and both are useful:
 * a step can lose most of its group and still be performing normally for its
 * kind — product page to cart does that in every store — while another step
 * loses fewer people but well under what it should.
 */
export type RaisedBecause = 'below-threshold' | 'largest-drop-off';

export interface FunnelRecommendation {
  id: string;
  from: FunnelStage;
  to: FunnelStage;
  transitionLabel: string;
  hypothesis: string;
  howToCheck: string;
  /** The observed rate this was raised on. */
  conversion: MetricValue;
  dropOffRate: MetricValue;
  dropOffSessions: number;
  /** Sessions entering the step — the sample the rate rests on. */
  sampleSessions: number;
  threshold: number;
  confidence: Confidence;
  /** True when this is the funnel's largest proportional loss. */
  isLargestDropOff: boolean;
  raisedBecause: RaisedBecause;
  ruleVersion: string;
}

export interface FunnelAdviceInput {
  transitions: readonly FunnelTransition[];
  largestDropOff: FunnelTransition | null;
  config?: FunnelConfig;
}

/**
 * A step earns advice when it is either below its threshold, or the funnel's
 * largest proportional loss.
 *
 * Both, because they answer different questions. Threshold catches a step doing
 * worse than it should. Largest drop-off catches where the most people are
 * actually lost — which is frequently a step that is performing normally for
 * its kind, and would otherwise be highlighted at the top of the page with
 * nothing to do about it. Every other step stays silent; filling the screen
 * with advice for healthy steps would bury both signals.
 */
export function funnelRecommendations({
  transitions,
  largestDropOff,
  config = DEFAULT_FUNNEL_CONFIG,
}: FunnelAdviceInput): FunnelRecommendation[] {
  const recommendations: FunnelRecommendation[] = [];

  for (const transition of transitions) {
    if (!transition.comparable) continue;
    const transitionKey = key(transition.from, transition.to);
    const threshold = config.thresholds[transitionKey];
    const checks = TRANSITION_CHECKS[transitionKey];
    if (threshold === undefined || checks === undefined) continue;

    const conversion = transition.conversion;
    if (conversion === null) continue;

    const isLargestDropOff =
      largestDropOff !== null &&
      largestDropOff.from === transition.from &&
      largestDropOff.to === transition.to;
    const belowThreshold = conversion < threshold.healthyConversion;

    if (!belowThreshold && !isLargestDropOff) continue;

    const confidence: Confidence =
      transition.fromSessions < threshold.minimumSessions ? 'low' : 'normal';

    for (const check of checks) {
      recommendations.push({
        id: `${transitionKey}:${check.id}`,
        from: transition.from,
        to: transition.to,
        transitionLabel: transition.label,
        hypothesis: check.hypothesis,
        howToCheck: check.howToCheck,
        conversion,
        dropOffRate: transition.dropOffRate,
        dropOffSessions: transition.dropOffSessions,
        sampleSessions: transition.fromSessions,
        threshold: threshold.healthyConversion,
        confidence,
        isLargestDropOff,
        raisedBecause: belowThreshold ? 'below-threshold' : 'largest-drop-off',
        ruleVersion: FUNNEL_RULE_VERSION,
      });
    }
  }

  // The biggest leak first; within a step, the authored order is the priority
  // order, which is why a stable sort matters here.
  return recommendations.sort((a, b) => {
    if (a.isLargestDropOff !== b.isLargestDropOff) {
      return a.isLargestDropOff ? -1 : 1;
    }
    return (b.dropOffRate ?? 0) - (a.dropOffRate ?? 0);
  });
}
