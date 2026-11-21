import { runAgentTurn, type AgentEvent } from '@/services/agent/orchestrator';
import { parseAgentRequest } from '@/services/agent/request';
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

function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const live = resolveLiveModel(process.env);
  if (!live.ok) return jsonError(live.status, live.error, live.message);

  let text: string;
  let body: unknown;
  try {
    text = await request.text();
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
      const send = (event: AgentEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
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
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'error', message: cause instanceof Error ? cause.message : 'The analysis failed.' })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
