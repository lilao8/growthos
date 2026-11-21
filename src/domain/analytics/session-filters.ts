import type { Channel, Order, SessionFact } from '../types';

/**
 * Scope filters for the session-based modules.
 *
 * A session has exactly one attributed channel, and its order (if any) carries
 * the same attribution. Filtering both by channel before calling an existing
 * calculation therefore gives a channel-level figure on exactly the same
 * definition as the site-wide one — the formula is not copied, only its input
 * is narrowed. `null` means "every channel" and returns the input unchanged.
 */

export function sessionsForChannel(
  sessions: readonly SessionFact[],
  channel: Channel | null,
): readonly SessionFact[] {
  if (channel === null) return sessions;
  return sessions.filter((session) => session.channel === channel);
}

export function ordersForChannel(
  orders: readonly Order[],
  channel: Channel | null,
): readonly Order[] {
  if (channel === null) return orders;
  return orders.filter((order) => order.attributedChannel === channel);
}
