import type { AmazonListing, AuditCheck, Product, Severity } from '../types';
import {
  AMAZON_RULE_META,
  type AmazonListingConfig,
  type AmazonRuleId,
} from './config';

/**
 * The fourteen Amazon listing rules.
 *
 * Each is a pure function of the listing, its product and the configuration.
 * Nothing is fetched — the input is a stored record, and the audit grades what
 * was recorded.
 *
 * Status meanings, identical to the SEO engine so the two read the same way:
 * - `pass`    the listing satisfies the rule
 * - `warning` it works but is outside this project's guidance
 * - `error`   something required is missing or wrong
 * - `unknown` the rule could not be evaluated — never a pass; it lowers
 *             coverage instead
 */

export interface AmazonRuleInput {
  listing: AmazonListing;
  /** The product behind the listing, for cross-checking brand and family. */
  product: Product | null;
  config: AmazonListingConfig;
}

type RuleFn = (input: AmazonRuleInput) => AuditCheck;

function check(
  ruleId: AmazonRuleId,
  status: AuditCheck['status'],
  severity: Severity,
  message: string,
  recommendation: string,
  evidence: string | null,
): AuditCheck {
  return {
    ruleId,
    status,
    severity,
    message,
    explanation: AMAZON_RULE_META[ruleId].rationale,
    recommendation,
    evidence,
    // Status-weighted, like the SEO engine — not banded like GEO.
    points: null,
  };
}

/**
 * UTF-8 byte length.
 *
 * Amazon caps backend search terms in bytes. Using `String.length` would pass
 * a field that Amazon silently truncates: one CJK character costs three bytes,
 * and an emoji four, so a 200-character field can be 600 bytes.
 */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

const listingStatus: RuleFn = ({ listing }) => {
  if (listing.status === 'suppressed') {
    return check(
      'listing-status',
      'error',
      'critical',
      'This listing is suppressed and is not visible to shoppers.',
      'Find the suppression reason in Seller Central and fix the failing attribute. Nothing else on this listing earns anything until it is live again.',
      'status: suppressed',
    );
  }
  if (listing.status === 'inactive') {
    return check(
      'listing-status',
      'warning',
      'high',
      'This listing is inactive.',
      'Confirm this is deliberate. If it should be selling, reactivate it before investing in its content.',
      'status: inactive',
    );
  }
  return check(
    'listing-status',
    'pass',
    'info',
    'This listing is active.',
    'No action needed.',
    'status: active',
  );
};

const titleLength: RuleFn = ({ listing, config }) => {
  const title = listing.title.trim();
  if (title === '') {
    return check(
      'title-length',
      'error',
      'critical',
      'This listing has no title.',
      'Write a title leading with the brand, then the product type and its defining attribute.',
      'title: empty',
    );
  }

  const length = title.length;
  const evidence = `${length} characters`;

  if (length > config.titleMax) {
    return check(
      'title-length',
      'error',
      'high',
      `The title is ${length} characters, beyond the ${config.titleMax}-character guideline and at risk of truncation or suppression.`,
      'Cut to the brand, product type and the two attributes a shopper filters on.',
      evidence,
    );
  }
  if (length < config.titleMin) {
    return check(
      'title-length',
      'warning',
      'medium',
      `The title is ${length} characters, shorter than the ${config.titleMin}-character guideline.`,
      'Add the defining attributes a shopper searches on — capacity, size, material or count.',
      evidence,
    );
  }
  return check(
    'title-length',
    'pass',
    'info',
    `The title is ${length} characters, within the ${config.titleMin}–${config.titleMax} guideline.`,
    'No action needed.',
    evidence,
  );
};

const titleStructure: RuleFn = ({ listing, product, config }) => {
  const title = listing.title.trim();
  if (title === '') {
    return check(
      'title-structure',
      'unknown',
      'info',
      'Structure cannot be assessed because there is no title.',
      'Add a title first; this check will then apply.',
      null,
    );
  }

  const lower = title.toLowerCase();
  const found = config.fillerPhrases.filter((phrase) => lower.includes(phrase));
  if (found.length > 0) {
    return check(
      'title-structure',
      'error',
      'high',
      `The title contains promotional or filler wording: ${found.join(', ')}.`,
      'Remove it. Promotional claims in a title can breach listing policy, and the space buys nothing.',
      found.join(', '),
    );
  }

  // The brand is checked from the product record rather than a hardcoded
  // string, so a rebrand cannot leave the rule asserting the old name.
  const brand = product?.title.split(' ')[0]?.toLowerCase() ?? null;
  const startsWithBrand =
    brand !== null && brand !== '' && lower.startsWith(brand);

  if (!startsWithBrand) {
    return check(
      'title-structure',
      'warning',
      'medium',
      'The title does not open with the brand name.',
      'Lead with the brand, then the product type, then the defining attribute.',
      `title starts: "${title.slice(0, 40)}"`,
    );
  }

  if (/[|]{2,}|[!]{1,}|[A-Z]{6,}/.test(title)) {
    return check(
      'title-structure',
      'warning',
      'low',
      'The title uses shouting punctuation or long all-caps runs.',
      'Use sentence case with single separators; all-caps reads as spam and is harder to scan.',
      title,
    );
  }

  return check(
    'title-structure',
    'pass',
    'info',
    'The title opens with the brand and carries no filler.',
    'No action needed.',
    title,
  );
};

const bulletsCount: RuleFn = ({ listing, config }) => {
  const filled = listing.bullets.filter((bullet) => bullet.trim() !== '');
  const evidence = `${filled.length} of ${config.bulletsExpected} bullets used`;

  if (filled.length === 0) {
    return check(
      'bullets-count',
      'error',
      'critical',
      'This listing has no bullet points.',
      'Write five bullets, each covering one thing a shopper needs to decide: fit, material, capacity, what is included, and the guarantee.',
      evidence,
    );
  }
  if (filled.length < config.bulletsExpected) {
    return check(
      'bullets-count',
      'warning',
      'medium',
      `Only ${filled.length} of ${config.bulletsExpected} bullets are used.`,
      'Fill the remaining bullets; the space is free and a competitor is using theirs.',
      evidence,
    );
  }
  return check(
    'bullets-count',
    'pass',
    'info',
    `All ${config.bulletsExpected} bullets are used.`,
    'No action needed.',
    evidence,
  );
};

const bulletsLength: RuleFn = ({ listing, config }) => {
  const filled = listing.bullets.filter((bullet) => bullet.trim() !== '');
  if (filled.length === 0) {
    return check(
      'bullets-length',
      'unknown',
      'info',
      'Bullet length cannot be assessed because there are no bullets.',
      'Add bullets first; this check will then apply.',
      null,
    );
  }

  const tooShort = filled.filter(
    (bullet) => bullet.trim().length < config.bulletMinChars,
  );
  const tooLong = filled.filter(
    (bullet) => bullet.trim().length > config.bulletMaxChars,
  );

  if (tooShort.length > 0) {
    return check(
      'bullets-length',
      'warning',
      'medium',
      `${tooShort.length} bullet(s) are under ${config.bulletMinChars} characters and carry little information.`,
      'Expand each into a concrete claim with a number or a material in it.',
      tooShort.map((bullet) => `"${bullet.trim()}"`).join(' | '),
    );
  }
  if (tooLong.length > 0) {
    return check(
      'bullets-length',
      'warning',
      'low',
      `${tooLong.length} bullet(s) exceed ${config.bulletMaxChars} characters and will be collapsed on mobile.`,
      'Put the decisive fact in the first line of each bullet and trim the rest.',
      tooLong.map((bullet) => `${bullet.trim().length} chars`).join(', '),
    );
  }
  return check(
    'bullets-length',
    'pass',
    'info',
    `All ${filled.length} bullets are within the ${config.bulletMinChars}–${config.bulletMaxChars} character guideline.`,
    'No action needed.',
    `${filled.length} bullets`,
  );
};

const imageCount: RuleFn = ({ listing, config }) => {
  const evidence = `${listing.imageCount} image(s)`;

  if (listing.imageCount === 0) {
    return check(
      'image-count',
      'error',
      'critical',
      'This listing has no images.',
      'Add a compliant main image first, then lifestyle, scale and detail shots.',
      evidence,
    );
  }
  if (listing.imageCount < config.imageCountMin) {
    return check(
      'image-count',
      'error',
      'high',
      `This listing has ${listing.imageCount} image(s), below the minimum of ${config.imageCountMin}.`,
      'Add shots that answer the questions the bullets cannot: scale, what is in the box, and the product in use.',
      evidence,
    );
  }
  if (listing.imageCount < config.imageCountHealthy) {
    return check(
      'image-count',
      'warning',
      'low',
      `This listing has ${listing.imageCount} images, below the ${config.imageCountHealthy} this project treats as healthy.`,
      'Add a scale reference and a what-is-included shot.',
      evidence,
    );
  }
  return check(
    'image-count',
    'pass',
    'info',
    `This listing has ${listing.imageCount} images.`,
    'No action needed.',
    evidence,
  );
};

const mainImageCompliance: RuleFn = ({ listing }) => {
  if (listing.mainImageWhiteBackground === 'unknown') {
    // Never a pass. This project does not see image files, and guessing
    // compliance would be inventing a verdict about a suppression risk.
    return check(
      'main-image-compliance',
      'unknown',
      'info',
      'Whether the main image is on a pure white background was not recorded.',
      'Check the main image in Seller Central and record the result; this demo cannot inspect image files.',
      'mainImageWhiteBackground: unknown',
    );
  }
  if (listing.mainImageWhiteBackground === 'no') {
    return check(
      'main-image-compliance',
      'error',
      'critical',
      'The main image is not on a pure white background.',
      'Replace it with the product alone on pure white. This is a frequent cause of suppression.',
      'mainImageWhiteBackground: no',
    );
  }
  return check(
    'main-image-compliance',
    'pass',
    'info',
    'The main image is on a pure white background.',
    'No action needed.',
    'mainImageWhiteBackground: yes',
  );
};

const videoPresent: RuleFn = ({ listing }) => {
  if (!listing.hasVideo) {
    return check(
      'video-present',
      'warning',
      'low',
      'This listing has no video.',
      'Optional, not required. A short demonstration helps most where the product’s use is hard to photograph.',
      'hasVideo: false',
    );
  }
  return check(
    'video-present',
    'pass',
    'info',
    'This listing has a video.',
    'No action needed.',
    'hasVideo: true',
  );
};

const aPlusContent: RuleFn = ({ listing }) => {
  if (!listing.brandRegistered) {
    // Not a failing of the listing: A+ is unavailable without registration.
    return check(
      'aplus-content',
      'unknown',
      'info',
      'A+ content is not available because the brand is not registered.',
      'Brand Registry is the prerequisite. Until then this check cannot apply.',
      'brandRegistered: false',
    );
  }
  if (listing.aPlusModules.length === 0) {
    return check(
      'aplus-content',
      'error',
      'high',
      'The brand is registered but this listing uses no A+ content.',
      'Add A+ modules; on a registered brand they replace the plain description and the space is already paid for.',
      'aPlusModules: none',
    );
  }
  return check(
    'aplus-content',
    'pass',
    'info',
    `This listing uses ${listing.aPlusModules.length} A+ module(s).`,
    'No action needed.',
    listing.aPlusModules.join(', '),
  );
};

const backendSearchTerms: RuleFn = ({ listing, config }) => {
  const value = listing.backendSearchTerms.trim();
  if (value === '') {
    return check(
      'backend-search-terms',
      'error',
      'high',
      'No backend search terms are set.',
      'Add synonyms, common misspellings and use-cases that do not belong in the visible copy.',
      'backendSearchTerms: empty',
    );
  }

  const bytes = byteLength(value);
  const evidence = `${bytes} bytes of ${config.backendSearchTermsMaxBytes} (${value.length} characters)`;

  if (bytes > config.backendSearchTermsMaxBytes) {
    return check(
      'backend-search-terms',
      'error',
      'high',
      `Backend search terms are ${bytes} bytes, over the ${config.backendSearchTermsMaxBytes}-byte limit. Everything past the limit is discarded silently.`,
      'Cut to fit. Note the limit is bytes, not characters — accented and non-Latin characters cost two to four bytes each.',
      evidence,
    );
  }

  const termWords = words(value);
  const titleWords = new Set(words(listing.title));
  const duplicatedFromTitle = [...new Set(termWords)].filter((word) =>
    titleWords.has(word),
  );
  const repeated = termWords.length - new Set(termWords).size;

  if (duplicatedFromTitle.length > 0 || repeated > 0) {
    const parts = [
      duplicatedFromTitle.length > 0
        ? `${duplicatedFromTitle.length} word(s) already in the title: ${duplicatedFromTitle.join(', ')}`
        : null,
      repeated > 0 ? `${repeated} repeated word(s)` : null,
    ].filter((part): part is string => part !== null);

    return check(
      'backend-search-terms',
      'warning',
      'medium',
      `Backend terms waste part of the byte budget — ${parts.join('; ')}.`,
      'Words indexed from the title do not need repeating here. Use the space for synonyms and misspellings instead.',
      `${evidence}; ${parts.join('; ')}`,
    );
  }

  if (bytes < config.backendSearchTermsMinBytes) {
    return check(
      'backend-search-terms',
      'warning',
      'low',
      `Backend terms use only ${bytes} of ${config.backendSearchTermsMaxBytes} available bytes.`,
      'Add more synonyms and misspellings; unused bytes index nothing.',
      evidence,
    );
  }

  return check(
    'backend-search-terms',
    'pass',
    'info',
    `Backend terms use ${bytes} of ${config.backendSearchTermsMaxBytes} bytes with no wasted repetition.`,
    'No action needed.',
    evidence,
  );
};

const browseNode: RuleFn = ({ listing }) => {
  if (listing.browseNode === null || listing.browseNode.trim() === '') {
    return check(
      'browse-node',
      'error',
      'high',
      'No browse node is assigned.',
      'Assign the most specific matching node so the listing appears in category filters and best-seller lists.',
      'browseNode: absent',
    );
  }
  return check(
    'browse-node',
    'pass',
    'info',
    'A browse node is assigned.',
    'No action needed.',
    `browseNode: ${listing.browseNode}`,
  );
};

const variationRelationship: RuleFn = ({ listing }) => {
  const siblings = listing.expectedVariationSiblings;
  if (siblings.length === 0) {
    return check(
      'variation-relationship',
      'pass',
      'info',
      'This product has no sibling variants, so a standalone listing is correct.',
      'No action needed.',
      'expectedVariationSiblings: none',
    );
  }
  if (listing.variationParentAsin === null) {
    return check(
      'variation-relationship',
      'error',
      'high',
      `This listing stands alone although ${siblings.length} sibling variant(s) exist.`,
      'Build a variation family so reviews and ranking accrue to the parent instead of being split across separate listings.',
      `siblings: ${siblings.join(', ')}`,
    );
  }
  return check(
    'variation-relationship',
    'pass',
    'info',
    `This listing is a child of ${listing.variationParentAsin}.`,
    'No action needed.',
    `parent: ${listing.variationParentAsin}; siblings: ${siblings.join(', ')}`,
  );
};

const reviewHealth: RuleFn = ({ listing, config }) => {
  if (listing.reviewCount === 0 || listing.averageRating === null) {
    return check(
      'review-health',
      'warning',
      'medium',
      'This listing has no reviews.',
      'Enrol in Vine or request reviews through the permitted channel. A listing with no social proof converts poorly.',
      `reviewCount: ${listing.reviewCount}`,
    );
  }

  const evidence = `${listing.averageRating.toFixed(1)} stars from ${listing.reviewCount} review(s)`;

  // A rating on a handful of reviews is noise. Report it, but refuse to
  // conclude from it — the same low-sample discipline the channel and funnel
  // modules use.
  if (listing.reviewCount < config.reviewMinimumSample) {
    return check(
      'review-health',
      'warning',
      'low',
      `Only ${listing.reviewCount} review(s), below the ${config.reviewMinimumSample} this project needs before reading anything into a rating.`,
      'Treat the rating as provisional and keep gathering reviews. Do not act on a rating this thin.',
      `${evidence} — below minimum sample`,
    );
  }

  if (listing.averageRating < config.ratingFloor) {
    return check(
      'review-health',
      'error',
      'high',
      `The rating is ${listing.averageRating.toFixed(1)}, below the ${config.ratingFloor.toFixed(1)} floor, on a sample large enough to mean something.`,
      'Read the critical reviews for a recurring cause. A rating problem is usually a product or expectation problem, not a copy problem.',
      evidence,
    );
  }

  return check(
    'review-health',
    'pass',
    'info',
    `The rating is ${listing.averageRating.toFixed(1)} on ${listing.reviewCount} reviews.`,
    'No action needed.',
    evidence,
  );
};

const buyBox: RuleFn = ({ listing, config }) => {
  if (listing.buyBoxPercentage === null) {
    return check(
      'buy-box',
      'unknown',
      'info',
      'Buy box share was not recorded for this listing.',
      'Pull the Business Report for this ASIN so the share can be assessed.',
      'buyBoxPercentage: unknown',
    );
  }

  const percent = `${(listing.buyBoxPercentage * 100).toFixed(1)}%`;
  if (listing.buyBoxPercentage < config.buyBoxFloor) {
    return check(
      'buy-box',
      'error',
      'high',
      `Buy box share is ${percent}, below the ${(config.buyBoxFloor * 100).toFixed(0)}% floor.`,
      'Check price against competing offers, stock cover and account health. Traffic to this listing is converting for someone else.',
      `buyBoxPercentage: ${percent}`,
    );
  }
  return check(
    'buy-box',
    'pass',
    'info',
    `Buy box share is ${percent}.`,
    'No action needed.',
    `buyBoxPercentage: ${percent}`,
  );
};

/** Rules run in this order, which is the order the UI lists them. */
export const AMAZON_RULES: readonly RuleFn[] = [
  listingStatus,
  titleLength,
  titleStructure,
  bulletsCount,
  bulletsLength,
  imageCount,
  mainImageCompliance,
  videoPresent,
  aPlusContent,
  backendSearchTerms,
  browseNode,
  variationRelationship,
  reviewHealth,
  buyBox,
];
