import {
  EMPTY_CONTENT_QUERY,
  filterContentIdeas,
  isContentQueryActive,
  sortByOpportunity,
  type ContentQuery,
} from '@/domain/content/content-filters';
import {
  applyContentIdeaForm,
  contentIdeaId,
  validateContentIdea,
  type ContentFieldErrors,
} from '@/domain/content/content-validation';
import { opportunityBreakdown } from '@/domain/content/opportunity';
import type { OpportunityBreakdown } from '@/domain/content/opportunity';
import { readAudit } from '@/domain/audit-lookup';
import { CONTENT_STATUSES } from '@/domain/types';
import type { ContentIdea, ContentStatus, Product } from '@/domain/types';
import type { DemoState, DemoStateRepository } from '@/repositories/types';

/**
 * Content service: the plan's list, its create/edit path and status changes.
 *
 * A content idea may name a target product, and that link is validated against
 * the catalogue on every write — a plan pointing at a product that does not
 * exist would quietly break the scoring rationale.
 */

export interface ContentServiceDeps {
  state: DemoStateRepository;
}

export interface ContentRow {
  idea: ContentIdea;
  /** null when no product is targeted, or the target no longer exists. */
  product: Product | null;
  /** Set when the idea names a product the catalogue no longer has. */
  danglingProduct: boolean;
  breakdown: OpportunityBreakdown;
}

export interface ContentDetailExtras {
  /**
   * The target product's measured audit scores, shown beside the entered
   * opportunity estimates precisely so the two are not confused.
   */
  measuredSeoScore: number | null;
  measuredGeoScore: number | null;
  auditRun: boolean;
}

export type ContentListState =
  | {
      status: 'ready';
      rows: ContentRow[];
      totalCount: number;
      queryActive: boolean;
    }
  | { status: 'empty'; rows: []; totalCount: number; queryActive: boolean }
  | { status: 'error'; message: string };

export type ContentDetailState =
  | { status: 'ready'; row: ContentRow; extras: ContentDetailExtras }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export type SaveContentResult =
  | { status: 'saved'; idea: ContentIdea }
  | { status: 'invalid'; errors: ContentFieldErrors }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function toRow(state: DemoState, idea: ContentIdea): ContentRow {
  const product =
    idea.targetProductId === null
      ? null
      : (state.products.find(
          (candidate) => candidate.id === idea.targetProductId,
        ) ?? null);

  return {
    idea,
    product,
    danglingProduct: idea.targetProductId !== null && product === null,
    breakdown: opportunityBreakdown({
      seoOpportunity: idea.seoOpportunity,
      geoOpportunity: idea.geoOpportunity,
      searchIntent: idea.searchIntent,
      productRelevance: idea.productRelevance,
    }),
  };
}

export async function loadContentList(
  deps: ContentServiceDeps,
  query: ContentQuery = EMPTY_CONTENT_QUERY,
): Promise<ContentListState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load the content plan.'),
    };
  }

  const queryActive = isContentQueryActive(query);
  const totalCount = state.contentIdeas.length;
  const matched = sortByOpportunity(
    filterContentIdeas(state.contentIdeas, query),
  );

  if (matched.length === 0) {
    return { status: 'empty', rows: [], totalCount, queryActive };
  }

  return {
    status: 'ready',
    rows: matched.map((idea) => toRow(state, idea)),
    totalCount,
    queryActive,
  };
}

export async function loadContentIdea(
  deps: ContentServiceDeps,
  ideaId: string,
): Promise<ContentDetailState> {
  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load this content idea.'),
    };
  }

  const idea = state.contentIdeas.find((candidate) => candidate.id === ideaId);
  if (idea === undefined) return { status: 'not-found' };

  const row = toRow(state, idea);
  const snapshot =
    row.product === null
      ? undefined
      : state.pageSnapshots.find(
          (candidate) => candidate.productId === row.product?.id,
        );

  const seo =
    snapshot === undefined
      ? null
      : readAudit(
          state.auditResults,
          snapshot,
          row.product?.primaryKeyword ?? '',
          'seo',
        );
  const geo =
    snapshot === undefined
      ? null
      : readAudit(state.auditResults, snapshot, '', 'geo');

  return {
    status: 'ready',
    row,
    extras: {
      measuredSeoScore: seo?.score ?? null,
      measuredGeoScore: geo?.score ?? null,
      auditRun: seo !== null || geo !== null,
    },
  };
}

/** Rejects a target product that is not in the catalogue. */
function targetProductError(
  state: DemoState,
  targetProductId: string | null,
): ContentFieldErrors | null {
  if (targetProductId === null) return null;
  const exists = state.products.some(
    (product) => product.id === targetProductId,
  );
  return exists
    ? null
    : { targetProductId: 'That product is not in the catalogue.' };
}

export async function createContentIdea(
  deps: ContentServiceDeps,
  input: unknown,
): Promise<SaveContentResult> {
  const validation = validateContentIdea(input);
  if (!validation.ok) return { status: 'invalid', errors: validation.errors };

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved content plan.'),
    };
  }

  const productError = targetProductError(state, validation.value.targetProductId);
  if (productError !== null) return { status: 'invalid', errors: productError };

  const idea = applyContentIdeaForm(
    contentIdeaId(
      validation.value.topic,
      state.contentIdeas.map((existing) => existing.id),
    ),
    validation.value,
  );

  try {
    await deps.state.save({
      ...state,
      contentIdeas: [...state.contentIdeas, idea],
    });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save the new content idea.'),
    };
  }

  return { status: 'saved', idea };
}

export async function updateContentIdea(
  deps: ContentServiceDeps,
  ideaId: string,
  input: unknown,
): Promise<SaveContentResult> {
  const validation = validateContentIdea(input);
  if (!validation.ok) return { status: 'invalid', errors: validation.errors };

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved content plan.'),
    };
  }

  if (!state.contentIdeas.some((idea) => idea.id === ideaId)) {
    return { status: 'error', message: 'That content idea no longer exists.' };
  }

  const productError = targetProductError(state, validation.value.targetProductId);
  if (productError !== null) return { status: 'invalid', errors: productError };

  const updated = applyContentIdeaForm(ideaId, validation.value);

  try {
    await deps.state.save({
      ...state,
      contentIdeas: state.contentIdeas.map((idea) =>
        idea.id === ideaId ? updated : idea,
      ),
    });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save your changes.'),
    };
  }

  return { status: 'saved', idea: updated };
}

/**
 * Status is moved on its own so the list can advance a piece without opening
 * the full form. Publishing here is a planning record only — nothing is sent
 * anywhere, and the MVP has no CMS behind it.
 */
export async function setContentStatus(
  deps: ContentServiceDeps,
  ideaId: string,
  status: string,
): Promise<SaveContentResult> {
  if (!(CONTENT_STATUSES as readonly string[]).includes(status)) {
    return { status: 'invalid', errors: { status: 'Unknown status.' } };
  }

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved content plan.'),
    };
  }

  const existing = state.contentIdeas.find((idea) => idea.id === ideaId);
  if (existing === undefined) {
    return { status: 'error', message: 'That content idea no longer exists.' };
  }

  const updated: ContentIdea = { ...existing, status: status as ContentStatus };

  try {
    await deps.state.save({
      ...state,
      contentIdeas: state.contentIdeas.map((idea) =>
        idea.id === ideaId ? updated : idea,
      ),
    });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save the status change.'),
    };
  }

  return { status: 'saved', idea: updated };
}
