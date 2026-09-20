import type { DemoState, StateLoadResult } from './types';
import { demoStateSchema, SCHEMA_VERSION } from './types';

/**
 * Shared encode/decode used by every adapter, so the memory backend and the
 * browser backend enforce exactly the same validation rules.
 */

export function encodeState(state: DemoState): string {
  const parsed = demoStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new TypeError(
      `Refusing to persist invalid demo state: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  }
  return JSON.stringify(parsed.data);
}

export function decodeState(raw: string, fallback: DemoState): StateLoadResult {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return {
      status: 'corrupted',
      state: fallback,
      error: 'Stored demo data is not valid JSON.',
    };
  }

  const parsed = demoStateSchema.safeParse(candidate);
  if (!parsed.success) {
    const versionMismatch =
      typeof candidate === 'object' &&
      candidate !== null &&
      'schemaVersion' in candidate &&
      (candidate as { schemaVersion: unknown }).schemaVersion !== SCHEMA_VERSION;

    return {
      status: 'corrupted',
      state: fallback,
      error: versionMismatch
        ? `Stored demo data uses an older schema (expected version ${SCHEMA_VERSION}).`
        : `Stored demo data failed validation: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')} ${issue.message}`)
            .join('; ')}`,
    };
  }

  return { status: 'loaded', state: parsed.data, error: null };
}

export function cloneState(state: DemoState): DemoState {
  return structuredClone(state);
}
