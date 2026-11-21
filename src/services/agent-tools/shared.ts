import { z } from 'zod';
import { DEMO_RANGE_DAYS, DEMO_WINDOW, type DemoRangeDays } from '@/domain/demo-window';
import { CHANNELS } from '@/domain/types';

const DEFAULT_RANGE: DemoRangeDays = 30;

export const rangeSchema = z
  .literal(DEMO_RANGE_DAYS)
  .default(DEFAULT_RANGE)
  .describe('Reporting window in days, ending on the demo end date. Default 30.');

export const channelSchema = z
  .enum(CHANNELS)
  .nullable()
  .default(null)
  .describe('Restrict to one attributed channel. null = all channels.');

export const TRAFFIC_SOURCE = `fixture:traffic (NorthTrail demo data, ${DEMO_WINDOW.start}..${DEMO_WINDOW.end}, UTC)`;

export function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/** Scopes a recommendation id so one rule on two scopes stays two findings. */
export function scopedId(
  recommendationId: string,
  scope: { start: string; end: string; channel: string | null },
): string {
  return `${recommendationId}@${scope.channel ?? 'all'}:${scope.start}..${scope.end}`;
}
