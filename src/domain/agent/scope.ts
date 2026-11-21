import { DEMO_AS_OF, buildWindow, type DateWindow, type DemoRangeDays } from '../demo-window';
import type { Channel } from '../types';

/**
 * The conditions an analysis conversation is currently about.
 *
 * Owned by GrowthOS, not by the model. The model may only *propose* a change
 * (through the scope tool); the change is validated, merged here, and carried
 * by the client into the next turn. A follow-up such as "only organic search?"
 * changes the channel and nothing else, so the date range stays where the
 * conversation left it. A new conversation starts from DEFAULT_SCOPE.
 */

export interface ConversationScope {
  range: DemoRangeDays;
  /** null = every channel. */
  channel: Channel | null;
  /** Product ids or SKUs the conversation has narrowed to. Empty = all. */
  products: string[];
}

export const DEFAULT_SCOPE: ConversationScope = {
  range: 30,
  channel: null,
  products: [],
};

/** Only the fields present change; an explicit null widens back to all channels. */
export interface ScopeUpdate {
  range?: DemoRangeDays;
  channel?: Channel | null;
  products?: string[];
}

export function mergeScope(scope: ConversationScope, update: ScopeUpdate): ConversationScope {
  return {
    range: update.range ?? scope.range,
    channel: update.channel === undefined ? scope.channel : update.channel,
    products: update.products === undefined ? scope.products : [...update.products],
  };
}

export function scopeWindow(scope: ConversationScope): DateWindow {
  return buildWindow(scope.range, DEMO_AS_OF);
}

/** True when two scopes describe the same analysis. */
export function sameScope(a: ConversationScope, b: ConversationScope): boolean {
  return (
    a.range === b.range &&
    a.channel === b.channel &&
    a.products.length === b.products.length &&
    a.products.every((product, index) => product === b.products[index])
  );
}
