import { runAgentTurn, type AgentEvent } from '@/services/agent/orchestrator';
import { MAX_REQUEST_BYTES, parseAgentRequest } from '@/services/agent/request';
import { resolveLiveModel } from '@/services/agent/live-config';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';

/**
 * POST /api/agent — one turn of the analysis agent, streamed as NDJSON.
 *
 * Each line is one AgentEvent; the last is `done` with the full result. The
 * route holds no conversation: the client sends the question, the prior turns,
 * the current scope and its own browser state, and receives the new scope back.
 */

export const maxDuration = 60;

/**
 * Reads the body, stopping as soon as it passes the limit, so an oversized
 * request is refused without being held in memory. null = too large.
 */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > limit) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const live = resolveLiveModel(process.env);
  if (!live.ok) return jsonError(live.status, live.error, live.message);

  const text = await readCapped(request, MAX_REQUEST_BYTES);
  if (text === null) {
    return jsonError(413, 'request-too-large', `The request is larger than ${MAX_REQUEST_BYTES} bytes.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return jsonError(400, 'invalid-request', 'The request body is not valid JSON.');
  }

  const stateBytes =
    body !== null && typeof body === 'object' && 'state' in body
      ? new TextEncoder().encode(JSON.stringify((body as { state: unknown }).state)).length
      : 0;
  const parsed = parseAgentRequest(body, stateBytes);
  if (!parsed.ok) return jsonError(400, 'invalid-request', parsed.error);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (line: string): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${line}\n`));
        } catch {
          // The client went away; the turn is cancelled through request.signal.
          open = false;
        }
      };
      const send = (event: AgentEvent): void => write(JSON.stringify(event));
      try {
        await runAgentTurn(
          parsed.input,
          {
            model: live.model,
            traffic: createFixtureTrafficRepository(),
            state: { source: 'browser-local', value: parsed.state },
            now: () => new Date().toISOString(),
            signal: request.signal,
          },
          send,
        );
      } catch (cause) {
        write(JSON.stringify({ type: 'error', message: cause instanceof Error ? cause.message : 'The analysis failed.' }));
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
