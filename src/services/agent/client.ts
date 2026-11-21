import type { ConversationScope } from '@/domain/agent/scope';
import type { DemoState } from '@/repositories/types';
import type { AgentEvent, AgentTurnResult, PriorTurn } from './orchestrator';

/**
 * Browser side of /api/agent: posts one question and reads the NDJSON event
 * stream. Kept out of the component so the page only renders what it is told.
 */

export interface AgentRequestBody {
  question: string;
  history: PriorTurn[];
  scope: ConversationScope;
  state: DemoState;
}

export type AgentCallResult =
  | { kind: 'done'; result: AgentTurnResult }
  | { kind: 'disabled'; message: string }
  | { kind: 'error'; message: string };

function isEvent(value: unknown): value is AgentEvent | { type: 'error'; message: string } {
  return value !== null && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

export async function askAgent(
  body: AgentRequestBody,
  onEvent: (event: AgentEvent) => void,
  options: { endpoint?: string; signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<AgentCallResult> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(options.endpoint ?? '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (cause) {
    return { kind: 'error', message: cause instanceof Error ? cause.message : 'The request failed.' };
  }

  if (!response.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = (await response.json()) as { error?: string; message?: string };
    } catch {
      // A non-JSON error body still gets a readable message below.
    }
    const message = payload.message ?? `The server answered ${response.status}.`;
    return response.status === 503 && payload.error === 'live-disabled'
      ? { kind: 'disabled', message }
      : { kind: 'error', message };
  }

  if (response.body === null) return { kind: 'error', message: 'The server sent no response.' };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: AgentTurnResult | null = null;
  let failure: string | null = null;

  const handle = (line: string): void => {
    if (line.trim() === '') return;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      failure = 'The server sent a malformed progress update.';
      return;
    }
    if (!isEvent(value)) return;
    if (value.type === 'error') {
      failure = value.message;
      return;
    }
    if (value.type === 'done') final = value.result;
    onEvent(value);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  handle(buffer + decoder.decode());

  if (final !== null) return { kind: 'done', result: final };
  return { kind: 'error', message: failure ?? 'The analysis ended without a result.' };
}
