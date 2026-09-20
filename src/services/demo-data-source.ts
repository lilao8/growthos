import type { DemoStateRepository } from '@/repositories/types';
import { createBrowserStateRepository } from '@/repositories/browser-state-repository';
import { createFailingStateRepository } from '@/repositories/memory-state-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import {
  createDelayedTrafficRepository,
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
  createFlakyTrafficRepository,
} from '@/repositories/traffic-repository';

/**
 * QA seam.
 *
 * Loading, empty and error states are part of the acceptance criteria, but with
 * a local fixture they would otherwise never occur. A `?demo=` parameter selects
 * an alternative adapter so those states can be exercised in the browser and in
 * E2E without faking markup.
 *
 * This is a testing seam, not a product feature: the values are a closed
 * allowlist, anything else falls back to the real fixture, and no screen links
 * to it.
 */

export const DEMO_DATA_MODES = [
  'empty',
  'error',
  'slow',
  'flaky',
  'storage-error',
] as const;
export type DemoDataMode = (typeof DEMO_DATA_MODES)[number];

export function parseDemoDataMode(value: string | null): DemoDataMode | null {
  if (value === null) return null;
  return (DEMO_DATA_MODES as readonly string[]).includes(value)
    ? (value as DemoDataMode)
    : null;
}

/**
 * The editable catalogue persists to browser storage, except under the
 * `storage-error` seam, where reads still succeed but every save fails — which
 * is what makes the "nothing was saved, your input is still here" path testable.
 */
export function resolveStateRepository(
  mode: DemoDataMode | null,
): DemoStateRepository {
  const seed = buildDemoSeedState();
  return mode === 'storage-error'
    ? createFailingStateRepository(seed)
    : createBrowserStateRepository(seed);
}

export function resolveTrafficRepository(
  mode: DemoDataMode | null,
): TrafficRepository {
  switch (mode) {
    case 'empty':
      return createEmptyTrafficRepository();
    case 'error':
      return createFailingTrafficRepository();
    case 'slow':
      return createDelayedTrafficRepository(
        createFixtureTrafficRepository(),
        1200,
      );
    case 'storage-error':
      // Loading works; only saving fails.
      return createFixtureTrafficRepository();
    case 'flaky':
      // Fails once, then succeeds — so a successful retry is observable.
      return createFlakyTrafficRepository(1);
    case null:
      return createFixtureTrafficRepository();
  }
}
