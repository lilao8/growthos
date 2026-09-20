import { normalizeSearch } from '../product-filters';
import { scoreForIdea } from './opportunity';
import type {
  ContentFunnelStage,
  ContentIdea,
  ContentStatus,
  ContentType,
  SearchIntent,
} from '../types';

/**
 * Content list search and filtering. Same rules as the product catalogue:
 * case-insensitive, whitespace-tolerant search; filters intersect across fields
 * and union within one field; an empty selection means "no constraint".
 */

export interface ContentQuery {
  search: string;
  statuses: readonly ContentStatus[];
  intents: readonly SearchIntent[];
  stages: readonly ContentFunnelStage[];
  types: readonly ContentType[];
}

export const EMPTY_CONTENT_QUERY: ContentQuery = {
  search: '',
  statuses: [],
  intents: [],
  stages: [],
  types: [],
};

export function isContentQueryActive(query: ContentQuery): boolean {
  return (
    normalizeSearch(query.search) !== '' ||
    query.statuses.length > 0 ||
    query.intents.length > 0 ||
    query.stages.length > 0 ||
    query.types.length > 0
  );
}

function matchesSearch(idea: ContentIdea, normalized: string): boolean {
  if (normalized === '') return true;
  const haystack = [
    idea.topic,
    idea.primaryKeyword,
    ...idea.secondaryKeywords,
  ]
    .map((field) => normalizeSearch(field))
    .join(' | ');
  return haystack.includes(normalized);
}

export function filterContentIdeas(
  ideas: readonly ContentIdea[],
  query: ContentQuery,
): ContentIdea[] {
  const normalized = normalizeSearch(query.search);
  return ideas.filter((idea) => {
    if (!matchesSearch(idea, normalized)) return false;
    if (query.statuses.length > 0 && !query.statuses.includes(idea.status)) {
      return false;
    }
    if (query.intents.length > 0 && !query.intents.includes(idea.searchIntent)) {
      return false;
    }
    if (query.stages.length > 0 && !query.stages.includes(idea.funnelStage)) {
      return false;
    }
    if (query.types.length > 0 && !query.types.includes(idea.contentType)) {
      return false;
    }
    return true;
  });
}

/**
 * Highest opportunity first — that ordering is the answer to "which of these
 * should I write next". Ties fall back to the topic so the order is stable.
 */
export function sortByOpportunity(ideas: readonly ContentIdea[]): ContentIdea[] {
  return [...ideas].sort(
    (a, b) =>
      scoreForIdea(b) - scoreForIdea(a) || a.topic.localeCompare(b.topic),
  );
}
