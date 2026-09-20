import type { ContentIdea, SearchIntent } from '../types';

/**
 * Content Opportunity Score.
 *
 * A weighted blend of four 0–100 inputs, producing a 0–100 priority signal for
 * deciding which piece to write next.
 *
 * What the inputs are NOT, because this is the easiest thing to misread:
 *
 * - `seoOpportunity` and `geoOpportunity` are the *editor's own estimate* of
 *   how much opportunity a topic holds. They are typed in by a person. They are
 *   not the SEO or GEO audit scores from Dispatch 3 and 4, which measure an
 *   existing page, and they are not keyword search volume from any tool — this
 *   project connects to none.
 * - `productRelevance` is likewise a judgement: how closely the topic maps to
 *   the product it targets.
 *
 * Only `commercialIntent` is derived rather than entered, and it comes from a
 * fixed mapping of search intent, shown below.
 */

export const OPPORTUNITY_WEIGHTS = {
  seoOpportunity: 0.35,
  geoOpportunity: 0.25,
  commercialIntent: 0.2,
  productRelevance: 0.2,
} as const;

/**
 * How much buying intent each search intent implies, on the same 0–100 scale.
 * Transactional queries are closest to a purchase; navigational ones are people
 * looking for a brand they already know, so they hold the least new opportunity.
 */
export const INTENT_COMMERCIAL_VALUE: Record<SearchIntent, number> = {
  Informational: 40,
  Commercial: 80,
  Transactional: 100,
  Navigational: 30,
};

export interface OpportunityInputs {
  seoOpportunity: number;
  geoOpportunity: number;
  searchIntent: SearchIntent;
  productRelevance: number;
}

export interface OpportunityBreakdown {
  score: number;
  parts: {
    key: keyof typeof OPPORTUNITY_WEIGHTS;
    label: string;
    input: number;
    weight: number;
    contribution: number;
    /** Where the number came from, so the score stays explainable. */
    source: 'entered' | 'derived';
  }[];
}

const PART_LABELS: Record<keyof typeof OPPORTUNITY_WEIGHTS, string> = {
  seoOpportunity: 'SEO opportunity',
  geoOpportunity: 'GEO opportunity',
  commercialIntent: 'Commercial intent',
  productRelevance: 'Product relevance',
};

function clampToScale(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The weights must add to exactly 1, or the score would no longer be on a
 * 0–100 scale. Checked here rather than trusted, so a future edit to the
 * weights cannot silently break every score in the project.
 */
export function weightsSumToOne(): boolean {
  const total = Object.values(OPPORTUNITY_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  return Math.abs(total - 1) < 1e-9;
}

export function commercialIntentValue(intent: SearchIntent): number {
  return INTENT_COMMERCIAL_VALUE[intent];
}

/** Pure, deterministic and independent of React. Same inputs, same score. */
export function contentOpportunityScore(inputs: OpportunityInputs): number {
  return opportunityBreakdown(inputs).score;
}

export function opportunityBreakdown(
  inputs: OpportunityInputs,
): OpportunityBreakdown {
  const values = {
    seoOpportunity: clampToScale(inputs.seoOpportunity),
    geoOpportunity: clampToScale(inputs.geoOpportunity),
    commercialIntent: commercialIntentValue(inputs.searchIntent),
    productRelevance: clampToScale(inputs.productRelevance),
  } as const;

  const parts = (
    Object.keys(OPPORTUNITY_WEIGHTS) as (keyof typeof OPPORTUNITY_WEIGHTS)[]
  ).map((key) => ({
    key,
    label: PART_LABELS[key],
    input: values[key],
    weight: OPPORTUNITY_WEIGHTS[key],
    contribution: values[key] * OPPORTUNITY_WEIGHTS[key],
    source:
      key === 'commercialIntent' ? ('derived' as const) : ('entered' as const),
  }));

  const total = parts.reduce((sum, part) => sum + part.contribution, 0);
  return { score: Math.round(total), parts };
}

export function scoreForIdea(idea: ContentIdea): number {
  return contentOpportunityScore({
    seoOpportunity: idea.seoOpportunity,
    geoOpportunity: idea.geoOpportunity,
    searchIntent: idea.searchIntent,
    productRelevance: idea.productRelevance,
  });
}
