import type { AuditCheck, PageSnapshot, Severity } from '../types';
import {
  SEO_RULE_META,
  type SeoAuditConfig,
  type SeoRuleId,
} from './config';

/**
 * The twelve SEO rules.
 *
 * Each rule is a pure function of the snapshot plus configuration. They never
 * fetch anything: the input is a captured snapshot, not a live crawl, so the
 * audit grades what was recorded and says so.
 *
 * Status meanings, applied consistently:
 * - `pass`    the page satisfies the rule
 * - `warning` the page works but is outside this project's guidance
 * - `error`   something required is missing or wrong
 * - `unknown` the rule could not be evaluated — the input was absent. This is
 *             never treated as a pass; it lowers coverage instead.
 */

export interface RuleInput {
  snapshot: PageSnapshot;
  /** From the product record, not the page. Empty string means "not set". */
  primaryKeyword: string;
  config: SeoAuditConfig;
}

type RuleFn = (input: RuleInput) => AuditCheck;

function check(
  ruleId: SeoRuleId,
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
    explanation: SEO_RULE_META[ruleId].rationale,
    recommendation,
    evidence,
    // The SEO engine weights checks by status, not by per-rule points.
    points: null,
  };
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Last path segment of the page URL, which is the slug an operator controls. */
export function slugFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter((part) => part !== '');
    return segments[segments.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** Compares URLs ignoring a trailing slash and the fragment. */
function sameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const strip = (url: URL): string =>
      `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`;
    return strip(left) === strip(right);
  } catch {
    return false;
  }
}

const metaTitlePresent: RuleFn = ({ snapshot }) => {
  if (isBlank(snapshot.metaTitle)) {
    return check(
      'meta-title-present',
      'error',
      'critical',
      'This page has no meta title.',
      'Write a title that names the product and the brand, in that order.',
      snapshot.metaTitle === null ? 'metaTitle: absent' : 'metaTitle: empty',
    );
  }
  return check(
    'meta-title-present',
    'pass',
    'info',
    'A meta title is set.',
    'No action needed.',
    snapshot.metaTitle,
  );
};

const metaTitleLength: RuleFn = ({ snapshot, config }) => {
  if (isBlank(snapshot.metaTitle)) {
    return check(
      'meta-title-length',
      'unknown',
      'info',
      'Length cannot be assessed because there is no title.',
      'Add a meta title first; this check will then apply.',
      null,
    );
  }
  const length = (snapshot.metaTitle ?? '').trim().length;
  const evidence = `${length} characters`;

  if (length < config.titleMin) {
    return check(
      'meta-title-length',
      'warning',
      'low',
      `The title is ${length} characters, shorter than the ${config.titleMin}–${config.titleMax} guideline.`,
      'Add the distinguishing detail a shopper would search for, such as size, capacity or rating.',
      evidence,
    );
  }
  if (length > config.titleMax) {
    return check(
      'meta-title-length',
      'warning',
      'medium',
      `The title is ${length} characters, longer than the ${config.titleMin}–${config.titleMax} guideline and likely to be truncated.`,
      'Move the least important words to the end, or cut them.',
      evidence,
    );
  }
  return check(
    'meta-title-length',
    'pass',
    'info',
    `The title is ${length} characters, within the ${config.titleMin}–${config.titleMax} guideline.`,
    'No action needed.',
    evidence,
  );
};

const metaDescriptionPresent: RuleFn = ({ snapshot }) => {
  if (isBlank(snapshot.metaDescription)) {
    return check(
      'meta-description-present',
      'error',
      'high',
      'This page has no meta description.',
      'Write one or two sentences stating what the product is and who it suits.',
      snapshot.metaDescription === null
        ? 'metaDescription: absent'
        : 'metaDescription: empty',
    );
  }
  return check(
    'meta-description-present',
    'pass',
    'info',
    'A meta description is set.',
    'No action needed.',
    snapshot.metaDescription,
  );
};

const metaDescriptionLength: RuleFn = ({ snapshot, config }) => {
  if (isBlank(snapshot.metaDescription)) {
    return check(
      'meta-description-length',
      'unknown',
      'info',
      'Length cannot be assessed because there is no description.',
      'Add a meta description first; this check will then apply.',
      null,
    );
  }
  const length = (snapshot.metaDescription ?? '').trim().length;
  const evidence = `${length} characters`;

  if (length < config.descriptionMin) {
    return check(
      'meta-description-length',
      'warning',
      'low',
      `The description is ${length} characters, shorter than the ${config.descriptionMin}–${config.descriptionMax} guideline.`,
      'Use the remaining space for a concrete fact — weight, rating or what is included.',
      evidence,
    );
  }
  if (length > config.descriptionMax) {
    return check(
      'meta-description-length',
      'warning',
      'medium',
      `The description is ${length} characters, longer than the ${config.descriptionMin}–${config.descriptionMax} guideline and likely to be cut off.`,
      'Put the most useful sentence first and trim the rest.',
      evidence,
    );
  }
  return check(
    'meta-description-length',
    'pass',
    'info',
    `The description is ${length} characters, within the ${config.descriptionMin}–${config.descriptionMax} guideline.`,
    'No action needed.',
    evidence,
  );
};

const h1Rule: RuleFn = ({ snapshot }) => {
  const h1s = snapshot.headings.filter((heading) => heading.level === 1);
  const count = h1s.length;

  if (count === 0 && isBlank(snapshot.h1)) {
    return check(
      'h1',
      'error',
      'critical',
      'This page has no H1.',
      'Add a single H1 that names the product, matching what the page is about.',
      'h1: absent',
    );
  }
  if (count > 1) {
    return check(
      'h1',
      'error',
      'high',
      `This page has ${count} H1 headings.`,
      'Keep one H1 and demote the others to H2.',
      h1s.map((heading) => heading.text).join(' | '),
    );
  }
  return check(
    'h1',
    'pass',
    'info',
    'This page has exactly one H1.',
    'No action needed.',
    snapshot.h1 ?? h1s[0]?.text ?? null,
  );
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const urlSlug: RuleFn = ({ snapshot, config }) => {
  const slug = slugFromUrl(snapshot.url);
  if (slug === null) {
    return check(
      'url-slug',
      'unknown',
      'info',
      'The page URL could not be parsed, so the slug cannot be assessed.',
      'Record a full, absolute URL in the page snapshot.',
      snapshot.url,
    );
  }
  if (!SLUG_PATTERN.test(slug)) {
    return check(
      'url-slug',
      'error',
      'medium',
      'The slug is not lowercase words separated by single hyphens.',
      'Rewrite it in lowercase with hyphens, and redirect the old URL to the new one.',
      slug,
    );
  }

  const words = slug.split('-').length;
  if (slug.length > config.slugMaxChars || words > config.slugMaxWords) {
    return check(
      'url-slug',
      'warning',
      'low',
      `The slug is ${slug.length} characters across ${words} words, beyond the ${config.slugMaxChars}-character / ${config.slugMaxWords}-word guideline.`,
      'Drop filler words and keep the product name.',
      slug,
    );
  }
  return check(
    'url-slug',
    'pass',
    'info',
    'The slug is readable and well formed.',
    'No action needed.',
    slug,
  );
};

const canonical: RuleFn = ({ snapshot }) => {
  if (isBlank(snapshot.canonical)) {
    return check(
      'canonical',
      'error',
      'high',
      'This page declares no canonical URL.',
      'Add a self-referencing canonical unless this page is deliberately a duplicate of another.',
      'canonical: absent',
    );
  }

  const value = snapshot.canonical ?? '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return check(
      'canonical',
      'error',
      'high',
      'The canonical URL is not a valid absolute URL.',
      'Use a complete absolute URL including the scheme and host.',
      value,
    );
  }

  if (!sameUrl(parsed.toString(), snapshot.url)) {
    return check(
      'canonical',
      'warning',
      'high',
      'The canonical points at a different page.',
      'Confirm this page is meant to be treated as a duplicate. If not, point the canonical at this URL.',
      `canonical: ${value} | page: ${snapshot.url}`,
    );
  }
  return check(
    'canonical',
    'pass',
    'info',
    'The canonical points at this page.',
    'No action needed.',
    value,
  );
};

const imageAlt: RuleFn = ({ snapshot }) => {
  const meaningful = snapshot.images.filter((image) => !image.decorative);
  if (meaningful.length === 0) {
    return check(
      'image-alt',
      'unknown',
      'info',
      'This page records no non-decorative images, so alt text cannot be assessed.',
      'If the page does show product images, capture them in the snapshot.',
      `${snapshot.images.length} image(s), all decorative or none recorded`,
    );
  }

  const missing = meaningful.filter((image) => image.alt === null);
  if (missing.length > 0) {
    return check(
      'image-alt',
      'error',
      'high',
      `${missing.length} of ${meaningful.length} content images have no alt attribute.`,
      'Describe what each image shows, in a sentence a person could act on without seeing it.',
      missing.map((image) => image.src).join(', '),
    );
  }

  const empty = meaningful.filter((image) => image.alt?.trim() === '');
  if (empty.length > 0) {
    return check(
      'image-alt',
      'warning',
      'medium',
      `${empty.length} of ${meaningful.length} content images have an empty alt.`,
      'Either describe the image, or mark it decorative if it carries no information.',
      empty.map((image) => image.src).join(', '),
    );
  }

  return check(
    'image-alt',
    'pass',
    'info',
    `All ${meaningful.length} content images have alt text.`,
    'No action needed.',
    `${meaningful.length} described, ${snapshot.images.length - meaningful.length} decorative`,
  );
};

const internalLinks: RuleFn = ({ snapshot, config }) => {
  const links = snapshot.internalLinks;
  if (links.length < config.internalLinksMin) {
    return check(
      'internal-links',
      'error',
      'high',
      'This page has no internal links.',
      'Link to its collection and to at least one related guide or product.',
      'internalLinks: 0',
    );
  }

  const unlabelled = links.filter(
    (link) =>
      link.anchorText.trim() === '' ||
      config.genericAnchorText.includes(normalizeText(link.anchorText)),
  );
  if (unlabelled.length > 0) {
    return check(
      'internal-links',
      'warning',
      'low',
      `${unlabelled.length} internal link(s) use empty or generic anchor text.`,
      'Replace the anchor text with the destination’s subject.',
      unlabelled
        .map((link) => `${link.href} ("${link.anchorText}")`)
        .join(', '),
    );
  }

  if (links.length < config.internalLinksHealthy) {
    return check(
      'internal-links',
      'warning',
      'low',
      `This page has only ${links.length} internal link, below the guideline of ${config.internalLinksHealthy}.`,
      'Add a link to a related product or buying guide.',
      links.map((link) => link.href).join(', '),
    );
  }

  return check(
    'internal-links',
    'pass',
    'info',
    `This page has ${links.length} internal links with descriptive anchor text.`,
    'No action needed.',
    links.map((link) => link.href).join(', '),
  );
};

interface ProductMarkup {
  context: unknown;
  type: unknown;
  name: unknown;
  sku: unknown;
  offers: Record<string, unknown> | null;
}

function readProductMarkup(entry: unknown): ProductMarkup | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (record['@type'] !== 'Product') return null;

  const offers = record['offers'];
  return {
    context: record['@context'],
    type: record['@type'],
    name: record['name'],
    sku: record['sku'],
    offers:
      typeof offers === 'object' && offers !== null
        ? (offers as Record<string, unknown>)
        : null,
  };
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

const structuredData: RuleFn = ({ snapshot }) => {
  if (snapshot.structuredData.length === 0) {
    return check(
      'structured-data',
      'error',
      'medium',
      'This page has no structured data.',
      'Add Product markup with name, price, currency and availability.',
      'structuredData: none',
    );
  }

  const product = snapshot.structuredData
    .map(readProductMarkup)
    .find((entry): entry is ProductMarkup => entry !== null);

  if (product === null || product === undefined) {
    return check(
      'structured-data',
      'error',
      'medium',
      'Structured data is present but contains no Product entry.',
      'Add a Product entry; other types do not describe what is for sale here.',
      `${snapshot.structuredData.length} block(s), none of type Product`,
    );
  }

  // Required for the markup to describe a purchasable product at all.
  const missingRequired: string[] = [];
  if (!isNonEmptyString(product.context)) missingRequired.push('@context');
  if (!isNonEmptyString(product.name)) missingRequired.push('name');
  if (product.offers === null) {
    missingRequired.push('offers');
  } else {
    if (!isNonEmptyString(product.offers['price'])) {
      missingRequired.push('offers.price');
    }
    if (!isNonEmptyString(product.offers['priceCurrency'])) {
      missingRequired.push('offers.priceCurrency');
    }
  }

  if (missingRequired.length > 0) {
    return check(
      'structured-data',
      'error',
      'medium',
      `Product markup is missing required field(s): ${missingRequired.join(', ')}.`,
      'Fill in the missing fields; incomplete markup is usually ignored rather than partially used.',
      missingRequired.join(', '),
    );
  }

  const missingRecommended: string[] = [];
  if (!isNonEmptyString(product.sku)) missingRecommended.push('sku');
  if (!isNonEmptyString(product.offers?.['availability'])) {
    missingRecommended.push('offers.availability');
  }

  if (missingRecommended.length > 0) {
    return check(
      'structured-data',
      'warning',
      'low',
      `Product markup is valid but omits ${missingRecommended.join(', ')}.`,
      'Add the remaining fields so stock state and identity are machine-readable.',
      missingRecommended.join(', '),
    );
  }

  return check(
    'structured-data',
    'pass',
    'info',
    'Product markup is present and has the required fields.',
    'No action needed.',
    `name, offers.price, offers.priceCurrency, sku, offers.availability`,
  );
};

const indexability: RuleFn = ({ snapshot }) => {
  if (snapshot.indexability === 'unknown') {
    // Unknown is not a pass. It is a gap in what was captured, and the audit
    // reports it as such rather than assuming the page is indexable.
    return check(
      'indexability',
      'unknown',
      'info',
      'The robots directive was not captured for this page.',
      'Capture the robots meta tag or header so indexability can be assessed.',
      'indexability: unknown',
    );
  }
  if (snapshot.indexability === 'noindex') {
    return check(
      'indexability',
      'warning',
      'high',
      'This page is marked noindex and will be kept out of search.',
      'Confirm that is intended. If the page should rank, remove the noindex — this audit will not change it for you.',
      'indexability: noindex',
    );
  }
  return check(
    'indexability',
    'pass',
    'info',
    'This page is indexable.',
    'No action needed.',
    'indexability: index',
  );
};

/** Words short enough to be noise are ignored when matching loosely. */
const KEYWORD_STOPWORD_MAX_LENGTH = 2;

/** Share of the keyword's significant words that appear in the text, 0–1. */
function wordCoverage(text: string, keywordWords: readonly string[]): number {
  if (keywordWords.length === 0) return 0;
  const haystack = normalizeText(text);
  const found = keywordWords.filter((word) => haystack.includes(word));
  return found.length / keywordWords.length;
}

/**
 * Everything a reader sees on the page, not just the main paragraph: headings,
 * FAQ answers and spec values are page content too, and a keyword used there is
 * genuinely used.
 */
function pageText(snapshot: PageSnapshot): string {
  return [
    snapshot.bodyText,
    ...snapshot.headings.map((heading) => heading.text),
    ...snapshot.faq.flatMap((entry) => [entry.question, entry.answer]),
    ...snapshot.facts.flatMap((fact) => [fact.label, fact.value]),
  ].join(' ');
}

const keywordUsage: RuleFn = ({ snapshot, primaryKeyword }) => {
  const keyword = normalizeText(primaryKeyword);
  if (keyword === '') {
    return check(
      'keyword-usage',
      'unknown',
      'info',
      'No primary keyword is set for this product, so usage cannot be assessed.',
      'Set a primary keyword on the product, then re-run the audit.',
      null,
    );
  }

  // Two levels of match, because an exact-phrase-only test produces false
  // verdicts: a page titled "Ridgeline 2P Backpacking Tent" targeting
  // "2 person backpacking tent" plainly is about that query, even though the
  // phrase never appears verbatim. Verbatim use is the strongest signal, all
  // the keyword's words appearing is a weaker one, and neither is relevance.
  const words = keyword
    .split(' ')
    .filter((word) => word.length > KEYWORD_STOPWORD_MAX_LENGTH);

  const title = normalizeText(snapshot.metaTitle ?? '');
  const h1 = normalizeText(snapshot.h1 ?? '');
  const content = normalizeText(pageText(snapshot));
  const slug = (slugFromUrl(snapshot.url) ?? '').replace(/-/g, ' ');

  const exactIn = [
    title.includes(keyword) ? 'title' : null,
    h1.includes(keyword) ? 'H1' : null,
    content.includes(keyword) ? 'content' : null,
    slug.includes(keyword) ? 'slug' : null,
  ].filter((place): place is string => place !== null);

  const titleCoverage = wordCoverage(title, words);
  const contentCoverage = wordCoverage(content, words);
  const bestCoverage = Math.max(
    titleCoverage,
    contentCoverage,
    wordCoverage(h1, words),
    wordCoverage(slug, words),
  );

  const quoted = `"${primaryKeyword.trim()}"`;
  const exactEvidence =
    exactIn.length === 0
      ? `${quoted} never appears verbatim`
      : `${quoted} appears verbatim in: ${exactIn.join(', ')}`;
  const evidence = `${exactEvidence}; word coverage — title ${Math.round(
    titleCoverage * 100,
  )}%, content ${Math.round(contentCoverage * 100)}%`;

  if (exactIn.includes('title') && (exactIn.includes('H1') || exactIn.includes('content'))) {
    return check(
      'keyword-usage',
      'pass',
      'info',
      'The primary keyword appears verbatim in the title and in the page content.',
      'No action needed. Note that using a keyword is not the same as being relevant to it.',
      evidence,
    );
  }

  if (bestCoverage < 0.5) {
    return check(
      'keyword-usage',
      'error',
      'high',
      'The page barely uses the words of its primary keyword anywhere.',
      'Either target a keyword this page is actually about, or rewrite the page around the one you chose.',
      evidence,
    );
  }

  if (exactIn.length > 0) {
    return check(
      'keyword-usage',
      'warning',
      'low',
      `The keyword appears verbatim only in: ${exactIn.join(', ')}.`,
      'Use it in the title as well as the content, if it reads naturally there.',
      evidence,
    );
  }

  return check(
    'keyword-usage',
    'warning',
    'medium',
    'The page uses the keyword’s words but never the phrase itself.',
    'If shoppers search this phrase, use it as written somewhere prominent — otherwise pick the phrasing the page already uses.',
    evidence,
  );
};

/** Rules run in this order, which is the order the UI lists them. */
export const SEO_RULES: readonly RuleFn[] = [
  metaTitlePresent,
  metaTitleLength,
  metaDescriptionPresent,
  metaDescriptionLength,
  h1Rule,
  urlSlug,
  canonical,
  imageAlt,
  internalLinks,
  structuredData,
  indexability,
  keywordUsage,
];
