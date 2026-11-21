import { z } from 'zod';
import { DEMO_RANGE_DAYS } from '@/domain/demo-window';
import { CHANNELS } from '@/domain/types';
import { parseLocalState } from '@/services/agent-tools/local-state';
import type { DemoState } from '@/repositories/types';
import type { AgentTurnInput } from './orchestrator';

/**
 * The /api/agent request body.
 *
 * Everything in it is untrusted: the question and history are bounded text,
 * the scope must be a valid scope, and the browser state must match the
 * persisted schema exactly. A request that fails here never reaches a model.
 */

export const MAX_QUESTION_LENGTH = 500;
export const MAX_HISTORY_TURNS = 10;
/** The whole request: the browser state (256 KB at most) plus question, history and scope. */
export const MAX_REQUEST_BYTES = 320 * 1024;

const requestSchema = z.strictObject({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  history: z
    .array(
      z.strictObject({
        question: z.string().max(MAX_QUESTION_LENGTH),
        answerSummary: z.string().max(4000),
      }),
    )
    .max(MAX_HISTORY_TURNS),
  scope: z.strictObject({
    range: z.literal(DEMO_RANGE_DAYS),
    channel: z.enum(CHANNELS).nullable(),
    products: z.array(z.string().min(1).max(80)).max(20),
  }),
  state: z.unknown(),
});

export type AgentRequestResult =
  | { ok: true; input: AgentTurnInput; state: DemoState }
  | { ok: false; error: string };

/** `byteLength` of the state as sent, measured by the caller from the raw body. */
export function parseAgentRequest(raw: unknown, stateByteLength: number): AgentRequestResult {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid request${first === undefined ? '' : ` (${first.path.join('.') || 'body'}: ${first.message})`}.`,
    };
  }
  const state = parseLocalState(parsed.data.state, stateByteLength);
  if (!state.ok) return { ok: false, error: state.error };
  return {
    ok: true,
    input: {
      question: parsed.data.question,
      history: parsed.data.history,
      scope: parsed.data.scope,
    },
    state: state.state,
  };
}
