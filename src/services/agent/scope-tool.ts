import { z } from 'zod';
import { mergeScope, type ConversationScope, type ScopeUpdate } from '@/domain/agent/scope';
import { DEMO_RANGE_DAYS } from '@/domain/demo-window';
import { CHANNELS } from '@/domain/types';

/**
 * The one tool that is not a data tool: the model uses it to record that the
 * user changed the conditions of the analysis ("only organic search", "last 7
 * days"). GrowthOS validates and merges the change; it touches no business data.
 */

export const SCOPE_TOOL_NAME = 'set_analysis_scope';

export const scopeUpdateInput = z
  .strictObject({
    range: z.literal(DEMO_RANGE_DAYS).optional(),
    channel: z.enum(CHANNELS).nullable().optional(),
    products: z.array(z.string().min(1).max(80)).max(20).optional(),
  })
  .describe(
    'Record a change the user made to the analysis conditions. Include only what changed; channel null widens back to all channels.',
  );

export const SCOPE_TOOL_DESCRIPTION =
  'Record that the user changed the analysis conditions for the rest of the conversation (date range, channel, products), as in a follow-up such as "only organic search?". Not for a condition inside a one-off question: pass that as a data-tool argument instead. Fields left out keep their current value. Changes no business data.';

export type ScopeToolResult =
  | { status: 'ok'; scope: ConversationScope }
  | { status: 'invalid-input'; issues: string[] };

export function applyScopeUpdate(scope: ConversationScope, raw: unknown): ScopeToolResult {
  const parsed = scopeUpdateInput.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      status: 'invalid-input',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`),
    };
  }
  const update: ScopeUpdate = {};
  if (parsed.data.range !== undefined) update.range = parsed.data.range;
  if (parsed.data.channel !== undefined) update.channel = parsed.data.channel;
  if (parsed.data.products !== undefined) update.products = parsed.data.products;
  return { status: 'ok', scope: mergeScope(scope, update) };
}
