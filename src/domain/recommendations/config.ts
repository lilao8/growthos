import { PRIORITIES } from '../types';
import type {
  Priority,
  RecommendationQuadrant,
  RecommendationSource,
} from '../types';

/**
 * Recommendation configuration.
 *
 * Everything judgemental lives here: how much each kind of fix is worth, how
 * much work it is, what counts as a problem worth raising, and how those turn
 * into a priority. Spreading these across the aggregators would make the
 * ranking impossible to argue with.
 *
 * Impact and effort are 1–5 **estimates**, not measurements. They say how this
 * project rates a class of fix, not what any particular fix will return. A
 * Quick Win is a guess that something is cheap and worth doing, never a promise
 * of revenue.
 */

export const RECOMMENDATION_RULE_VERSION = 'recommendations-1.0.0';

/** 1 = barely moves anything, 5 = changes the outcome of the channel or page. */
export type Score = 1 | 2 | 3 | 4 | 5;

export interface Weighting {
  impact: Score;
  effort: Score;
  /** Why these two numbers, in one line an operator can disagree with. */
  rationale: string;
}

export const IMPACT_SCALE: Record<Score, string> = {
  1: 'Marginal — unlikely to change any number on its own.',
  2: 'Small — a modest improvement to one page or one channel.',
  3: 'Moderate — a visible improvement to one area.',
  4: 'Large — likely to move a headline metric.',
  5: 'Decisive — the thing currently holding the area back.',
};

export const EFFORT_SCALE: Record<Score, string> = {
  1: 'Minutes — an edit in this tool.',
  2: 'An hour or two — writing or a small template change.',
  3: 'A day — content work, or a change across several pages.',
  4: 'Several days — development, or a coordinated content push.',
  5: 'Weeks — a project with dependencies outside the team.',
};

/** High impact and low effort is the corner worth clearing first. */
export const QUICK_WIN_IMPACT_MIN: Score = 4;
export const QUICK_WIN_EFFORT_MAX: Score = 2;

export function quadrantFor(impact: number, effort: number): RecommendationQuadrant {
  const highImpact = impact >= QUICK_WIN_IMPACT_MIN;
  const lowEffort = effort <= QUICK_WIN_EFFORT_MAX;
  if (highImpact && lowEffort) return 'Quick Win';
  if (highImpact) return 'Strategic';
  if (lowEffort) return 'Low Priority';
  return 'Defer';
}

/**
 * Sort order for priorities.
 *
 * Derived from PRIORITIES rather than restated: two literal arrays with the
 * same contents drift the moment someone adds a level to one of them, and the
 * failure would be a silently wrong sort rather than a type error.
 */
export const PRIORITY_ORDER: readonly Priority[] = PRIORITIES;

export const SOURCE_LABELS: Record<RecommendationSource, string> = {
  seo: 'SEO',
  geo: 'GEO',
  content: 'Content',
  analytics: 'Analytics',
  funnel: 'Funnel',
  amazon: 'Amazon',
};

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

/**
 * Weightings per SEO rule. A missing title is both important and a two-minute
 * fix; rewriting a page around a keyword is neither.
 */
export const SEO_WEIGHTS: Record<string, Weighting> = {
  'meta-title-present': {
    impact: 5,
    effort: 1,
    rationale: 'The page has no headline in search results, and the fix is one field.',
  },
  'meta-title-length': {
    impact: 2,
    effort: 1,
    rationale: 'Truncation costs some clicks; editing the field takes a minute.',
  },
  'meta-description-present': {
    impact: 4,
    effort: 1,
    rationale: 'The result snippet is being written by an algorithm instead of by you.',
  },
  'meta-description-length': {
    impact: 2,
    effort: 1,
    rationale: 'Wasted or truncated space in the snippet; a quick edit.',
  },
  h1: {
    impact: 4,
    effort: 2,
    rationale: 'Nothing on the page states its subject; needs a template or content change.',
  },
  'url-slug': {
    impact: 2,
    effort: 4,
    rationale: 'Low upside, and changing a URL means redirects and lost history.',
  },
  canonical: {
    impact: 4,
    effort: 2,
    rationale: 'Ranking signals may be pointed at the wrong page; a template fix.',
  },
  'image-alt': {
    impact: 3,
    effort: 2,
    rationale: 'Accessibility and image search both suffer; writing alt text is quick.',
  },
  'internal-links': {
    impact: 3,
    effort: 2,
    rationale: 'An orphaned page is hard to reach; adding links is content work.',
  },
  'structured-data': {
    impact: 3,
    effort: 3,
    rationale: 'Machine-readable price and stock, but it needs a template change.',
  },
  indexability: {
    impact: 5,
    effort: 1,
    rationale: 'A noindex page cannot rank at all. Confirm whether that is intended.',
  },
  'keyword-usage': {
    impact: 3,
    effort: 3,
    rationale: 'Either the copy or the target needs rethinking — not a field edit.',
  },
};

export const DEFAULT_SEO_WEIGHT: Weighting = {
  impact: 3,
  effort: 3,
  rationale: 'No specific weighting for this rule; treated as a middling fix.',
};

// ---------------------------------------------------------------------------
// GEO
// ---------------------------------------------------------------------------

export const GEO_WEIGHTS: Record<string, Weighting> = {
  'topic-clarity': {
    impact: 4,
    effort: 2,
    rationale: 'Without a clear subject nothing else about the page can be used.',
  },
  'direct-answer': {
    impact: 5,
    effort: 2,
    rationale: 'The single most quotable unit on the page, and one sentence to write.',
  },
  'faq-coverage': {
    impact: 4,
    effort: 3,
    rationale: 'Maps onto how people ask; needs real questions and real answers.',
  },
  'heading-structure': {
    impact: 3,
    effort: 2,
    rationale: 'Lets a machine segment the page; usually a template change.',
  },
  'factual-density': {
    impact: 5,
    effort: 3,
    rationale: 'Concrete facts are what gets quoted; someone has to measure them.',
  },
  'entity-clarity': {
    impact: 3,
    effort: 1,
    rationale: 'Attribution needs a named brand; usually a title and markup edit.',
  },
  'structured-product-facts': {
    impact: 4,
    effort: 3,
    rationale: 'Removes the need to infer price and stock from prose.',
  },
  'source-evidence': {
    impact: 4,
    effort: 4,
    rationale: 'A checkable claim is worth citing, but the testing has to happen first.',
  },
  'original-information': {
    impact: 5,
    effort: 5,
    rationale: 'The strongest reason to be cited, and the most work to produce.',
  },
  extractability: {
    impact: 4,
    effort: 3,
    rationale: 'Restructuring prose into liftable claims is real content work.',
  },
};

export const DEFAULT_GEO_WEIGHT: Weighting = {
  impact: 3,
  effort: 3,
  rationale: 'No specific weighting for this rule; treated as a middling fix.',
};

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface ContentThresholds {
  /** Opportunity score at or above which an unstarted idea is worth raising. */
  highOpportunity: number;
  /** Statuses that count as "not started". */
  unstartedStatuses: readonly string[];
}

export const CONTENT_THRESHOLDS: ContentThresholds = {
  highOpportunity: 70,
  unstartedStatuses: ['Idea'],
};

export const CONTENT_WEIGHT: Weighting = {
  impact: 4,
  effort: 3,
  rationale:
    'A high-opportunity topic nobody has started; writing it is a day of work.',
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsThresholds {
  /**
   * Below this many sessions a channel's rates are too noisy to draw a
   * conclusion from, so no recommendation is generated at all.
   */
  minimumSessions: number;
  /** Below this many orders, a rate-based finding is flagged low confidence. */
  minimumOrders: number;
  /** A channel converting below this, with real traffic, is worth a look. */
  lowConversionRate: number;
  /** ROAS below this is losing money after the rest of the cost base. */
  minimumRoas: number;
  /** CAC above this share of AOV is unsustainable on a single order. */
  maxCacShareOfAov: number;
}

export const ANALYTICS_THRESHOLDS: AnalyticsThresholds = {
  minimumSessions: 300,
  minimumOrders: 25,
  lowConversionRate: 0.015,
  minimumRoas: 2,
  maxCacShareOfAov: 0.5,
};

export const ANALYTICS_WEIGHTS: Record<string, Weighting> = {
  'high-traffic-low-conversion': {
    impact: 5,
    effort: 4,
    rationale:
      'Traffic already paid for that is not converting; diagnosing it is real work.',
  },
  'roas-below-target': {
    impact: 5,
    effort: 2,
    rationale: 'Spend is losing money. Pausing or reallocating it is a decision, not a build.',
  },
  'cac-above-aov-share': {
    impact: 4,
    effort: 2,
    rationale: 'Each new customer costs too much relative to the first order.',
  },
};

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export const FUNNEL_WEIGHTS: Record<string, Weighting> = {
  'session->product_view': {
    impact: 4,
    effort: 3,
    rationale: 'Losing visits before they see a product; landing and navigation work.',
  },
  'product_view->add_to_cart': {
    impact: 5,
    effort: 3,
    rationale: 'The largest population in the funnel; content and merchandising work.',
  },
  'add_to_cart->checkout': {
    impact: 4,
    effort: 2,
    rationale: 'Clear intent already shown; usually a UX fix rather than a rebuild.',
  },
  'checkout->purchase': {
    impact: 5,
    effort: 3,
    rationale: 'The closest to revenue, and usually fixable without new traffic.',
  },
};

export const DEFAULT_FUNNEL_WEIGHT: Weighting = {
  impact: 4,
  effort: 3,
  rationale: 'No specific weighting for this step; treated as an important fix.',
};

/**
 * Priority comes from impact and how badly the rule is failing, not from
 * effort — a hard problem is not a less urgent one.
 */
export function priorityFrom(impact: number, severeFailure: boolean): Priority {
  if (impact >= 5 && severeFailure) return 'Critical';
  if (impact >= 4) return severeFailure ? 'Critical' : 'High';
  if (impact >= 3) return severeFailure ? 'High' : 'Medium';
  return severeFailure ? 'Medium' : 'Low';
}

// ---------------------------------------------------------------------------
// Amazon listings (Dispatch 10)
// ---------------------------------------------------------------------------

export const AMAZON_WEIGHTS: Record<string, Weighting> = {
  'listing-status': {
    impact: 5,
    effort: 3,
    rationale:
      'A suppressed listing sells nothing at all, so this outranks every content improvement on the same ASIN. The effort is unknown until the suppression reason is read, so it is scored as moderate.',
  },
  'main-image-compliance': {
    impact: 5,
    effort: 2,
    rationale:
      'A non-compliant main image is a live suppression risk, and replacing one image is a contained job.',
  },
  'title-length': {
    impact: 4,
    effort: 1,
    rationale:
      'The title is the listing’s headline in search results, and editing it is one field.',
  },
  'title-structure': {
    impact: 4,
    effort: 1,
    rationale:
      'Promotional wording in a title risks a policy strike and buys nothing; removing it is a single edit.',
  },
  'bullets-count': {
    impact: 4,
    effort: 2,
    rationale:
      'Empty bullets are free selling space left unused. Writing them takes an hour, not a project.',
  },
  'bullets-length': {
    impact: 2,
    effort: 2,
    rationale:
      'Length affects how much of a bullet a mobile shopper sees, but the information is at least present.',
  },
  'image-count': {
    impact: 4,
    effort: 4,
    rationale:
      'Images do most of the selling on a marketplace, but new photography is a real production cost.',
  },
  'backend-search-terms': {
    impact: 4,
    effort: 1,
    rationale:
      'Backend terms decide which searches the listing can appear in at all, and the fix is one field.',
  },
  'browse-node': {
    impact: 4,
    effort: 1,
    rationale:
      'The browse node gates category filters and best-seller eligibility; assigning it is a single change.',
  },
  'variation-relationship': {
    impact: 4,
    effort: 4,
    rationale:
      'Merging standalone listings into a family consolidates reviews and ranking, but rebuilding a family is fiddly and briefly disruptive.',
  },
  'aplus-content': {
    impact: 3,
    effort: 3,
    rationale:
      'A+ modules lift conversion on a registered brand, and building them is a design job rather than a text edit.',
  },
  'buy-box': {
    impact: 5,
    effort: 4,
    rationale:
      'Without the buy box the traffic converts for someone else. The causes — price, stock, account health — are mostly not a copy fix.',
  },
  'review-health': {
    impact: 4,
    effort: 5,
    rationale:
      'Ratings drive conversion, but moving one is slow and usually needs a product or expectation change rather than an edit.',
  },
  'video-present': {
    impact: 2,
    effort: 4,
    rationale: 'Optional, and producing video is a real cost.',
  },
};

export const DEFAULT_AMAZON_WEIGHT: Weighting = {
  impact: 3,
  effort: 3,
  rationale: 'No specific weighting for this rule; treated as a middling fix.',
};

/**
 * Advertising weightings.
 *
 * Effort is low across the board because these are changes inside the ad
 * console — adding an exact target or a negative keyword takes minutes. What
 * varies is impact, and the honest ordering is: stop the bleeding first, then
 * take control of what already works.
 */
export const AD_WEIGHTS: Record<string, Weighting> = {
  'negate-search-term': {
    impact: 4,
    effort: 1,
    rationale:
      'Spend going to a term that has never converted is the clearest waste in an ad account, and adding a negative keyword takes a minute. Impact is 4 rather than 5 because the money saved is usually modest next to a listing or price problem.',
  },
  'harvest-search-term': {
    impact: 3,
    effort: 1,
    rationale:
      'The term is already being served, so this buys control over its bid rather than new volume. Cheap to do, real but bounded upside.',
  },
  'campaign-acos': {
    impact: 4,
    effort: 3,
    rationale:
      'A campaign well above target ACOS is spending faster than the brand intends, but the fix is bid and targeting work with an uncertain outcome, not a single edit.',
  },
  'low-organic-share': {
    impact: 4,
    effort: 5,
    rationale:
      'An ASIN that stops selling the moment ads pause is a structural risk. Building organic demand is a long programme of listing, review and content work, not an ad change.',
  },
};

export const DEFAULT_AD_WEIGHT: Weighting = {
  impact: 3,
  effort: 2,
  rationale: 'No specific weighting for this rule; treated as a cheap fix with moderate upside.',
};

// ---------------------------------------------------------------------------
// Traffic weighting
// ---------------------------------------------------------------------------

/**
 * How busy a page is, relative to the rest of the catalogue.
 *
 * Relative rather than absolute on purpose: an absolute threshold ("busy means
 * 500 sessions") would need retuning for every dataset and would say nothing
 * about whether a page is busy *for this shop*. Terciles are self-calibrating
 * and can be stated honestly on screen — "top third of the catalogue", not
 * "high traffic".
 *
 * `unknown` exists because a product with no traffic record is not the same as
 * a product with no traffic, and guessing between them would be inventing a
 * verdict.
 */
export const TRAFFIC_BANDS = ['high', 'typical', 'low', 'none', 'unknown'] as const;
export type TrafficBand = (typeof TRAFFIC_BANDS)[number];

/** Terciles need at least this many products with a traffic record to mean anything. */
export const TRAFFIC_BAND_MINIMUM_PRODUCTS = 6;

/**
 * Bands every product by session volume.
 *
 * Products with a record but zero sessions are banded `none` rather than
 * `low`: "nobody looked at this page" and "fewer people looked at this page
 * than most" are different statements and deserve different wording.
 */
export function trafficBands(
  viewSessionsByProduct: ReadonlyMap<string, number>,
): Map<string, TrafficBand> {
  const bands = new Map<string, TrafficBand>();
  const withTraffic = [...viewSessionsByProduct.entries()].filter(
    ([, sessions]) => sessions > 0,
  );

  for (const [productId, sessions] of viewSessionsByProduct) {
    if (sessions === 0) bands.set(productId, 'none');
  }

  // Too few pages to split into thirds: saying "top third of six" is a claim
  // the data cannot support, so nothing is adjusted.
  if (withTraffic.length < TRAFFIC_BAND_MINIMUM_PRODUCTS) {
    for (const [productId] of withTraffic) bands.set(productId, 'typical');
    return bands;
  }

  const sorted = [...withTraffic].sort((a, b) => b[1] - a[1]);
  const cut = Math.floor(sorted.length / 3);

  sorted.forEach(([productId], index) => {
    if (index < cut) bands.set(productId, 'high');
    else if (index >= sorted.length - cut) bands.set(productId, 'low');
    else bands.set(productId, 'typical');
  });

  return bands;
}

/**
 * How much a band moves impact.
 *
 * Deliberately ±1 rather than a multiplier. Traffic decides which of two
 * comparable findings to do first; it does not decide whether a finding is
 * serious. A missing page title is a serious defect on a quiet page too, and
 * scaling impact by traffic would let a busy page's cosmetic warning outrank
 * another page's outright failure.
 */
export const TRAFFIC_IMPACT_ADJUSTMENT: Record<TrafficBand, number> = {
  high: 1,
  typical: 0,
  low: -1,
  none: -1,
  unknown: 0,
};
