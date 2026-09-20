import { z } from 'zod';
import {
  AUDIT_KINDS,
  CHANNELS,
  CHECK_STATUSES,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  FUNNEL_STAGES,
  FUNNEL_STAGES_CONTENT,
  INDEXABILITY_STATES,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  SEARCH_INTENTS,
  SEVERITIES,
} from './types';
import { isIsoDate } from './demo-window';

/**
 * Boundary validation. Anything crossing into the app from storage, a form or a
 * fixture file is parsed here first. Corrupted persisted data must be rejected
 * loudly, not spread through the domain as half-typed objects.
 */

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: 'Expected a valid YYYY-MM-DD UTC date' });

export const centsSchema = z
  .number()
  .int({ message: 'Money must be an integer number of cents' })
  .nonnegative();

export const productSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: 'Slug must be lowercase words separated by single hyphens',
    }),
  title: z.string().min(1),
  category: z.enum(PRODUCT_CATEGORIES),
  priceCents: centsSchema,
  costCents: centsSchema,
  inventory: z.number().int().nonnegative(),
  status: z.enum(PRODUCT_STATUSES),
  primaryKeyword: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  productDescription: z.string(),
});

export const snapshotImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().nullable(),
  decorative: z.boolean(),
});

export const snapshotHeadingSchema = z.object({
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string(),
});

export const pageSnapshotSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1).nullable(),
  url: z.string().min(1),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  h1: z.string().nullable(),
  headings: z.array(snapshotHeadingSchema),
  bodyText: z.string(),
  images: z.array(snapshotImageSchema),
  internalLinks: z.array(
    z.object({ href: z.string().min(1), anchorText: z.string() }),
  ),
  canonical: z.string().nullable(),
  indexability: z.enum(INDEXABILITY_STATES),
  structuredData: z.array(z.unknown()),
  directAnswer: z.string().nullable(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  evidence: z.array(
    z.object({ label: z.string(), url: z.string().nullable() }),
  ),
  originalityClaim: z.string().nullable(),
  capturedAt: isoDateSchema,
});

/**
 * Funnel stages must be an ordered prefix: a session cannot check out without
 * first adding to cart. Invalid sequences are rejected so that later funnel
 * counts cannot be inflated by silently repaired data.
 */
const orderedStagesSchema = z
  .array(z.enum(FUNNEL_STAGES))
  .min(1)
  .refine(
    (stages) =>
      stages.every((stage, index) => FUNNEL_STAGES[index] === stage),
    { message: 'Funnel stages must be an ordered prefix of FUNNEL_STAGES' },
  );

export const sessionFactSchema = z
  .object({
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    date: isoDateSchema,
    channel: z.enum(CHANNELS),
    source: z.string().min(1),
    landingPageId: z.string().min(1),
    stages: orderedStagesSchema,
    viewedProductIds: z.array(z.string().min(1)),
    orderId: z.string().min(1).nullable(),
  })
  // A product view is an engagement event, so the two records must agree: a
  // session that never reached product_view cannot have viewed a product, and
  // one that did must name at least one.
  .refine(
    (session) =>
      session.stages.includes('product_view')
        ? session.viewedProductIds.length > 0
        : session.viewedProductIds.length === 0,
    {
      message:
        'viewedProductIds must be non-empty exactly when stages include product_view',
      path: ['viewedProductIds'],
    },
  )
  .refine(
    (session) =>
      new Set(session.viewedProductIds).size === session.viewedProductIds.length,
    { message: 'viewedProductIds must not repeat', path: ['viewedProductIds'] },
  );

export type ParsedProduct = z.infer<typeof productSchema>;
export type ParsedPageSnapshot = z.infer<typeof pageSnapshotSchema>;
export type ParsedSessionFact = z.infer<typeof sessionFactSchema>;

// ---------------------------------------------------------------------------
// Audit results (Dispatch 3 / 4)
// ---------------------------------------------------------------------------

export const auditCheckSchema = z.object({
  ruleId: z.string().min(1),
  status: z.enum(CHECK_STATUSES),
  severity: z.enum(SEVERITIES),
  message: z.string().min(1),
  explanation: z.string().min(1),
  recommendation: z.string().min(1),
  evidence: z.string().nullable(),
  points: z.number().min(0).max(10).nullable(),
});

export const storedAuditResultSchema = z.object({
  id: z.string().min(1),
  pageId: z.string().min(1),
  kind: z.enum(AUDIT_KINDS),
  ruleVersion: z.string().min(1),
  checks: z.array(auditCheckSchema).min(1),
  score: z.number().int().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(1),
  auditedAt: z.string().min(1),
  inputFingerprint: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Content ideas (Dispatch 5)
// ---------------------------------------------------------------------------

/** Editor-supplied opportunity judgements, on a 0–100 scale. */
export const opportunityScoreSchema = z
  .number()
  .int({ message: 'Opportunity must be a whole number' })
  .min(0, { message: 'Opportunity must be between 0 and 100' })
  .max(100, { message: 'Opportunity must be between 0 and 100' });

export const contentIdeaSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string().min(1)),
  searchIntent: z.enum(SEARCH_INTENTS),
  funnelStage: z.enum(FUNNEL_STAGES_CONTENT),
  contentType: z.enum(CONTENT_TYPES),
  status: z.enum(CONTENT_STATUSES),
  targetProductId: z.string().min(1).nullable(),
  seoOpportunity: opportunityScoreSchema,
  geoOpportunity: opportunityScoreSchema,
  productRelevance: opportunityScoreSchema,
});
