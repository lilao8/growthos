import { describe, expect, it } from 'vitest';
import {
  applyContentIdeaForm,
  contentIdeaId,
  validateContentIdea,
} from '@/domain/content/content-validation';
import {
  EMPTY_CONTENT_QUERY,
  filterContentIdeas,
  isContentQueryActive,
  sortByOpportunity,
} from '@/domain/content/content-filters';
import { scoreForIdea } from '@/domain/content/opportunity';
import { buildDemoContentIdeas } from '@/fixtures/demo-content';

const VALID_INPUT = {
  topic: 'How to choose a sleeping pad',
  primaryKeyword: 'how to choose a sleeping pad',
  secondaryKeywords: 'r value, pad thickness',
  searchIntent: 'Informational',
  funnelStage: 'TOFU',
  contentType: 'Blog',
  status: 'Idea',
  targetProductId: 'prd_cloudbed_pad',
  seoOpportunity: '70',
  geoOpportunity: '60',
  productRelevance: '80',
};

describe('validateContentIdea', () => {
  it('accepts a well-formed entry and trims it', () => {
    const result = validateContentIdea({
      ...VALID_INPUT,
      topic: '  How to choose a sleeping pad  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topic).toBe('How to choose a sleeping pad');
  });

  it('splits comma-separated secondary keywords and drops empties', () => {
    const result = validateContentIdea({
      ...VALID_INPUT,
      secondaryKeywords: ' r value ,, pad thickness ,  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secondaryKeywords).toEqual(['r value', 'pad thickness']);
  });

  it('allows no secondary keywords at all', () => {
    const result = validateContentIdea({ ...VALID_INPUT, secondaryKeywords: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secondaryKeywords).toEqual([]);
  });

  it('rejects an empty topic', () => {
    const result = validateContentIdea({ ...VALID_INPUT, topic: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.topic).toBeDefined();
  });

  it('rejects an empty primary keyword', () => {
    const result = validateContentIdea({ ...VALID_INPUT, primaryKeyword: '' });
    expect(result.ok).toBe(false);
  });

  it('reports several bad fields at once', () => {
    const result = validateContentIdea({
      ...VALID_INPUT,
      topic: '',
      primaryKeyword: '',
      seoOpportunity: '120',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      'primaryKeyword',
      'seoOpportunity',
      'topic',
    ]);
  });

  it('rejects an opportunity value outside 0–100', () => {
    for (const value of ['-1', '101', '1000']) {
      expect(
        validateContentIdea({ ...VALID_INPUT, geoOpportunity: value }).ok,
      ).toBe(false);
    }
  });

  it('accepts exactly 0 and exactly 100', () => {
    expect(
      validateContentIdea({
        ...VALID_INPUT,
        seoOpportunity: '0',
        geoOpportunity: '100',
        productRelevance: '0',
      }).ok,
    ).toBe(true);
  });

  it('rejects a fractional or non-numeric opportunity', () => {
    expect(validateContentIdea({ ...VALID_INPUT, seoOpportunity: '70.5' }).ok).toBe(
      false,
    );
    expect(validateContentIdea({ ...VALID_INPUT, seoOpportunity: 'high' }).ok).toBe(
      false,
    );
    expect(validateContentIdea({ ...VALID_INPUT, seoOpportunity: '' }).ok).toBe(
      false,
    );
  });

  it('rejects an unknown intent, stage, type or status', () => {
    expect(validateContentIdea({ ...VALID_INPUT, searchIntent: 'Curious' }).ok).toBe(
      false,
    );
    expect(validateContentIdea({ ...VALID_INPUT, funnelStage: 'MIDDLE' }).ok).toBe(
      false,
    );
    expect(validateContentIdea({ ...VALID_INPUT, contentType: 'Podcast' }).ok).toBe(
      false,
    );
    expect(validateContentIdea({ ...VALID_INPUT, status: 'Live' }).ok).toBe(false);
  });

  it('treats an empty target product as no target, which is allowed', () => {
    const result = validateContentIdea({ ...VALID_INPUT, targetProductId: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targetProductId).toBeNull();
  });

  it('rejects input that is not an object', () => {
    expect(validateContentIdea(null).ok).toBe(false);
    expect(validateContentIdea('a string').ok).toBe(false);
  });
});

describe('contentIdeaId', () => {
  it('derives a readable id from the topic', () => {
    expect(contentIdeaId('How to choose a sleeping pad', [])).toBe(
      'idea_how-to-choose-a-sleeping-pad',
    );
  });

  it('avoids collisions with an existing id', () => {
    const first = contentIdeaId('Same topic', []);
    const second = contentIdeaId('Same topic', [first]);
    const third = contentIdeaId('Same topic', [first, second]);
    expect(second).toBe(`${first}-2`);
    expect(third).toBe(`${first}-3`);
  });

  it('handles punctuation and length without producing a broken id', () => {
    const id = contentIdeaId(
      'Ridgeline 2P vs 3P: which tent size do you actually need for winter?',
      [],
    );
    expect(id.startsWith('idea_')).toBe(true);
    expect(id).not.toContain(' ');
    expect(id).not.toMatch(/-$/);
  });
});

describe('applyContentIdeaForm', () => {
  it('builds a complete idea from validated values', () => {
    const result = validateContentIdea(VALID_INPUT);
    if (!result.ok) throw new Error('expected valid');
    const idea = applyContentIdeaForm('idea_x', result.value);

    expect(idea.id).toBe('idea_x');
    expect(idea.seoOpportunity).toBe(70);
    expect(idea.targetProductId).toBe('prd_cloudbed_pad');
    expect(idea.secondaryKeywords).toEqual(['r value', 'pad thickness']);
  });
});

describe('content filters', () => {
  const ideas = buildDemoContentIdeas();

  it('returns everything for an empty query', () => {
    expect(filterContentIdeas(ideas, EMPTY_CONTENT_QUERY)).toHaveLength(
      ideas.length,
    );
    expect(isContentQueryActive(EMPTY_CONTENT_QUERY)).toBe(false);
  });

  it('searches topic and keywords, case and whitespace insensitively', () => {
    const tidy = filterContentIdeas(ideas, {
      ...EMPTY_CONTENT_QUERY,
      search: 'r value',
    });
    const messy = filterContentIdeas(ideas, {
      ...EMPTY_CONTENT_QUERY,
      search: '  R   VALUE ',
    });
    expect(messy.map((idea) => idea.id)).toEqual(tidy.map((idea) => idea.id));
    expect(tidy.length).toBeGreaterThan(0);
  });

  it('filters by status, intent, stage and type', () => {
    expect(
      filterContentIdeas(ideas, {
        ...EMPTY_CONTENT_QUERY,
        statuses: ['Published'],
      }).every((idea) => idea.status === 'Published'),
    ).toBe(true);

    expect(
      filterContentIdeas(ideas, {
        ...EMPTY_CONTENT_QUERY,
        intents: ['Transactional'],
      }).every((idea) => idea.searchIntent === 'Transactional'),
    ).toBe(true);

    expect(
      filterContentIdeas(ideas, { ...EMPTY_CONTENT_QUERY, stages: ['BOFU'] }).every(
        (idea) => idea.funnelStage === 'BOFU',
      ),
    ).toBe(true);

    expect(
      filterContentIdeas(ideas, {
        ...EMPTY_CONTENT_QUERY,
        types: ['Comparison'],
      }).every((idea) => idea.contentType === 'Comparison'),
    ).toBe(true);
  });

  it('intersects across fields and unions within a field', () => {
    const oneStage = filterContentIdeas(ideas, {
      ...EMPTY_CONTENT_QUERY,
      stages: ['TOFU'],
    });
    const twoStages = filterContentIdeas(ideas, {
      ...EMPTY_CONTENT_QUERY,
      stages: ['TOFU', 'BOFU'],
    });
    expect(twoStages.length).toBeGreaterThan(oneStage.length);

    const intersected = filterContentIdeas(ideas, {
      ...EMPTY_CONTENT_QUERY,
      stages: ['TOFU'],
      intents: ['Transactional'],
    });
    // No TOFU idea is Transactional in the demo plan.
    expect(intersected).toHaveLength(0);
  });
});

describe('sortByOpportunity', () => {
  const ideas = buildDemoContentIdeas();

  it('puts the highest opportunity first', () => {
    const sorted = sortByOpportunity(ideas);
    const scores = sorted.map(scoreForIdea);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('answers "which should I write next" with a single top row', () => {
    const top = sortByOpportunity(ideas)[0];
    expect(top).toBeDefined();
    // The buying guide combines high SEO opportunity, commercial intent and a
    // directly relevant product — it should outrank an informational blog.
    expect(top?.id).toBe('idea_best-2-person-backpacking-tents');
  });

  it('does not mutate its input', () => {
    const input = buildDemoContentIdeas();
    const before = input.map((idea) => idea.id);
    sortByOpportunity(input);
    expect(input.map((idea) => idea.id)).toEqual(before);
  });
});
