/**
 * GrowthOS shared domain types.
 *
 * Scope note (Dispatch 0): these are the contracts every later dispatch builds on.
 * Only Product / PageSnapshot are exercised by the Dispatch 0 fixture; the rest are
 * declared so that module boundaries are fixed before any feature work begins.
 *
 * Conventions enforced project-wide:
 * - Money is an integer number of cents (USD). Never a float.
 * - Dates are UTC calendar days formatted as `YYYY-MM-DD`.
 * - Derived view fields (scores, sessions, revenue) are NOT stored on entities.
 */

/** UTC calendar day, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Integer USD cents. 1999 === $19.99. */
export type Cents = number;

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_CATEGORIES = [
  'Tents & Shelters',
  'Sleeping',
  'Backpacks',
  'Cooking',
  'Lighting',
  'Apparel',
  'Navigation',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/**
 * Stored product record. Derived metrics (seoScore, geoScore, organicSessions,
 * conversionRate, revenue) are deliberately absent: they are computed by services
 * from audits and session facts, and must never be hand-edited through a form.
 */
export interface Product {
  id: string;
  sku: string;
  slug: string;
  title: string;
  category: ProductCategory;
  priceCents: Cents;
  costCents: Cents;
  inventory: number;
  status: ProductStatus;
  primaryKeyword: string;
  metaTitle: string;
  metaDescription: string;
  productDescription: string;
}

/** Product fields a user may edit through the SEO metadata form (Dispatch 2). */
export type ProductSeoEdit = Pick<
  Product,
  'primaryKeyword' | 'metaTitle' | 'metaDescription'
>;

// ---------------------------------------------------------------------------
// PageSnapshot — the audit input (Dispatch 2+)
// ---------------------------------------------------------------------------

/**
 * `unknown` is a first-class value here: the demo never pretends to know a real
 * site's robots directive. Audits must report coverage gaps rather than pass.
 */
export const INDEXABILITY_STATES = ['index', 'noindex', 'unknown'] as const;
export type Indexability = (typeof INDEXABILITY_STATES)[number];

export interface SnapshotImage {
  src: string;
  alt: string | null;
  /** Decorative images are allowed an empty alt without failing the audit. */
  decorative: boolean;
}

export interface SnapshotHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface SnapshotInternalLink {
  href: string;
  anchorText: string;
}

export interface SnapshotFaqEntry {
  question: string;
  answer: string;
}

export interface SnapshotFact {
  label: string;
  value: string;
}

export interface SnapshotEvidence {
  label: string;
  url: string | null;
}

export interface PageSnapshot {
  id: string;
  productId: string | null;
  url: string;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: SnapshotHeading[];
  bodyText: string;
  images: SnapshotImage[];
  internalLinks: SnapshotInternalLink[];
  canonical: string | null;
  indexability: Indexability;
  structuredData: unknown[];
  /** GEO inputs. Absent (null / empty) means "not provided", never "passing". */
  directAnswer: string | null;
  faq: SnapshotFaqEntry[];
  facts: SnapshotFact[];
  evidence: SnapshotEvidence[];
  originalityClaim: string | null;
  capturedAt: IsoDate;
}

// ---------------------------------------------------------------------------
// AuditResult — produced by the SEO (Dispatch 3) / GEO (Dispatch 4) engines
// ---------------------------------------------------------------------------

export const AUDIT_KINDS = ['seo', 'geo'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export const CHECK_STATUSES = ['pass', 'warning', 'error', 'unknown'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface AuditCheck {
  ruleId: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  explanation: string;
  recommendation: string;
  /** Raw observed input backing this verdict, shown in the UI as proof. */
  evidence: string | null;
  /**
   * Points this rule contributed, for engines that band their rules (GEO scores
   * each rule 0, 5 or 10). null where the engine weights checks by status
   * instead, as the SEO engine does.
   */
  points: number | null;
}

/**
 * What is persisted when an audit runs.
 *
 * `inputFingerprint` is a hash of the snapshot fields the audit actually read.
 * Staleness is derived by comparing it against the current snapshot rather than
 * being stored as a flag, so a result can never claim to be current after the
 * page it graded has changed.
 */
export interface StoredAuditResult {
  id: string;
  pageId: string;
  kind: AuditKind;
  ruleVersion: string;
  checks: AuditCheck[];
  /** null when there is nothing evaluable — the UI must show N/A, never 0. */
  score: number | null;
  /** Evaluable checks / total checks, 0–1. */
  coverage: number;
  auditedAt: string;
  inputFingerprint: string;
}

/** A stored result plus the staleness computed against the live snapshot. */
export interface AuditResult extends StoredAuditResult {
  stale: boolean;
}

// ---------------------------------------------------------------------------
// ContentIdea (Dispatch 5)
// ---------------------------------------------------------------------------

export const SEARCH_INTENTS = [
  'Informational',
  'Commercial',
  'Transactional',
  'Navigational',
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const FUNNEL_STAGES_CONTENT = ['TOFU', 'MOFU', 'BOFU'] as const;
export type ContentFunnelStage = (typeof FUNNEL_STAGES_CONTENT)[number];

export const CONTENT_TYPES = [
  'Blog',
  'Buying Guide',
  'Comparison',
  'FAQ',
  'Product Guide',
  'Landing Page',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = [
  'Idea',
  'Planned',
  'Writing',
  'Review',
  'Published',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface ContentIdea {
  id: string;
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  funnelStage: ContentFunnelStage;
  contentType: ContentType;
  status: ContentStatus;
  targetProductId: string | null;
  /** Editor-supplied 0–100 opportunity judgements, not audit scores. */
  seoOpportunity: number;
  geoOpportunity: number;
  productRelevance: number;
}

// ---------------------------------------------------------------------------
// Traffic & commerce facts (Dispatch 6 / 7)
// ---------------------------------------------------------------------------

export const CHANNELS = [
  'Organic Search',
  'Paid Search',
  'Meta',
  'TikTok',
  'Direct',
  'Email',
  'Referral',
  'AI Referral',
] as const;
export type Channel = (typeof CHANNELS)[number];

/** Ordered funnel stages. Order is significant: later stages imply earlier ones. */
export const FUNNEL_STAGES = [
  'session',
  'product_view',
  'add_to_cart',
  'checkout',
  'purchase',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * One visit. `stages` must be a prefix of FUNNEL_STAGES in order — validation
 * rejects out-of-order sequences rather than silently truncating them.
 * MVP constraint: at most one order per session.
 */
export interface SessionFact {
  sessionId: string;
  userId: string;
  date: IsoDate;
  channel: Channel;
  /** e.g. 'google', 'chatgpt', 'perplexity'. Demo labels only. */
  source: string;
  landingPageId: string;
  stages: FunnelStage[];
  /**
   * Products whose detail was viewed in this session. Empty unless `stages`
   * reaches product_view: landing on a page records the entry point, while a
   * product view is a separate engagement event, so a bounce has none.
   */
  viewedProductIds: string[];
  orderId: string | null;
}

export interface OrderItem {
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: Cents;
  /** Order-level discount apportioned to this line, so line sums === order total. */
  discountCents: Cents;
}

/**
 * Revenue definition: paid item amount minus discount. Excludes tax, shipping
 * and refunds. The MVP does not model refunds; the UI states this limitation.
 */
export interface Order {
  id: string;
  sessionId: string;
  userId: string;
  date: IsoDate;
  attributedChannel: Channel;
  isNewCustomer: boolean;
  revenueCents: Cents;
}

/**
 * Daily spend per channel. `acquisitionSpendCents` feeds CAC, `adSpendCents`
 * feeds ROAS; channels with no paid basis report N/A rather than a fake ratio.
 */
export interface ChannelSpend {
  date: IsoDate;
  channel: Channel;
  acquisitionSpendCents: Cents;
  adSpendCents: Cents;
}

// ---------------------------------------------------------------------------
// Recommendation (Dispatch 8)
// ---------------------------------------------------------------------------

export const RECOMMENDATION_SOURCES = [
  'seo',
  'geo',
  'content',
  'analytics',
  'funnel',
  'amazon',
] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECOMMENDATION_STATUSES = ['Open', 'Done'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** Impact vs effort, the shape an operator actually plans against. */
export const RECOMMENDATION_QUADRANTS = [
  'Quick Win',
  'Strategic',
  'Low Priority',
  'Defer',
] as const;
export type RecommendationQuadrant = (typeof RECOMMENDATION_QUADRANTS)[number];

/**
 * The only part of a recommendation that is persisted.
 *
 * Everything else is re-derived from the rule engines on every load, so a
 * recommendation cannot go stale. What must survive is the human decision:
 * that someone marked this task done.
 */
export interface RecommendationStatusRecord {
  /** The stable id from ruleId + sourceEntityId. */
  id: string;
  status: RecommendationStatus;
  updatedAt: string;
}

export interface Recommendation {
  /** Stable: derived from ruleId + sourceEntityId so re-runs do not duplicate. */
  id: string;
  source: RecommendationSource;
  ruleId: string;
  sourceEntityId: string;
  title: string;
  category: string;
  priority: Priority;
  /** 1–5 estimates with documented meaning. Not a guaranteed outcome. */
  impact: number;
  effort: number;
  reason: string;
  suggestedAction: string;
  relatedProductId: string | null;
  status: RecommendationStatus;
  evidence: string | null;
  ruleVersion: string;
  /** Where to go to act on this — a product, a page audit, a chart. */
  link: string;
  quadrant: RecommendationQuadrant;
  /**
   * False when the underlying problem is no longer present but a status record
   * for it survives. Kept for history; never shown as something to do.
   */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Amazon listings (Dispatch 10)
// ---------------------------------------------------------------------------

/**
 * The Amazon side of the catalogue.
 *
 * A listing points at an existing Product: the demo brand sells the same SKUs
 * on its own storefront and on Amazon, which is what a real multi-channel
 * seller does. Sharing the product is the *only* thing the two channels share —
 * their metrics are never added together, because an Amazon session and a
 * storefront session are not the same unit.
 *
 * Every field here is demo data shaped like what a seller would export from
 * Seller Central. Nothing is fetched: this project does not call SP-API and
 * does not crawl Amazon.
 */

/** MVP is the US marketplace only. Stored explicitly so it is never implied. */
export const AMAZON_MARKETPLACES = ['ATVPDKIKX0DER'] as const;
export type AmazonMarketplace = (typeof AMAZON_MARKETPLACES)[number];

export const FULFILMENT_TYPES = ['FBA', 'FBM'] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

/**
 * `suppressed` means Amazon has hidden the listing from search and the buy box,
 * usually for a missing required attribute or an image violation. It is the
 * most urgent state a listing can be in — the opposite of a storefront draft,
 * which is simply not published yet.
 */
export const LISTING_STATUSES = ['active', 'suppressed', 'inactive'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Tri-state for facts this demo cannot honestly assert.
 *
 * Whether a main image is on a pure white background is a property of an image
 * file, which this project never sees. Recording `unknown` and reporting it as
 * a coverage gap is truthful; guessing `true` would be inventing a verdict.
 */
export const TRI_STATES = ['yes', 'no', 'unknown'] as const;
export type TriState = (typeof TRI_STATES)[number];

export interface AmazonListing {
  id: string;
  /** The Product this listing sells. One listing per product in the MVP. */
  productId: string;
  asin: string;
  marketplace: AmazonMarketplace;
  title: string;
  /** Amazon's five bullet points. Fewer than five is a real, common gap. */
  bullets: string[];
  /** A+ module names when brand-registered, empty when not used. */
  aPlusModules: string[];
  /**
   * Backend search terms. Amazon limits this by BYTES, not characters, which
   * is why the rule measures bytes — a listing full of multi-byte characters
   * overflows far sooner than its character count suggests.
   */
  backendSearchTerms: string;
  imageCount: number;
  mainImageWhiteBackground: TriState;
  hasVideo: boolean;
  /** Browse node id, or null when none is assigned. */
  browseNode: string | null;
  brandRegistered: boolean;
  /** Parent ASIN when this is a child in a variation family. */
  variationParentAsin: string | null;
  /** Sibling ASINs this listing should belong with, from the product family. */
  expectedVariationSiblings: string[];
  reviewCount: number;
  /** 0–5, or null when there are no reviews at all. */
  averageRating: number | null;
  /** 0–1 share of page views where this seller held the buy box. */
  buyBoxPercentage: number | null;
  fulfilment: FulfilmentType;
  status: ListingStatus;
}

/** Listing fields a user may edit through the listing form (Dispatch 10). */
export type AmazonListingEdit = Pick<
  AmazonListing,
  'title' | 'bullets' | 'backendSearchTerms'
>;

/**
 * A stored listing audit.
 *
 * Deliberately NOT a `StoredAuditResult`: that record is keyed by `pageId` and
 * fingerprinted from a `PageSnapshot`, neither of which exists for a listing.
 * Forcing a listing into it would mean inventing a fake page id, so the two
 * stay separate records that happen to share the `AuditCheck` shape.
 */
export interface ListingAuditResult {
  id: string;
  listingId: string;
  ruleVersion: string;
  checks: AuditCheck[];
  /** null when there is nothing evaluable — the UI must show N/A, never 0. */
  score: number | null;
  coverage: number;
  auditedAt: string;
  inputFingerprint: string;
}

/** A stored listing audit plus staleness computed against the live listing. */
export interface ListingAudit extends ListingAuditResult {
  stale: boolean;
}

// ---------------------------------------------------------------------------
// Amazon advertising and reports (Dispatch 11)
// ---------------------------------------------------------------------------

/**
 * The advertising side of the Amazon channel.
 *
 * The distinction that matters most here, and the one most often fudged: a
 * **target** is what you told Amazon to bid on, a **customer search term** is
 * what a shopper actually typed. A broad-match target on "camping stove" can be
 * matched to hundreds of search terms you never chose. Harvesting and negating
 * are exactly the work of moving between those two sets, so the model keeps
 * them as separate entities and never collapses one into the other.
 *
 * All of this is seeded demo data shaped like a Search Term Report and a
 * Business Report. Nothing is fetched: this project never calls the Amazon
 * Advertising API or SP-API, and never crawls.
 */

export const AD_CAMPAIGN_TYPES = ['SP', 'SB', 'SD'] as const;
export type AdCampaignType = (typeof AD_CAMPAIGN_TYPES)[number];

export const AD_TARGETING_TYPES = ['auto', 'manual'] as const;
export type AdTargetingType = (typeof AD_TARGETING_TYPES)[number];

/**
 * `auto` is not a match type a seller chooses — it is what Amazon reports for
 * targets it picked itself. Kept in the same union because the report does.
 */
export const AD_MATCH_TYPES = ['broad', 'phrase', 'exact', 'auto'] as const;
export type AdMatchType = (typeof AD_MATCH_TYPES)[number];

export const AD_CAMPAIGN_STATUSES = ['enabled', 'paused'] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export interface AdCampaign {
  id: string;
  name: string;
  type: AdCampaignType;
  targetingType: AdTargetingType;
  /** One advertised listing per campaign in the MVP, so ad sales attribute cleanly. */
  listingId: string;
  dailyBudgetCents: Cents;
  status: AdCampaignStatus;
}

export interface AdTarget {
  id: string;
  campaignId: string;
  /** What the seller bid on. For an auto target, Amazon's own label. */
  expression: string;
  matchType: AdMatchType;
  bidCents: Cents;
}

/**
 * One row of a Search Term Report: a target, a customer search term and a day.
 *
 * `adSalesCents` and `adOrders` are attributed sales — what Amazon credits to
 * the click within its attribution window. They are not the same thing as the
 * ASIN's total sales that day, which is why TACOS needs the Business Report
 * as well.
 */
export interface SearchTermRow {
  date: IsoDate;
  targetId: string;
  customerSearchTerm: string;
  impressions: number;
  clicks: number;
  spendCents: Cents;
  adSalesCents: Cents;
  adOrders: number;
}

/** One row of a Business Report: per ASIN, per day. */
export interface AsinDailyReport {
  date: IsoDate;
  listingId: string;
  /** Amazon's own session definition, not the storefront's. Never added to it. */
  sessions: number;
  pageViews: number;
  unitsOrdered: number;
  /** Total sales for the ASIN that day, advertising and organic together. */
  totalSalesCents: Cents;
  /** 0–1 share of page views where this seller held the buy box. */
  buyBoxPercentage: number;
}
