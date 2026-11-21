/**
 * The thin seam between GrowthOS and a language model.
 *
 * A model sees messages and tool specs and answers with either tool calls or
 * a final text. It never executes anything: GrowthOS validates the calls, runs
 * the tools and checks the final text. Swapping providers means writing one
 * `ModelClient`; tests use a scripted one.
 */

export interface ToolCall {
  /** Provider-assigned id, echoed back with the result. */
  id: string;
  name: string;
  /** Raw JSON text as the model produced it; parsed and validated by GrowthOS. */
  arguments: string;
}

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

/** Token counts as the provider reports them, when it does. */
export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

export type ModelTurn =
  | { type: 'tool_calls'; calls: ToolCall[]; usage?: ModelUsage }
  | { type: 'final'; content: string; usage?: ModelUsage };

export interface ModelClient {
  /** Recorded with every run, e.g. "scripted:demo". */
  readonly id: string;
  next(
    request: { messages: readonly AgentMessage[]; tools: readonly ToolSpec[] },
    signal: AbortSignal,
  ): Promise<ModelTurn>;
}
