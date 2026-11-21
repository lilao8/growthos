import { z } from 'zod';
import { comparableWindows } from '@/domain/agent/windows';
import { compareValues } from '@/domain/agent/comparison';
import { evidenceStrength } from '@/domain/agent/priority';
import { analyticsHref } from '@/domain/agent/links';
import { makeRef, refId, type MetricRef, type RefScope } from '@/domain/agent/refs';
import { DEMO_AS_OF, DEMO_WINDOW, type DateWindow, type DemoRangeDays } from '@/domain/demo-window';
import { analyticsRecommendations } from '@/domain/recommendations/aggregate';
import { ANALYTICS_THRESHOLDS } from '@/domain/recommendations/config';
import type { AnalyticsTotals, ChannelRow } from '@/domain/analytics/channel-metrics';
import type { Channel } from '@/domain/types';
import { loadAnalytics } from '@/services/analytics-service';
import { channelSchema, messageFrom, rangeSchema, scopedId, TRAFFIC_SOURCE } from './shared';
import type { AgentFinding, AgentTool, ComparedMetric, Gap, ToolOutcome } from './types';

/**
 * Channel performance: the Analytics page's channel table for one window, the
 * same table for the previous window when one exists, and the findings the
 * existing analytics rules raise. Numbers come from `loadAnalytics`, the same
 * function the page calls, so the link and the tool cannot disagree.
 */

export const channelPerformanceInput = z.strictObject({
  range: rangeSchema,
  channel: channelSchema,
  compare: z
    .boolean()
    .default(true)
    .describe('Also return the immediately preceding window of the same length.'),
});

export type ChannelPerformanceInput = z.infer<typeof channelPerformanceInput>;

export interface ChannelComparison {
  channel: Channel;
  sessions: ComparedMetric;
  orders: ComparedMetric;
  revenueCents: ComparedMetric;
  conversionRate: ComparedMetric;
}

export interface ChannelPerformanceData {
  range: DemoRangeDays;
  channel: Channel | null;
  totals: AnalyticsTotals;
  channels: ChannelRow[];
  previous: { totals: AnalyticsTotals; channels: ChannelRow[] } | null;
  comparisons: ChannelComparison[];
}

const TOOL = 'channels';

function rowRefs(
  row: ChannelRow,
  window: DateWindow,
  href: string,
): MetricRef[] {
  const scope: RefScope = { tool: TOOL, window, channel: row.channel, productId: null };
  return [
    makeRef(scope, 'sessions', { label: `${row.channel} sessions`, value: row.sessions, unit: 'count', definition: 'sessions', href }),
    makeRef(scope, 'orders', { label: `${row.channel} orders`, value: row.orders, unit: 'count', definition: 'orders', href }),
    makeRef(scope, 'revenue', { label: `${row.channel} revenue`, value: row.revenueCents, unit: 'cents', definition: 'revenue', href }),
    makeRef(scope, 'conversion_rate', { label: `${row.channel} conversion rate`, value: row.conversionRate, unit: 'ratio', definition: 'conversion_rate', href }),
    makeRef(scope, 'roas', { label: `${row.channel} ROAS`, value: row.roas, unit: 'multiple', definition: 'roas', href }),
    makeRef(scope, 'cac', { label: `${row.channel} CAC`, value: row.cacCents, unit: 'cents', definition: 'cac', href }),
    makeRef(scope, 'ad_spend', { label: `${row.channel} ad spend`, value: row.adSpendCents, unit: 'cents', definition: 'ad_spend', href }),
  ];
}

function totalRefs(totals: AnalyticsTotals, href: string): MetricRef[] {
  const scope: RefScope = { tool: TOOL, window: totals.window, channel: null, productId: null };
  return [
    makeRef(scope, 'sessions', { label: 'Site sessions', value: totals.sessions, unit: 'count', definition: 'sessions', href }),
    makeRef(scope, 'orders', { label: 'Site orders', value: totals.orders, unit: 'count', definition: 'orders', href }),
    makeRef(scope, 'revenue', { label: 'Site revenue', value: totals.revenueCents, unit: 'cents', definition: 'revenue', href }),
    makeRef(scope, 'conversion_rate', { label: 'Site conversion rate', value: totals.conversionRate, unit: 'ratio', definition: 'conversion_rate', href }),
    makeRef(scope, 'average_order_value', { label: 'Site average order value', value: totals.averageOrderValueCents, unit: 'cents', definition: 'average_order_value', href }),
  ];
}

function refFor(window: DateWindow, channel: Channel, metric: string): string {
  return refId({ tool: TOOL, window, channel, productId: null }, metric);
}

/** Channel figures each rule reads. */
const RULE_METRICS: Record<string, string[]> = {
  'high-traffic-low-conversion': ['sessions', 'orders', 'conversion_rate'],
  'roas-below-target': ['ad_spend', 'revenue', 'roas'],
  'cac-above-aov-share': ['cac', 'orders'],
};

/** Site figures a rule compares the channel against. */
const RULE_SITE_METRICS: Record<string, string[]> = {
  'cac-above-aov-share': ['average_order_value'],
};

export const channelPerformanceTool: AgentTool<ChannelPerformanceInput, ChannelPerformanceData> = {
  name: 'get_channel_performance',
  description:
    'Sessions, orders, revenue, conversion rate, CAC and ROAS by attributed channel for a window ending on the demo end date, optionally compared with the preceding window of the same length. Read-only.',
  readOnly: true,
  input: channelPerformanceInput,
  async execute(input, context): Promise<ToolOutcome<ChannelPerformanceData>> {
    const windows = comparableWindows(input.range, DEMO_AS_OF, DEMO_WINDOW);
    const deps = { traffic: context.traffic };

    let current;
    let previous = null;
    try {
      current = await loadAnalytics(deps, input.range);
      if (input.compare && windows.previous !== null) {
        previous = await loadAnalytics(deps, input.range, windows.previous.end);
      }
    } catch (cause) {
      return { status: 'error', message: messageFrom(cause, 'Could not load channel data.') };
    }
    if (current.status === 'error') return { status: 'error', message: current.message };
    if (previous !== null && previous.status === 'error') {
      return { status: 'error', message: previous.message };
    }

    const window = current.view.window;
    const href = analyticsHref(input.range);
    const pick = (rows: ChannelRow[]): ChannelRow[] =>
      input.channel === null ? rows : rows.filter((row) => row.channel === input.channel);

    const channels = pick(current.view.channels);
    const previousView = previous?.view ?? null;
    const previousChannels = previousView === null ? null : pick(previousView.channels);

    const refs: MetricRef[] = [
      ...totalRefs(current.view.totals, href),
      ...channels.flatMap((row) => rowRefs(row, window, href)),
    ];
    if (previousView !== null && previousChannels !== null) {
      const previousHref = analyticsHref(input.range, previousView.window.end);
      refs.push(...totalRefs(previousView.totals, previousHref));
      refs.push(...previousChannels.flatMap((row) => rowRefs(row, previousView.window, previousHref)));
    }

    const comparisons: ChannelComparison[] =
      previousChannels === null
        ? []
        : channels.map((row) => {
            const before = previousChannels.find((candidate) => candidate.channel === row.channel);
            const compared = (
              metric: string,
              current: number | null,
              prior: number | null,
            ): ComparedMetric => ({
              ...compareValues(current, prior),
              currentRefId: refFor(window, row.channel, metric),
              previousRefId:
                previousView === null || before === undefined
                  ? null
                  : refFor(previousView.window, row.channel, metric),
            });
            return {
              channel: row.channel,
              sessions: compared('sessions', row.sessions, before?.sessions ?? null),
              orders: compared('orders', row.orders, before?.orders ?? null),
              revenueCents: compared('revenue', row.revenueCents, before?.revenueCents ?? null),
              conversionRate: compared('conversion_rate', row.conversionRate, before?.conversionRate ?? null),
            };
          });

    const gaps: Gap[] = [];
    if (input.compare && windows.gap !== null) {
      gaps.push({
        code: 'no-prior-window',
        message: `The data starts on ${DEMO_WINDOW.start}, so there is no complete ${input.range}-day period before ${window.start} to compare with. No change over time can be claimed.`,
      });
    }
    for (const row of channels) {
      if (row.sessions === 0) {
        gaps.push({ code: 'zero-sessions', message: `${row.channel} had no sessions between ${window.start} and ${window.end}; its rates are N/A.` });
      } else if (row.sessions < ANALYTICS_THRESHOLDS.minimumSessions) {
        gaps.push({
          code: 'below-minimum-sessions',
          message: `${row.channel} had ${row.sessions} sessions, below the ${ANALYTICS_THRESHOLDS.minimumSessions} this project needs before drawing a conclusion from its rates.`,
        });
      }
    }

    const rowsByChannel = new Map(channels.map((row) => [row.channel, row]));
    const findings: AgentFinding[] = analyticsRecommendations({
      channels,
      averageOrderValueCents: current.view.totals.averageOrderValueCents,
    }).map((item) => {
      const row = rowsByChannel.get(item.sourceEntityId as Channel);
      const channel = item.sourceEntityId as Channel;
      return {
        id: scopedId(item.id, { ...window, channel }),
        source: item.source,
        ruleId: item.ruleId,
        title: item.title,
        priority: item.priority,
        strength: evidenceStrength(
          { sessions: row?.sessions ?? 0, orders: row?.orders ?? 0 },
          {
            minimumSessions: ANALYTICS_THRESHOLDS.minimumSessions,
            minimumOrders: ANALYTICS_THRESHOLDS.minimumOrders,
          },
        ),
        affectedSessions: row?.sessions ?? null,
        observed: item.reason,
        howToVerify: item.suggestedAction,
        ruleVersion: item.ruleVersion,
        refIds: [
          ...(RULE_METRICS[item.ruleId] ?? []).map((metric) => refFor(window, channel, metric)),
          ...(RULE_SITE_METRICS[item.ruleId] ?? []).map((metric) =>
            refId({ tool: TOOL, window, channel: null, productId: null }, metric),
          ),
        ],
        href,
      };
    });

    const data: ChannelPerformanceData = {
      range: input.range,
      channel: input.channel,
      totals: current.view.totals,
      channels,
      previous:
        previousView === null || previousChannels === null
          ? null
          : { totals: previousView.totals, channels: previousChannels },
      comparisons,
    };
    const meta = {
      window,
      previousWindow: previousView?.window ?? null,
      dataSources: [TRAFFIC_SOURCE],
      refs,
      auditRefs: [],
      gaps,
    };

    return current.status === 'empty'
      ? { status: 'empty', data, meta, findings: [] }
      : { status: 'ok', data, meta, findings };
  },
};
