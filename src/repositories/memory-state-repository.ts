import type { DemoState, DemoStateRepository, StateLoadResult } from './types';
import { cloneState, decodeState, encodeState } from './serialization';

/**
 * In-memory adapter. Used by tests and by server rendering, where browser
 * storage does not exist. Holds the encoded string rather than the object so it
 * exercises the same serialization path as the browser adapter.
 */
export function createMemoryStateRepository(
  seed: DemoState,
  initial?: DemoState,
): DemoStateRepository {
  let stored: string | null = initial ? encodeState(initial) : null;

  return {
    async load(): Promise<StateLoadResult> {
      if (stored === null) {
        return { status: 'empty', state: cloneState(seed), error: null };
      }
      return decodeState(stored, cloneState(seed));
    },

    async save(state: DemoState): Promise<void> {
      stored = encodeState(state);
    },

    async reset(): Promise<StateLoadResult> {
      stored = null;
      return { status: 'empty', state: cloneState(seed), error: null };
    },
  };
}

/**
 * Always-failing adapter. Used by the documented QA seam to exercise the save
 * error path, which a local storage backend would otherwise never reach.
 */
export function createFailingStateRepository(
  seed: DemoState,
  message = 'Demo storage is unavailable.',
): DemoStateRepository {
  return {
    async load(): Promise<StateLoadResult> {
      return { status: 'unavailable', state: cloneState(seed), error: null };
    },
    async save(): Promise<void> {
      throw new Error(message);
    },
    async reset(): Promise<StateLoadResult> {
      return { status: 'unavailable', state: cloneState(seed), error: null };
    },
  };
}
