import type { DemoStateRepository, StateLoadResult } from '@/repositories/types';
import { createMemoryStateRepository } from '@/repositories/memory-state-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { DEMO_WINDOW } from '@/domain/demo-window';

/**
 * Service layer: composes a repository with the seed fixture and hands pages a
 * ready-to-render result. Pages never touch repositories or fixtures directly.
 */

export interface DemoStatusView {
  brandReady: boolean;
  productCount: number;
  snapshotCount: number;
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  /** Surfaced so the UI can explain a fallback instead of showing an empty page. */
  loadStatus: StateLoadResult['status'];
  loadError: string | null;
}

function createDefaultStateRepository(): DemoStateRepository {
  return createMemoryStateRepository(buildDemoSeedState());
}

/** What a reset is about to discard, so the confirmation can be specific. */
export interface DemoResetPreview {
  editedProducts: number;
  contentIdeas: number;
  auditResults: number;
  completedRecommendations: number;
  /** True when storage holds nothing the user has changed. */
  alreadyClean: boolean;
  /** Stored data could not be read. A reset is the remedy, not a loss. */
  corrupted: boolean;
}

export type DemoResetPreviewState =
  | { status: 'ready'; preview: DemoResetPreview }
  | { status: 'error'; message: string };

export type DemoResetResult =
  | { status: 'reset' }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * Compares stored state against the seed so the confirmation can say what is
 * actually at stake. Everything is counted against the seed rather than against
 * zero: the demo ships with content ideas, and discarding those is not the same
 * as discarding ones the user wrote.
 */
export async function previewDemoReset(
  repository: DemoStateRepository,
): Promise<DemoResetPreviewState> {
  let stored;
  try {
    stored = await repository.load();
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved demo data.'),
    };
  }

  // Nothing has been written yet, so there is nothing of the user's to lose.
  // Corrupted storage reports the seed too, but a reset there is a repair
  // rather than a no-op, so it is not "already clean".
  if (
    stored.status === 'empty' ||
    stored.status === 'unavailable' ||
    stored.status === 'corrupted'
  ) {
    return {
      status: 'ready',
      preview: {
        editedProducts: 0,
        contentIdeas: 0,
        auditResults: 0,
        completedRecommendations: 0,
        alreadyClean: stored.status !== 'corrupted',
        corrupted: stored.status === 'corrupted',
      },
    };
  }

  const seed = buildDemoSeedState();
  const seedProducts = new Map(seed.products.map((item) => [item.id, item]));
  const seedIdeas = new Set(seed.contentIdeas.map((item) => item.id));

  const editedProducts = stored.state.products.filter((product) => {
    const original = seedProducts.get(product.id);
    return original === undefined || JSON.stringify(original) !== JSON.stringify(product);
  }).length;

  const contentIdeas = stored.state.contentIdeas.filter((idea) => {
    if (!seedIdeas.has(idea.id)) return true;
    const original = seed.contentIdeas.find((item) => item.id === idea.id);
    return JSON.stringify(original) !== JSON.stringify(idea);
  }).length;

  const preview: DemoResetPreview = {
    editedProducts,
    contentIdeas,
    auditResults: stored.state.auditResults.length,
    completedRecommendations: stored.state.recommendationStatuses.length,
    alreadyClean:
      editedProducts === 0 &&
      contentIdeas === 0 &&
      stored.state.auditResults.length === 0 &&
      stored.state.recommendationStatuses.length === 0,
    corrupted: false,
  };

  return { status: 'ready', preview };
}

/**
 * Clears this project's stored demo data and returns to the seed.
 *
 * Only ever called from an explicit, confirmed user action — nothing in the app
 * resets storage on load, on a schema mismatch, or on corrupted data.
 */
export async function resetDemoData(
  repository: DemoStateRepository,
): Promise<DemoResetResult> {
  try {
    await repository.reset();
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not reset the demo data.'),
    };
  }
  return { status: 'reset' };
}

export async function getDemoStatus(
  repository: DemoStateRepository = createDefaultStateRepository(),
): Promise<DemoStatusView> {
  const result = await repository.load();
  return {
    brandReady: result.state.products.length > 0,
    productCount: result.state.products.length,
    snapshotCount: result.state.pageSnapshots.length,
    windowStart: DEMO_WINDOW.start,
    windowEnd: DEMO_WINDOW.end,
    windowDays: DEMO_WINDOW.days,
    loadStatus: result.status,
    loadError: result.error,
  };
}
