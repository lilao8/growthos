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

export function createDefaultStateRepository(): DemoStateRepository {
  return createMemoryStateRepository(buildDemoSeedState());
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
