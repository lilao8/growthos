import { describe, expect, it } from 'vitest';
import { ordersForChannel, sessionsForChannel } from '@/domain/analytics/session-filters';
import type { Order, SessionFact } from '@/domain/types';

const sessions = [
  { sessionId: 's1', channel: 'Email' },
  { sessionId: 's2', channel: 'Meta' },
  { sessionId: 's3', channel: 'Email' },
] as unknown as SessionFact[];

const orders = [
  { id: 'o1', attributedChannel: 'Email' },
  { id: 'o2', attributedChannel: 'Meta' },
] as unknown as Order[];

describe('channel filters', () => {
  it('keeps only the requested channel', () => {
    expect(sessionsForChannel(sessions, 'Email').map((s) => s.sessionId)).toEqual(['s1', 's3']);
    expect(ordersForChannel(orders, 'Meta').map((o) => o.id)).toEqual(['o2']);
  });

  it('returns everything for null', () => {
    expect(sessionsForChannel(sessions, null)).toHaveLength(3);
    expect(ordersForChannel(orders, null)).toHaveLength(2);
  });

  it('returns nothing for a channel with no rows', () => {
    expect(sessionsForChannel(sessions, 'TikTok')).toEqual([]);
    expect(ordersForChannel(orders, 'TikTok')).toEqual([]);
  });
});
