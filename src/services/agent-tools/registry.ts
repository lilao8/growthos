import { auditFindingsTool } from './audits';
import { channelPerformanceTool } from './channels';
import { funnelTool } from './funnel';
import { productPerformanceTool } from './products';
import { messageFrom } from './shared';
import type { AgentTool, ToolContext, ToolOutcome } from './types';

/**
 * The complete set of tools the agent may call.
 *
 * Closed and read-only: the list is fixed at module load with no public way to add to it, and every entry's
 * `readOnly` is the literal `true`. A request to change something has no tool
 * to reach for — the answer can only say so.
 */

export type RunToolOutcome =
  | ToolOutcome<unknown>
  | { status: 'unknown-tool'; name: string };

/**
 * A tool with its input type erased behind its own schema. Validation happens
 * inside the closure, where the tool's real input type is still known, so the
 * registry needs no `any`.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  readOnly: true;
  /** JSON-schema-convertible description of the input, for the model. */
  input: AgentTool<unknown, unknown>['input'];
  run(rawInput: unknown, context: ToolContext): Promise<RunToolOutcome>;
}

function register<Input, Data>(tool: AgentTool<Input, Data>): RegisteredTool {
  return {
    name: tool.name,
    description: tool.description,
    readOnly: tool.readOnly,
    input: tool.input,
    async run(rawInput, context) {
      const parsed = tool.input.safeParse(rawInput ?? {});
      if (!parsed.success) {
        return {
          status: 'invalid-input',
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`,
          ),
        };
      }
      try {
        return await tool.execute(parsed.data, context);
      } catch (cause) {
        return { status: 'error', message: messageFrom(cause, `Tool ${tool.name} failed.`) };
      }
    },
  };
}

export const AGENT_TOOLS: readonly RegisteredTool[] = [
  register(channelPerformanceTool),
  register(funnelTool),
  register(productPerformanceTool),
  register(auditFindingsTool),
];

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name);

export function findTool(name: string): RegisteredTool | null {
  return AGENT_TOOLS.find((tool) => tool.name === name) ?? null;
}

/**
 * Validates raw input against the tool's schema, then runs it. Never throws:
 * a bad argument, an unknown tool or a failing data source each come back as
 * a structured outcome the caller can report.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  context: ToolContext,
): Promise<RunToolOutcome> {
  const tool = findTool(name);
  if (tool === null) return { status: 'unknown-tool', name };
  return tool.run(rawInput, context);
}
