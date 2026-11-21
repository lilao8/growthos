import type { AgentMessage, ModelClient, ModelTurn, ToolSpec } from './model';

/**
 * OpenAI Chat Completions behind the `ModelClient` seam.
 *
 * Only format mapping lives here: internal messages and tool specs out,
 * tool calls or a final text back. GrowthOS still validates every call and
 * every answer. Wire format checked against the official reference on
 * 2026-11-21: tools nest under `function`, tool results reply with
 * `tool_call_id`, and `arguments` arrive as a JSON string.
 *
 * The API key is used in exactly one place — the Authorization header — and
 * never appears in an error message, a log line or a returned value.
 */

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export interface OpenAIModelOptions {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  endpoint?: string;
}

interface WireToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toWireMessages(messages: readonly AgentMessage[]): WireMessage[] {
  return messages.map((message): WireMessage => {
    switch (message.role) {
      case 'system':
      case 'user':
        return { role: message.role, content: message.content };
      case 'assistant':
        return message.toolCalls.length === 0
          ? { role: 'assistant', content: message.content ?? '' }
          : {
              role: 'assistant',
              content: message.content,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            };
      case 'tool':
        return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    }
  });
}

export function toWireTools(tools: readonly ToolSpec[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads a provider error without trusting its shape, and without echoing the request. */
function errorMessage(status: number, body: unknown): string {
  const error = isRecord(body) ? body['error'] : undefined;
  const detail = isRecord(error) && typeof error['message'] === 'string' ? error['message'] : null;
  const hint = status === 401 ? ' Check OPENAI_API_KEY.' : status === 429 ? ' Rate limit or quota reached.' : '';
  return `OpenAI answered ${status}${detail === null ? '' : `: ${detail.slice(0, 300)}`}.${hint}`;
}

/** Turns a Chat Completions response into a ModelTurn, or throws if it has neither calls nor text. */
export function fromWireResponse(body: unknown): ModelTurn {
  if (!isRecord(body) || !Array.isArray(body['choices'])) throw new Error('OpenAI returned a response without choices.');
  const choice: unknown = body['choices'][0];
  const message = isRecord(choice) ? choice['message'] : undefined;
  if (!isRecord(message)) throw new Error('OpenAI returned a choice without a message.');

  const rawUsage = body['usage'];
  const usage =
    isRecord(rawUsage) && typeof rawUsage['prompt_tokens'] === 'number' && typeof rawUsage['completion_tokens'] === 'number'
      ? { promptTokens: rawUsage['prompt_tokens'], completionTokens: rawUsage['completion_tokens'] }
      : undefined;
  const withUsage = <T extends ModelTurn>(turn: T): T => (usage === undefined ? turn : { ...turn, usage });

  const rawCalls = message['tool_calls'];
  if (Array.isArray(rawCalls) && rawCalls.length > 0) {
    const calls = rawCalls.map((raw, index) => {
      const fn = isRecord(raw) ? raw['function'] : undefined;
      if (!isRecord(raw) || !isRecord(fn) || typeof fn['name'] !== 'string') {
        throw new Error(`OpenAI returned a malformed tool call at position ${index}.`);
      }
      return {
        id: typeof raw['id'] === 'string' ? raw['id'] : `call_${index}`,
        name: fn['name'],
        arguments: typeof fn['arguments'] === 'string' ? fn['arguments'] : '',
      };
    });
    return withUsage({ type: 'tool_calls', calls });
  }

  if (typeof message['content'] === 'string' && message['content'].trim() !== '') {
    return withUsage({ type: 'final', content: message['content'] });
  }
  const refusal = typeof message['refusal'] === 'string' ? message['refusal'] : null;
  throw new Error(refusal === null ? 'OpenAI returned neither tool calls nor text.' : `OpenAI declined to answer: ${refusal.slice(0, 300)}`);
}

export function createOpenAIModel(options: OpenAIModelOptions): ModelClient {
  const fetcher = options.fetcher ?? fetch;
  return {
    id: `openai:${options.model}`,
    async next(request, signal) {
      const response = await fetcher(options.endpoint ?? OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: toWireMessages(request.messages),
          tools: toWireTools(request.tools),
          tool_choice: 'auto',
        }),
        signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON body is reported by status below.
      }
      if (!response.ok) throw new Error(errorMessage(response.status, body));
      return fromWireResponse(body);
    },
  };
}
