import { demoStateSchema, type DemoState } from '@/repositories/types';

/**
 * Validates state a browser sent with its request.
 *
 * The payload is untrusted input: it is accepted only if it matches the
 * persisted schema exactly, including the schema version. A mismatch is an
 * error to report, never a reason to fall back to the seed silently — an answer
 * computed from data the visitor does not have would not match their pages.
 */

export const MAX_LOCAL_STATE_BYTES = 256 * 1024;

export type LocalStateResult =
  | { ok: true; state: DemoState }
  | { ok: false; error: string };

export function parseLocalState(raw: unknown, byteLength: number): LocalStateResult {
  if (byteLength > MAX_LOCAL_STATE_BYTES) {
    return {
      ok: false,
      error: `Browser state is ${byteLength} bytes, above the ${MAX_LOCAL_STATE_BYTES}-byte limit.`,
    };
  }
  const parsed = demoStateSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Browser state does not match the expected format${first === undefined ? '' : ` (${first.path.join('.') || 'root'}: ${first.message})`}. Reset the demo data on the About page if this persists.`,
    };
  }
  return { ok: true, state: parsed.data };
}
