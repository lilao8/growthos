import { describe, expect, it } from 'vitest';
import {
  commercialIntentValue,
  contentOpportunityScore,
  INTENT_COMMERCIAL_VALUE,
  opportunityBreakdown,
  OPPORTUNITY_WEIGHTS,
  scoreForIdea,
  weightsSumToOne,
} from '@/domain/content/opportunity';
import { SEARCH_INTENTS, type ContentIdea, type SearchIntent } from '@/domain/types';

function score(
  seo: number,
  geo: number,
  intent: SearchIntent,
  relevance: number,
): number {
  return contentOpportunityScore({
    seoOpportunity: seo,
    geoOpportunity: geo,
    searchIntent: intent,
    productRelevance: relevance,
  });
}

describe('weights', () => {
  it('sum to exactly 1, so the score stays on a 0–100 scale', () => {
    expect(weightsSumToOne()).toBe(true);
  });

  it('match the documented values', () => {
    expect(OPPORTUNITY_WEIGHTS).toEqual({
      seoOpportunity: 0.35,
      geoOpportunity: 0.25,
      commercialIntent: 0.2,
      productRelevance: 0.2,
    });
  });
});

describe('intent mapping', () => {
  it('maps every intent to its documented commercial value', () => {
    expect(INTENT_COMMERCIAL_VALUE).toEqual({
      Informational: 40,
      Commercial: 80,
      Transactional: 100,
      Navigational: 30,
    });
  });

  it('covers every search intent with no gaps', () => {
    for (const intent of SEARCH_INTENTS) {
      expect(commercialIntentValue(intent)).toBeGreaterThan(0);
    }
  });

  it('changes the score only through its own weight', () => {
    // Transactional (100) minus Navigational (30) is 70 points of input,
    // weighted at 0.20, so exactly 14 points of score.
    const transactional = score(50, 50, 'Transactional', 50);
    const navigational = score(50, 50, 'Navigational', 50);
    expect(transactional - navigational).toBe(14);
  });
});

describe('contentOpportunityScore', () => {
  it('computes a worked example by hand', () => {
    // 0.35×82 + 0.25×74 + 0.20×80 + 0.20×95
    // = 28.7 + 18.5 + 16 + 19 = 82.2 -> 82
    expect(score(82, 74, 'Commercial', 95)).toBe(82);
  });

  it('returns 100 only when every input is at its maximum', () => {
    expect(score(100, 100, 'Transactional', 100)).toBe(100);
  });

  it('returns the intent floor when everything else is zero', () => {
    // 0.20 × 30 = 6
    expect(score(0, 0, 'Navigational', 0)).toBe(6);
    // 0.20 × 100 = 20
    expect(score(0, 0, 'Transactional', 0)).toBe(20);
  });

  it('never leaves the 0–100 range for any intent at the extremes', () => {
    for (const intent of SEARCH_INTENTS) {
      for (const value of [0, 100]) {
        const result = score(value, value, intent, value);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(score(63, 79, 'Informational', 66)).toBe(
      score(63, 79, 'Informational', 66),
    );
  });

  it('weights SEO opportunity more heavily than GEO', () => {
    const seoHeavy = score(100, 0, 'Informational', 0);
    const geoHeavy = score(0, 100, 'Informational', 0);
    expect(seoHeavy).toBeGreaterThan(geoHeavy);
    expect(seoHeavy - geoHeavy).toBe(10); // (0.35 - 0.25) × 100
  });

  it('clamps out-of-range input rather than producing a score above 100', () => {
    expect(score(500, 500, 'Transactional', 500)).toBe(100);
    expect(score(-50, -50, 'Navigational', -50)).toBe(6);
  });

  it('treats non-finite input as zero rather than NaN', () => {
    expect(score(Number.NaN, 50, 'Commercial', 50)).toBe(
      score(0, 50, 'Commercial', 50),
    );
    expect(Number.isNaN(score(Number.POSITIVE_INFINITY, 0, 'Commercial', 0))).toBe(
      false,
    );
  });

  it('rounds to a whole number', () => {
    // 0.35×51 + 0.25×51 + 0.20×40 + 0.20×51 = 17.85 + 12.75 + 8 + 10.2 = 48.8
    expect(score(51, 51, 'Informational', 51)).toBe(49);
  });
});

describe('opportunityBreakdown', () => {
  it('explains where each part of the score came from', () => {
    const breakdown = opportunityBreakdown({
      seoOpportunity: 82,
      geoOpportunity: 74,
      searchIntent: 'Commercial',
      productRelevance: 95,
    });

    expect(breakdown.parts.map((part) => part.key)).toEqual([
      'seoOpportunity',
      'geoOpportunity',
      'commercialIntent',
      'productRelevance',
    ]);
    expect(breakdown.parts.map((part) => part.source)).toEqual([
      'entered',
      'entered',
      'derived',
      'entered',
    ]);
  });

  it('has contributions that add back up to the score', () => {
    const breakdown = opportunityBreakdown({
      seoOpportunity: 63,
      geoOpportunity: 79,
      searchIntent: 'Informational',
      productRelevance: 66,
    });
    const total = breakdown.parts.reduce(
      (sum, part) => sum + part.contribution,
      0,
    );
    expect(Math.round(total)).toBe(breakdown.score);
  });

  it('derives commercial intent rather than taking it as input', () => {
    const breakdown = opportunityBreakdown({
      seoOpportunity: 0,
      geoOpportunity: 0,
      searchIntent: 'Transactional',
      productRelevance: 0,
    });
    const intentPart = breakdown.parts.find(
      (part) => part.key === 'commercialIntent',
    );
    expect(intentPart?.input).toBe(100);
    expect(intentPart?.source).toBe('derived');
  });
});

describe('scoreForIdea', () => {
  it('reads the idea’s own fields', () => {
    const idea: ContentIdea = {
      id: 'idea_x',
      topic: 'A topic',
      primaryKeyword: 'a keyword',
      secondaryKeywords: [],
      searchIntent: 'Commercial',
      funnelStage: 'MOFU',
      contentType: 'Blog',
      status: 'Idea',
      targetProductId: null,
      seoOpportunity: 82,
      geoOpportunity: 74,
      productRelevance: 95,
    };
    expect(scoreForIdea(idea)).toBe(82);
  });
});
