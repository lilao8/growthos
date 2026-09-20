import {
  META_DESCRIPTION_MAX,
  META_DESCRIPTION_MIN,
  META_TITLE_MAX,
  META_TITLE_MIN,
} from '../product-seo';

/**
 * SEO audit configuration.
 *
 * Every threshold lives here rather than inside a rule, so the whole model can
 * be explained, versioned and changed in one place. Bump `SEO_RULE_VERSION`
 * whenever a threshold or a rule's verdict logic changes: results carry the
 * version they were produced with, and comparing scores across versions is
 * meaningless.
 *
 * Important framing: these are this project's editing conventions for an
 * English demo store. They are not any search engine's requirements, and a
 * score here does not predict ranking.
 */

export const SEO_RULE_VERSION = 'seo-1.0.0';

export interface SeoAuditConfig {
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
  /** Below this many internal links the page is treated as orphaned content. */
  internalLinksMin: number;
  /** Fewer than this but more than zero is a warning rather than an error. */
  internalLinksHealthy: number;
  /** Slug length beyond which the URL is flagged as unwieldy. */
  slugMaxChars: number;
  slugMaxWords: number;
  /** Anchor text that carries no meaning for either a reader or a crawler. */
  genericAnchorText: readonly string[];
}

export const DEFAULT_SEO_CONFIG: SeoAuditConfig = {
  titleMin: META_TITLE_MIN,
  titleMax: META_TITLE_MAX,
  descriptionMin: META_DESCRIPTION_MIN,
  descriptionMax: META_DESCRIPTION_MAX,
  internalLinksMin: 1,
  internalLinksHealthy: 2,
  slugMaxChars: 60,
  slugMaxWords: 7,
  genericAnchorText: ['click here', 'here', 'read more', 'more', 'link', 'this'],
};

export const SEO_RULE_IDS = [
  'meta-title-present',
  'meta-title-length',
  'meta-description-present',
  'meta-description-length',
  'h1',
  'url-slug',
  'canonical',
  'image-alt',
  'internal-links',
  'structured-data',
  'indexability',
  'keyword-usage',
] as const;

export type SeoRuleId = (typeof SEO_RULE_IDS)[number];

export interface RuleMeta {
  id: SeoRuleId;
  title: string;
  /** What an operator gets out of this check. */
  rationale: string;
}

export const SEO_RULE_META: Record<SeoRuleId, RuleMeta> = {
  'meta-title-present': {
    id: 'meta-title-present',
    title: 'Meta title present',
    rationale:
      'The title is the page’s headline in search results. Without one, the engine invents one from the page.',
  },
  'meta-title-length': {
    id: 'meta-title-length',
    title: 'Meta title length',
    rationale:
      'Titles far outside the guideline get truncated in results or read as thin.',
  },
  'meta-description-present': {
    id: 'meta-description-present',
    title: 'Meta description present',
    rationale:
      'The description is the sales copy under the title. Missing it hands that copy to an algorithm.',
  },
  'meta-description-length': {
    id: 'meta-description-length',
    title: 'Meta description length',
    rationale:
      'Descriptions outside the guideline are cut off or waste the space available.',
  },
  h1: {
    id: 'h1',
    title: 'Single H1',
    rationale:
      'One H1 states what the page is about. None leaves it ambiguous; several compete.',
  },
  'url-slug': {
    id: 'url-slug',
    title: 'URL slug format',
    rationale:
      'A readable, hyphenated, lowercase slug is easier to share, log and read in results.',
  },
  canonical: {
    id: 'canonical',
    title: 'Canonical URL',
    rationale:
      'The canonical names the preferred version of a page. A wrong one can point ranking signals at something else.',
  },
  'image-alt': {
    id: 'image-alt',
    title: 'Image alt text',
    rationale:
      'Alt text is what a screen reader announces and what an image search reads. Decorative images are exempt.',
  },
  'internal-links': {
    id: 'internal-links',
    title: 'Internal links',
    rationale:
      'Internal links give a page context and a path for crawlers and readers to reach related content.',
  },
  'structured-data': {
    id: 'structured-data',
    title: 'Product structured data',
    rationale:
      'Valid Product markup states price, currency and availability in a machine-readable form.',
  },
  indexability: {
    id: 'indexability',
    title: 'Indexability',
    rationale:
      'A noindex page is deliberately kept out of search. That is sometimes correct, so it is flagged for confirmation, never changed automatically.',
  },
  'keyword-usage': {
    id: 'keyword-usage',
    title: 'Primary keyword usage',
    rationale:
      'If the page never uses the query it targets, it is unlikely to be read as an answer to it. Presence is not relevance.',
  },
};
