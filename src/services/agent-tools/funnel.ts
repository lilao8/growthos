import { z } from 'zod';
import { comparableWindows } from '@/domain/agent/windows';
import { compareValues } from '@/domain/agent/comparison';
import { funnelHref } from '@/domain/agent/links';
import { makeRef, refId, type MetricRef, type RefScope } from '@/domain/agent/refs';
import { DEMO_AS_OF, DEMO_WINDOW, type DateWindow, type DemoRangeDays } from '@/domain/demo-window';
import type { FunnelReport } from '@/domain/funnel/funnel-metrics';
import {
  DEFAULT_FUNNEL_CONFIG,
  type FunnelRecommendation,
} from '@/domain/funnel/recommendations';
import { funnelRecommendations as funnelTasks } from '@/domain/recommendations/aggregate';
import { ANALYTICS_THRESHOLDS } from '@/domain/recommendations/config';
import type { Channel } from '@/domain/types';
import { loadFunnel } from '@/services/funnel-service';
import { channelSchema, messageFrom, rangeSchema, scopedId, TRAFFIC_SOURCE } from './shared';
import type { AgentFinding, AgentTool, ComparedMetric, Gap, ToolOutcome } from './types';

/**
 * Conversion funnel, site-wide or for one channel.
 *
 * A channel funnel is the same `buildFunnel` over that channel's sessions, so
 * its layers use exactly the site's definition. There is deliberately no
 * product funnel: add-to-cart and checkout are recorded per session, not per
 * product, so any "funnel for this SKU" would be invented. Such a request is
 * refused with a pointer to the product conversion figures instead.
 */

export const funnelInput = z.strictObject({
  range: rangeSchema,
  channel: channelSchema,
  compare: z.boolean().default(true).describe('Also return the preceding window of the same length.'),
  productId: z
    .string()
    .optional()
    .describe('Not supported: funnel stages are not recorded per product. Use get_product_performance.'),
});

export type FunnelInput = z.infer<typeof funnelInput>;

export interface StageComparison {
  label: string;
  conversion: ComparedMetric;
}

export interface FunnelData {
  range: DemoRangeDays;
  channel: Channel | null;
  scope: 'site' | 'channel';
  report: FunnelReport;
  previous: FunnelReport | null;
  comparisons: StageComparison[];
  overallConversion: ComparedMetric | null;
}

const TOOL = 'funnel';

function reportRefs(report: FunnelReport, channel: Channel | null, href: string): MetricRef[] {
  const scope: RefScope = { tool: TOOL, window: report.window, channel, productId: null };
  const refs: MetricRef[] = report.stages.map((stage) =>
    makeRef(scope, `stage:${stage.stage}`, {
      label: `${stage.label} sessions`,
      value: stage.sessions,
      unit: 'count',
      definition: 'stage_sessions',
      href,
    }),
  );
  for (const transition of report.transitions) {
    const key = `${transition.from}->${transition.to}`;
    refs.push(
      makeRef(scope, `conversion:${key}`, {
        label: `${transition.label} conversion`,
        value: transition.conversion,
        unit: 'ratio',
        definition: 'stage_conversion',
        href,
      }),
      makeRef(scope, `drop_off:${key}`, {
        label: `${transition.label} drop-off`,
        value: transition.dropOffRate,
        unit: 'ratio',
        definition: 'drop_off_rate',
        href,
      }),
    );
  }
  refs.push(
    makeRef(scope, 'overall_conversion', {
      label: 'Overall funnel conversion',
      value: report.overallConversion,
      unit: 'ratio',
      definition: 'overall_funnel_conversion',
      href,
    }),
  );
  return refs;
}

function adviceByStep(advice: readonly FunnelRecommendation[]): Map<string, FunnelRecommendation> {
  const map = new Map<string, FunnelRecommendation>();
  for (const item of advice) {
    const key = `${item.from}->${item.to}`;
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

export const funnelTool: AgentTool<FunnelInput, FunnelData> = {
  name: 'get_funnel',
  description:
    'Session funnel (session → product view → add to cart → checkout → purchase) for the whole site or one channel, with stage conversion, drop-off and the largest loss, optionally against the preceding window. Not available per product. Read-only.',
  readOnly: true,
  input: funnelInput,
  async execute(input, context): Promise<ToolOutcome<FunnelData>> {
    if (input.productId !== undefined) {
      return {
        status: 'unsupported',
        reason:
          'Funnel stages are recorded per session, not per product, so a funnel for one product cannot be computed, and the site funnel cannot stand in for it.',
        suggestion:
          'Use get_product_performance for that product: view sessions, purchasing sessions and product conversion rate.',
      };
    }

    const windows = comparableWindows(input.range, DEMO_AS_OF, DEMO_WINDOW);
    const deps = { traffic: context.traffic };
    let current;
    let previous = null;
    try {
      current = await loadFunnel(deps, input.range, { channel: input.channel });
      if (input.compare && windows.previous !== null) {
        previous = await loadFunnel(deps, input.range, {
          channel: input.channel,
          end: windows.previous.end,
        });
      }
    } catch (cause) {
      return { status: 'error', message: messageFrom(cause, 'Could not load funnel data.') };
    }
    if (current.status === 'error') return { status: 'error', message: current.message };
    if (previous !== null && previous.status === 'error') {
      return { status: 'error', message: previous.message };
    }

    const report = current.view.report;
    const window: DateWindow = report.window;
    const href = funnelHref(input.range, input.channel);
    const previousReport = previous?.view.report ?? null;

    const refs = reportRefs(report, input.channel, href);
    if (previousReport !== null) {
      refs.push(
        ...reportRefs(
          previousReport,
          input.channel,
          funnelHref(input.range, input.channel, previousReport.window.end),
        ),
      );
    }

    const currentScope: RefScope = { tool: TOOL, window, channel: input.channel, productId: null };
    const previousScope: RefScope | null =
      previousReport === null
        ? null
        : { tool: TOOL, window: previousReport.window, channel: input.channel, productId: null };
    const compared = (metric: string, current: number | null, prior: number | null): ComparedMetric => ({
      ...compareValues(current, prior),
      currentRefId: refId(currentScope, metric),
      previousRefId: previousScope === null ? null : refId(previousScope, metric),
    });

    const comparisons: StageComparison[] =
      previousReport === null
        ? []
        : report.transitions.map((transition, index) => ({
            label: transition.label,
            conversion: compared(
              `conversion:${transition.from}->${transition.to}`,
              transition.conversion,
              previousReport.transitions[index]?.conversion ?? null,
            ),
          }));

    const gaps: Gap[] = [];
    if (input.compare && windows.gap !== null) {
      gaps.push({
        code: 'no-prior-window',
        message: `The data starts on ${DEMO_WINDOW.start}, so there is no complete ${input.range}-day period before ${window.start} to compare with.`,
      });
    }
    const scopeLabel = input.channel ?? 'the site';
    if (report.totalSessions === 0) {
      gaps.push({ code: 'zero-sessions', message: `No sessions for ${scopeLabel} between ${window.start} and ${window.end}; there is no funnel to describe.` });
    } else if (report.totalSessions < ANALYTICS_THRESHOLDS.minimumSessions) {
      gaps.push({
        code: 'below-minimum-sessions',
        message: `Only ${report.totalSessions} sessions for ${scopeLabel}; stage rates on a sample this small are indicative only.`,
      });
    }

    const advice = adviceByStep(current.view.recommendations);
    const candidates: AgentFinding[] = funnelTasks(current.view.recommendations).map((item) => {
      const step = advice.get(item.ruleId);
      return {
        id: scopedId(item.id, { ...window, channel: input.channel }),
        source: item.source,
        ruleId: item.ruleId,
        title: input.channel === null ? item.title : `${input.channel}: ${item.title}`,
        priority: item.priority,
        // The funnel engine flags a step whose entering sample is below that
        // step's own minimum. Below it the rate is not evidence for a
        // conclusion, so the step is insufficient, not merely limited.
        strength: step?.confidence === 'low' ? 'insufficient' : 'sufficient',
        affectedSessions: step?.sampleSessions ?? null,
        observed: item.reason,
        howToVerify: item.suggestedAction,
        ruleVersion: item.ruleVersion,
        refIds: [
          refId(currentScope, `conversion:${item.ruleId}`),
          refId(currentScope, `drop_off:${item.ruleId}`),
          refId(currentScope, `stage:${step?.from ?? ''}`),
        ],
        href,
      };
    });

    // Insufficient steps keep their numbers (as refs) but leave the findings:
    // they become data gaps, so nothing downstream can rank them.
    const findings = candidates.filter((finding) => finding.strength !== 'insufficient');
    for (const finding of candidates) {
      if (finding.strength !== 'insufficient') continue;
      const step = advice.get(finding.ruleId);
      const minimum = DEFAULT_FUNNEL_CONFIG.thresholds[finding.ruleId]?.minimumSessions;
      gaps.push({
        code: 'below-minimum-sessions',
        message: `${step?.transitionLabel ?? finding.ruleId}${input.channel === null ? '' : ` (${input.channel})`}: only ${step?.sampleSessions ?? 0} sessions entered this step, below the ${minimum ?? 'configured'} this project needs before reading its rate. The figures are reported, but no conclusion is drawn from them; a longer window or more traffic would be needed to check it.`,
        refIds: finding.refIds,
      });
    }

    const data: FunnelData = {
      range: input.range,
      channel: input.channel,
      scope: input.channel === null ? 'site' : 'channel',
      report,
      previous: previousReport,
      comparisons,
      overallConversion:
        previousReport === null
          ? null
          : compared('overall_conversion', report.overallConversion, previousReport.overallConversion),
    };
    const meta = {
      window,
      previousWindow: previousReport?.window ?? null,
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
