/**
 * Amazon listing audit configuration.
 *
 * What this model is, stated plainly because it is easy to oversell:
 *
 * - These are this project's listing conventions for a US marketplace demo.
 *   They are not Amazon's published requirements, and Amazon's own category
 *   rules vary by browse node in ways a fixture cannot represent.
 * - A score here does not predict search rank, buy box share or sales. It
 *   says how complete and well-formed the listing content is.
 * - Nothing is fetched. No SP-API call, no crawl. The audit grades a stored
 *   record of a listing, exactly as the SEO audit grades a stored snapshot.
 *
 * Deliberately NOT a rename of the SEO rules. Canonical URLs, robots
 * directives and internal links have no meaning on Amazon; bullets, backend
 * search terms, variation families and buy box share have no meaning on a
 * storefront page. The two rule sets share only their shape.
 */

export const AMAZON_RULE_VERSION = 'amazon-listing-1.0.0';

export interface AmazonListingConfig {
  /** Title character guidance. Amazon's own cap varies by category. */
  titleMin: number;
  titleMax: number;
  /** Bullets Amazon displays. Fewer is a real gap, not a style choice. */
  bulletsExpected: number;
  bulletMinChars: number;
  bulletMaxChars: number;
  /** Images below this read as an incomplete listing. */
  imageCountMin: number;
  imageCountHealthy: number;
  /**
   * Backend search terms are capped in BYTES, not characters. Measuring
   * characters would pass a listing that Amazon silently truncates.
   */
  backendSearchTermsMaxBytes: number;
  /** Below this the field is under-used rather than over-full. */
  backendSearchTermsMinBytes: number;
  /** Ratings below this are a problem worth surfacing. */
  ratingFloor: number;
  /** Fewer reviews than this cannot support a conclusion about rating. */
  reviewMinimumSample: number;
  /** Buy box share below this is worth investigating. */
  buyBoxFloor: number;
  /** Words that describe nothing and waste title or bullet space. */
  fillerPhrases: readonly string[];
}

export const DEFAULT_AMAZON_CONFIG: AmazonListingConfig = {
  titleMin: 50,
  titleMax: 200,
  bulletsExpected: 5,
  bulletMinChars: 40,
  bulletMaxChars: 250,
  imageCountMin: 3,
  imageCountHealthy: 6,
  backendSearchTermsMaxBytes: 250,
  backendSearchTermsMinBytes: 80,
  ratingFloor: 4,
  reviewMinimumSample: 15,
  buyBoxFloor: 0.9,
  fillerPhrases: [
    'best seller',
    'best-seller',
    'top quality',
    'high quality',
    'amazing',
    'perfect for everyone',
    '100% satisfaction',
    'free shipping',
    'sale',
  ],
};

export const AMAZON_RULE_IDS = [
  'listing-status',
  'title-length',
  'title-structure',
  'bullets-count',
  'bullets-length',
  'image-count',
  'main-image-compliance',
  'video-present',
  'aplus-content',
  'backend-search-terms',
  'browse-node',
  'variation-relationship',
  'review-health',
  'buy-box',
] as const;

export type AmazonRuleId = (typeof AMAZON_RULE_IDS)[number];

export interface AmazonRuleMeta {
  id: AmazonRuleId;
  title: string;
  /** What an operator gets out of this check. */
  rationale: string;
}

export const AMAZON_RULE_META: Record<AmazonRuleId, AmazonRuleMeta> = {
  'listing-status': {
    id: 'listing-status',
    title: 'Listing status',
    rationale:
      'A suppressed listing is hidden from search and the buy box, so every other improvement on it earns nothing until it is reinstated.',
  },
  'title-length': {
    id: 'title-length',
    title: 'Title length',
    rationale:
      'Titles far outside the guideline get truncated in search results or read as thin. The exact cap is set per category by Amazon.',
  },
  'title-structure': {
    id: 'title-structure',
    title: 'Title structure',
    rationale:
      'A title that opens with the brand and carries the defining attribute is readable to a shopper skimming a results page. Filler and promotional claims waste that space and can breach listing policy.',
  },
  'bullets-count': {
    id: 'bullets-count',
    title: 'Bullet count',
    rationale:
      'Amazon shows five bullets. Leaving some empty gives away space a competitor is using.',
  },
  'bullets-length': {
    id: 'bullets-length',
    title: 'Bullet length',
    rationale:
      'Very short bullets carry no information; very long ones get collapsed behind a "read more" on mobile, where most shoppers are.',
  },
  'image-count': {
    id: 'image-count',
    title: 'Image count',
    rationale:
      'Images do most of the selling on a marketplace where the shopper cannot handle the product.',
  },
  'main-image-compliance': {
    id: 'main-image-compliance',
    title: 'Main image compliance',
    rationale:
      'The main image must be the product on a pure white background. A non-compliant main image is a common cause of suppression.',
  },
  'video-present': {
    id: 'video-present',
    title: 'Listing video',
    rationale:
      'Video is optional, not required. It is flagged as an opportunity rather than a fault.',
  },
  'aplus-content': {
    id: 'aplus-content',
    title: 'A+ content',
    rationale:
      'A+ modules are available to brand-registered sellers and replace the plain description. Unused A+ on a registered brand is unused inventory.',
  },
  'backend-search-terms': {
    id: 'backend-search-terms',
    title: 'Backend search terms',
    rationale:
      'Backend terms are indexed but never shown, so they are the place for synonyms and misspellings. The limit is in bytes, and anything past it is discarded silently. Repeating words already in the title wastes the budget.',
  },
  'browse-node': {
    id: 'browse-node',
    title: 'Browse node',
    rationale:
      'The browse node decides which category filters and best-seller lists the listing can appear in.',
  },
  'variation-relationship': {
    id: 'variation-relationship',
    title: 'Variation relationship',
    rationale:
      'Sizes and colours of one product belong in a variation family, so reviews and ranking accrue to the family instead of being split across standalone listings.',
  },
  'review-health': {
    id: 'review-health',
    title: 'Review health',
    rationale:
      'Rating and review volume drive both conversion and eligibility for some placements. A rating on very few reviews is noise, not a verdict.',
  },
  'buy-box': {
    id: 'buy-box',
    title: 'Buy box share',
    rationale:
      'Without the buy box the add-to-cart button belongs to someone else, so traffic to the listing converts for a competitor.',
  },
};

/**
 * Shown wherever a listing score appears, for the same reason the SEO and GEO
 * disclaimers exist: a number with no stated limits gets quoted as a fact.
 */
export const AMAZON_DISCLAIMER =
  'These checks are this project’s listing conventions for a US marketplace demo, not Amazon’s published requirements — real category rules vary by browse node. A score here describes how complete the listing content is. It does not predict search rank, buy box share or sales. All data is seeded demo data: this project never calls SP-API and never crawls Amazon.';
