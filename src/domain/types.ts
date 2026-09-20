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
] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECOMMENDATION_STATUSES = ['Open', 'Done'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

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
}
