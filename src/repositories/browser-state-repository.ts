import type { DemoState, DemoStateRepository, StateLoadResult } from './types';
import { cloneState, decodeState, encodeState } from './serialization';

/**
 * Browser storage adapter.
 *
 * Isolation rules:
 * - Every key is namespaced. `reset()` removes only keys under this project's
 *   namespace, so it can never clear unrelated data in the same origin.
 * - E2E runs override the namespace via NEXT_PUBLIC_GROWTHOS_STORAGE_NAMESPACE.
 * - On the server there is no localStorage; reads report 'unavailable' and the
 *   caller renders seed data rather than an empty screen.
 */

export const DEFAULT_STORAGE_NAMESPACE = 'growthos.demo';

export function resolveNamespace(): string {
  const configured = process.env.NEXT_PUBLIC_GROWTHOS_STORAGE_NAMESPACE;
  return configured && configured.length > 0
    ? configured
    : DEFAULT_STORAGE_NAMESPACE;
}

export function stateKey(namespace: string): string {
  return `${namespace}.state`;
}

/** The slice of the Storage API this adapter needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): StorageLike | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  try {
    return globalThis.localStorage;
  } catch {
    // Storage can throw when blocked by browser privacy settings.
    return null;
  }
}

export interface BrowserStateRepositoryOptions {
  namespace?: string;
  /** Injectable for tests; defaults to the real localStorage when present. */
  storage?: StorageLike | null;
}

export function createBrowserStateRepository(
  seed: DemoState,
  options: BrowserStateRepositoryOptions = {},
): DemoStateRepository {
  const namespace = options.namespace ?? resolveNamespace();
  const key = stateKey(namespace);
  const resolveStorage = (): StorageLike | null =>
    options.storage !== undefined ? options.storage : getBrowserStorage();

  return {
    async load(): Promise<StateLoadResult> {
      const storage = resolveStorage();
      if (storage === null) {
        return { status: 'unavailable', state: cloneState(seed), error: null };
      }

      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        return { status: 'unavailable', state: cloneState(seed), error: null };
      }

      if (raw === null) {
        return { status: 'empty', state: cloneState(seed), error: null };
      }
      return decodeState(raw, cloneState(seed));
    },

    async save(state: DemoState): Promise<void> {
      const storage = resolveStorage();
      if (storage === null) {
        throw new Error(
          'Browser storage is unavailable, so the change was not saved.',
        );
      }
      // Encode first: an invalid state must throw before anything is written.
      storage.setItem(key, encodeState(state));
    },

    async reset(): Promise<StateLoadResult> {
      const storage = resolveStorage();
      if (storage !== null) {
        storage.removeItem(key);
      }
      return { status: 'empty', state: cloneState(seed), error: null };
    },
  };
}
