import { z } from 'zod';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  FUNNEL_STAGES_CONTENT,
  SEARCH_INTENTS,
  type ContentIdea,
} from '../types';
import { opportunityScoreSchema } from '../schemas';

/**
 * Content idea form validation.
 *
 * As with the product form, an invalid entry never reaches storage and the
 * caller keeps everything the user typed. Opportunity fields arrive from number
 * inputs as strings, so they are coerced here and rejected if they are not
 * whole numbers on the 0–100 scale.
 */

const opportunityField = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return Number.NaN;
    return Number(trimmed);
  }
  return value;
}, opportunityScoreSchema);

const keywordList = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
  }
  return value;
}, z.array(z.string().min(1)));

export const contentIdeaFormSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, { message: 'Topic is required.' })
    .max(160, { message: 'Topic must be 160 characters or fewer.' }),
  primaryKeyword: z
    .string()
    .trim()
    .min(1, { message: 'Primary keyword is required.' })
    .max(80, { message: 'Primary keyword must be 80 characters or fewer.' }),
  secondaryKeywords: keywordList,
  searchIntent: z.enum(SEARCH_INTENTS, {
    message: 'Choose a search intent.',
  }),
  funnelStage: z.enum(FUNNEL_STAGES_CONTENT, {
    message: 'Choose a funnel stage.',
  }),
  contentType: z.enum(CONTENT_TYPES, { message: 'Choose a content type.' }),
  status: z.enum(CONTENT_STATUSES, { message: 'Choose a status.' }),
  /** Empty string means "no target product", which is allowed. */
  targetProductId: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().min(1).nullable(),
  ),
  seoOpportunity: opportunityField,
  geoOpportunity: opportunityField,
  productRelevance: opportunityField,
});

export type ContentIdeaFormValues = z.infer<typeof contentIdeaFormSchema>;

export type ContentFieldErrors = Partial<
  Record<keyof ContentIdeaFormValues, string>
>;

export type ContentValidation =
  | { ok: true; value: ContentIdeaFormValues }
  | { ok: false; errors: ContentFieldErrors };

const FIELD_KEYS = new Set<string>([
  'topic',
  'primaryKeyword',
  'secondaryKeywords',
  'searchIntent',
  'funnelStage',
  'contentType',
  'status',
  'targetProductId',
  'seoOpportunity',
  'geoOpportunity',
  'productRelevance',
]);

export function validateContentIdea(input: unknown): ContentValidation {
  const parsed = contentIdeaFormSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: ContentFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && FIELD_KEYS.has(field)) {
      const key = field as keyof ContentIdeaFormValues;
      errors[key] ??= issue.message;
    }
  }
  return { ok: false, errors };
}

/** Deterministic id from the topic, with a counter to break collisions. */
export function contentIdeaId(topic: string, existing: readonly string[]): string {
  const base = `idea_${topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)}`;
  if (!existing.includes(base)) return base;

  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function applyContentIdeaForm(
  id: string,
  values: ContentIdeaFormValues,
): ContentIdea {
  return {
    id,
    topic: values.topic,
    primaryKeyword: values.primaryKeyword,
    secondaryKeywords: values.secondaryKeywords,
    searchIntent: values.searchIntent,
    funnelStage: values.funnelStage,
    contentType: values.contentType,
    status: values.status,
    targetProductId: values.targetProductId,
    seoOpportunity: values.seoOpportunity,
    geoOpportunity: values.geoOpportunity,
    productRelevance: values.productRelevance,
  };
}
