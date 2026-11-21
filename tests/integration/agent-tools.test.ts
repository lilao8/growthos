import { describe, expect, it } from 'vitest';
import { AGENT_TOOLS, AGENT_TOOL_NAMES, runTool, type RunToolOutcome } from '@/services/agent-tools/registry';
import type { ToolContext, ToolOutcome } from '@/services/agent-tools/types';
import type { ChannelPerformanceData } from '@/services/agent-tools/channels';
import type { FunnelData } from '@/services/agent-tools/funnel';
import type { ProductPerformanceData } from '@/services/agent-tools/products';
import type { AuditFindingsData } from '@/services/agent-tools/audits';
import { parseLocalState, MAX_LOCAL_STATE_BYTES } from '@/services/agent-tools/local-state';
import { loadAnalytics } from '@/services/analytics-service';
import { runSeoAuditForAllPages } from '@/services/seo-audit-service';
import { runGeoAuditForAllPages } from '@/services/geo-audit-service';
import { saveProductSeo } from '@/services/product-service';
import {
  createEmptyTrafficRepository,
  createFailingTrafficRepository,
  createFixtureTrafficRepository,
} from '@/repositories/traffic-repository';
import { createMemoryStateRepository } from '@/repositories/memory-state-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { CHANNELS } from '@/domain/types';
import { DEFAULT_FUNNEL_CONFIG } from '@/domain/funnel/recommendations';
import { rankFindings } from '@/domain/agent/priority';
import type { DemoState } from '@/repositories/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';

/**
 * The four agent tools over the real fixture: agreement with the pages'
 * services, comparison windows, scope, gaps, failure handling and the
 * read-only guarantee.
 */

const NOW = '2026-09-01T00:00:00.000Z';

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    traffic: createFixtureTrafficRepository(),
    state: { source: 'seed', value: buildDemoSeedState() },
    now: () => NOW,
    ...overrides,
  };
}

function ok<D>(outcome: RunToolOutcome): Extract<ToolOutcome<D>, { status: 'ok' }> {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome).slice(0, 300)}`);
  }
  return outcome as Extract<ToolOutcome<D>, { status: 'ok' }>;
}

function nonFiniteNumbers(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => nonFiniteNumbers(item, `${path}[${index}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => nonFiniteNumbers(item, `${path}.${key}`));
  }
  return [];
}

function expectRefsResolve(outcome: { meta: { refs: { refId: string }[]; auditRefs: { refId: string }[] }; findings: { refIds: string[] }[] }): void {
  const known = new Set([...outcome.meta.refs.map((r) => r.refId), ...outcome.meta.auditRefs.map((r) => r.refId)]);
  expect(known.size).toBe(outcome.meta.refs.length + outcome.meta.auditRefs.length);
  for (const finding of outcome.findings) {
    expect(finding.refIds.length).toBeGreaterThan(0);
    for (const id of finding.refIds) expect(known, `${id} is cited but not returned`).toContain(id);
  }
}

/** Succeeds on every call except the nth, so the previous window alone can fail. */
function failingOnCall(n: number): TrafficRepository {
  const inner = createFixtureTrafficRepository();
  let calls = 0;
  return {
    async load() {
      calls += 1;
      if (calls === n) throw new Error('previous source down');
      return inner.load();
    },
  };
}

describe('registry', () => {
  it('exposes exactly the four read-only tools', () => {
    expect(AGENT_TOOL_NAMES).toEqual([
      'get_channel_performance',
      'get_funnel',
      'get_product_performance',
      'get_audit_findings',
    ]);
    for (const tool of AGENT_TOOLS) expect(tool.readOnly).toBe(true);
  });

  it('reports an unknown tool, including one that would write', async () => {
    expect(await runTool('mark_recommendation_done', { id: 'x' }, context())).toEqual({
      status: 'unknown-tool',
      name: 'mark_recommendation_done',
    });
  });

  it.each(AGENT_TOOL_NAMES)('%s rejects an unknown field instead of silently dropping it', async (name) => {
    const outcome = await runTool(name, { sku: 'NT-TENT-RDG2' }, context());
    expect(outcome.status).toBe('invalid-input');
    if (outcome.status === 'invalid-input') expect(outcome.issues.join(' ')).toContain('sku');
  });

  it('rejects input outside the schema instead of guessing', async () => {
    const outcome = await runTool('get_channel_performance', { range: 14 }, context());
    expect(outcome.status).toBe('invalid-input');
    const channel = await runTool('get_funnel', { channel: 'Organic search' }, context());
    expect(channel.status).toBe('invalid-input');
  });

  it.each(AGENT_TOOL_NAMES)('%s turns a failing data source into an error outcome', async (name) => {
    const outcome = await runTool(name, {}, context({ traffic: createFailingTrafficRepository('source down') }));
    expect(outcome).toEqual({ status: 'error', message: 'source down' });
  });

  it.each(AGENT_TOOL_NAMES)('%s leaves the provided state exactly as it was', async (name) => {
    const value = buildDemoSeedState();
    const before = structuredClone(value);
    await runTool(name, {}, context({ state: { source: 'browser-local', value } }));
    expect(value).toEqual(before);
  });
});

describe('get_channel_performance', () => {
  it('returns the same channel rows as the Analytics page for the same range', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { range: 30 }, context()));
    const page = await loadAnalytics({ traffic: createFixtureTrafficRepository() }, 30);
    if (page.status !== 'ready') throw new Error('expected ready');
    expect(outcome.data.channels).toEqual(page.view.channels);
    expect(outcome.data.totals).toEqual(page.view.totals);
    expect(outcome.meta.window).toEqual({ start: '2026-08-02', end: '2026-08-31', days: 30 });
  });

  it('compares with the 30 days before, and the previous figures match the page opened at that end date', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    expect(outcome.meta.previousWindow).toEqual({ start: '2026-07-03', end: '2026-08-01', days: 30 });
    const page = await loadAnalytics({ traffic: createFixtureTrafficRepository() }, 30, '2026-08-01');
    if (page.status !== 'ready') throw new Error('expected ready');
    expect(outcome.data.previous?.channels).toEqual(page.view.channels);
    const organic = outcome.data.comparisons.find((row) => row.channel === 'Organic Search');
    const before = page.view.channels.find((row) => row.channel === 'Organic Search');
    expect(organic?.conversionRate.previous).toBe(before?.conversionRate);
    const previousRef = outcome.meta.refs.find((ref) => ref.window.end === '2026-08-01');
    expect(previousRef?.href).toBe('/analytics?range=30&end=2026-08-01');
  });

  it('refuses to compare the 90-day window, and says why', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { range: 90 }, context()));
    expect(outcome.data.previous).toBeNull();
    expect(outcome.data.comparisons).toEqual([]);
    expect(outcome.meta.previousWindow).toBeNull();
    expect(outcome.meta.gaps.map((gap) => gap.code)).toContain('no-prior-window');
  });

  it('narrows to one channel and keeps site totals for context', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { channel: 'Organic Search' }, context()));
    expect(outcome.data.channels.map((row) => row.channel)).toEqual(['Organic Search']);
    expect(outcome.data.comparisons.map((row) => row.channel)).toEqual(['Organic Search']);
    expect(outcome.meta.refs.every((ref) => ref.channel === null || ref.channel === 'Organic Search')).toBe(true);
  });

  it('flags channels below the session floor as gaps rather than findings', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    const thin = outcome.data.channels.filter((row) => row.sessions > 0 && row.sessions < 300).map((row) => row.channel);
    expect(thin.length).toBeGreaterThan(0);
    for (const channel of thin) {
      expect(outcome.meta.gaps.some((gap) => gap.code === 'below-minimum-sessions' && gap.message.startsWith(channel))).toBe(true);
      expect(outcome.findings.some((finding) => finding.title.startsWith(`${channel}:`))).toBe(false);
    }
  });

  it('marks findings on few orders as limited evidence, and every cited ref exists', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    expect(outcome.findings.length).toBeGreaterThan(0);
    for (const finding of outcome.findings) {
      const row = outcome.data.channels.find((candidate) => finding.title.startsWith(`${candidate.channel}:`));
      expect(finding.strength).toBe((row?.orders ?? 0) < 25 ? 'limited' : 'sufficient');
      expect(finding.href).toBe('/analytics?range=30');
    }
    expectRefsResolve(outcome);
  });

  it('cites the site AOV that the CAC rule compares against', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    const cac = outcome.findings.filter((finding) => finding.ruleId === 'cac-above-aov-share');
    expect(cac.length).toBeGreaterThan(0);
    const aov = outcome.meta.refs.find((ref) => ref.refId === 'channels:2026-08-02..2026-08-31:all:all:average_order_value');
    expect(aov?.value).toBe(outcome.data.totals.averageOrderValueCents);
    for (const finding of cac) expect(finding.refIds).toContain(aov?.refId);
    const roas = outcome.findings.filter((finding) => finding.ruleId === 'roas-below-target');
    for (const finding of roas) expect(finding.refIds.some((id) => id.endsWith(':ad_spend'))).toBe(true);
  });

  it('cites both sides of every comparison, each resolving to a returned ref', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    const byId = new Map(outcome.meta.refs.map((ref) => [ref.refId, ref]));
    expect(outcome.data.comparisons.length).toBeGreaterThan(0);
    for (const row of outcome.data.comparisons) {
      for (const metric of [row.sessions, row.orders, row.revenueCents, row.conversionRate]) {
        expect(byId.get(metric.currentRefId)?.value).toBe(metric.current);
        expect(metric.previousRefId).not.toBeNull();
        const previous = byId.get(metric.previousRefId ?? '');
        expect(previous?.value).toBe(metric.previous);
        expect(previous?.window.end).toBe('2026-08-01');
      }
    }
  });

  it('marks each channel comparison as supporting a conclusion only when both periods meet the floors', async () => {
    const outcome = ok<ChannelPerformanceData>(await runTool('get_channel_performance', {}, context()));
    const previous = outcome.data.previous?.channels ?? [];
    const verdicts = outcome.data.comparisons.map((row) => {
      const current = outcome.data.channels.find((candidate) => candidate.channel === row.channel);
      const before = previous.find((candidate) => candidate.channel === row.channel);
      const expected = (current?.sessions ?? 0) >= 300 && (before?.sessions ?? 0) >= 300;
      for (const metric of [row.sessions, row.orders, row.revenueCents, row.conversionRate]) {
        expect(metric.evidence.supportsConclusion).toBe(expected);
        expect(metric.evidence.currentSample).toEqual({ sessions: current?.sessions, orders: current?.orders });
        expect(metric.evidence.previousSample).toEqual({ sessions: before?.sessions, orders: before?.orders });
      }
      return expected;
    });
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
    const email = outcome.data.comparisons.find((row) => row.channel === 'Email');
    expect(email?.conversionRate.evidence.supportsConclusion).toBe(false);
  });

  it('keeps the current figures when only the previous window fails', async () => {
    const normal = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { compare: false }, context()));
    const outcome = ok<ChannelPerformanceData>(
      await runTool('get_channel_performance', {}, context({ traffic: failingOnCall(2) })),
    );
    expect(outcome.data.channels).toEqual(normal.data.channels);
    expect(outcome.data.previous).toBeNull();
    expect(outcome.data.comparisons).toEqual([]);
    expect(outcome.meta.previousWindow).toBeNull();
    const gap = outcome.meta.gaps.find((candidate) => candidate.code === 'previous-window-unavailable');
    expect(gap?.message).toContain('previous source down');
    expect(outcome.findings.length).toBe(normal.findings.length);
  });

  it('reports an empty data set as empty, with N/A rates and no NaN or Infinity', async () => {
    const outcome = await runTool('get_channel_performance', {}, context({ traffic: createEmptyTrafficRepository() }));
    expect(outcome.status).toBe('empty');
    if (outcome.status !== 'empty') return;
    const data = outcome.data as ChannelPerformanceData;
    expect(data.channels.every((row) => row.conversionRate === null)).toBe(true);
    expect(outcome.meta.gaps.filter((gap) => gap.code === 'zero-sessions')).toHaveLength(CHANNELS.length);
    expect(nonFiniteNumbers(outcome)).toEqual([]);
    expect(outcome.findings).toEqual([]);
  });
});

describe('get_funnel', () => {
  it('uses the site definition per channel: channel layers add up to the site', async () => {
    const site = ok<FunnelData>(await runTool('get_funnel', { compare: false }, context()));
    const channelRows = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { compare: false }, context())).data.channels;

    const layerSums = site.data.report.stages.map(() => 0);
    for (const channel of CHANNELS) {
      const funnel = ok<FunnelData>(await runTool('get_funnel', { channel, compare: false }, context()));
      expect(funnel.data.scope).toBe('channel');
      const row = channelRows.find((candidate) => candidate.channel === channel);
      expect(funnel.data.report.totalSessions).toBe(row?.sessions);
      expect(funnel.data.report.purchaseSessions).toBe(row?.orders);
      funnel.data.report.stages.forEach((stage, index) => {
        layerSums[index] = (layerSums[index] ?? 0) + stage.sessions;
      });
    }
    expect(layerSums).toEqual(site.data.report.stages.map((stage) => stage.sessions));
    expect(site.data.scope).toBe('site');
  });

  it('refuses a product funnel and points at product conversion instead', async () => {
    const outcome = await runTool('get_funnel', { productId: 'prd_ridgeline_2p_tent' }, context());
    expect(outcome.status).toBe('unsupported');
    if (outcome.status === 'unsupported') expect(outcome.suggestion).toContain('get_product_performance');
  });

  it('compares stage conversion with the previous window and links to it', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', { channel: 'Organic Search' }, context()));
    expect(outcome.data.previous?.window).toEqual({ start: '2026-07-03', end: '2026-08-01', days: 30 });
    expect(outcome.data.comparisons).toHaveLength(4);
    expect(outcome.meta.refs.some((ref) => ref.href === '/funnel?range=30&channel=Organic+Search&end=2026-08-01')).toBe(true);
    expect(outcome.meta.refs.some((ref) => ref.href === '/funnel?range=30&channel=Organic+Search')).toBe(true);
  });

  it('scopes finding ids by channel, so site and channel findings never collide', async () => {
    const site = ok<FunnelData>(await runTool('get_funnel', {}, context()));
    const organic = ok<FunnelData>(await runTool('get_funnel', { channel: 'Organic Search' }, context()));
    const siteIds = new Set(site.findings.map((finding) => finding.id));
    expect(organic.findings.length).toBeGreaterThan(0);
    for (const finding of organic.findings) expect(siteIds.has(finding.id)).toBe(false);
    expectRefsResolve(site);
    expectRefsResolve(organic);
  });

  it('cites both sides of each stage comparison', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', {}, context()));
    const byId = new Map(outcome.meta.refs.map((ref) => [ref.refId, ref]));
    for (const row of outcome.data.comparisons) {
      expect(byId.get(row.conversion.currentRefId)?.value).toBe(row.conversion.current);
      expect(byId.get(row.conversion.previousRefId ?? '')?.value).toBe(row.conversion.previous);
    }
    const overall = outcome.data.overallConversion;
    expect(byId.get(overall?.currentRefId ?? '')?.value).toBe(overall?.current);
    expect(byId.get(overall?.previousRefId ?? '')?.value).toBe(overall?.previous);
  });

  it('marks a thin stage comparison as unable to support a conclusion, keeping its raw figures', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', { channel: 'AI Referral' }, context()));
    const checkout = outcome.data.comparisons.find((row) => row.label === 'Checkout → Purchase');
    const now = outcome.data.report.transitions.find((t) => t.from === 'checkout');
    const before = outcome.data.previous?.transitions.find((t) => t.from === 'checkout');
    expect(now?.fromSessions).toBeLessThan(60);
    expect(before?.fromSessions).toBeLessThan(60);
    // The arithmetic is still reported…
    expect(checkout?.conversion.direction).not.toBe('unknown');
    expect(checkout?.conversion.previousRefId).not.toBeNull();
    // …but it is flagged as not evidence of a change.
    expect(checkout?.conversion.evidence).toEqual({
      strength: 'insufficient',
      supportsConclusion: false,
      currentSample: { sessions: now?.fromSessions, orders: null },
      previousSample: { sessions: before?.fromSessions, orders: null },
      thresholds: { minimumSessions: 60, minimumOrders: null },
    });
  });

  it('lets a stage comparison support a conclusion when both periods meet the stage minimum', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', {}, context()));
    for (const row of outcome.data.comparisons) {
      const now = outcome.data.report.transitions.find((t) => t.label === row.label);
      const before = outcome.data.previous?.transitions.find((t) => t.label === row.label);
      const minimum = DEFAULT_FUNNEL_CONFIG.thresholds[`${now?.from}->${now?.to}`]?.minimumSessions ?? 0;
      expect(row.conversion.evidence.supportsConclusion).toBe(
        (now?.fromSessions ?? 0) >= minimum && (before?.fromSessions ?? 0) >= minimum,
      );
    }
    expect(outcome.data.comparisons.some((row) => row.conversion.evidence.supportsConclusion)).toBe(true);
    expect(outcome.data.overallConversion?.evidence.supportsConclusion).toBe(true);
  });

  it('keeps the current funnel when only the previous window fails', async () => {
    const normal = ok<FunnelData>(await runTool('get_funnel', { compare: false }, context()));
    const outcome = ok<FunnelData>(await runTool('get_funnel', {}, context({ traffic: failingOnCall(2) })));
    expect(outcome.data.report).toEqual(normal.data.report);
    expect(outcome.data.previous).toBeNull();
    expect(outcome.data.overallConversion).toBeNull();
    expect(outcome.meta.gaps.map((gap) => gap.code)).toContain('previous-window-unavailable');
  });

  it('turns steps below their sample minimum into gaps, never findings', async () => {
    const outcome = await runTool('get_funnel', { channel: 'AI Referral' }, context());
    if (outcome.status !== 'ok' && outcome.status !== 'empty') throw new Error(outcome.status);
    const data = outcome.data as FunnelData;
    const thin = data.report.transitions.filter((transition) => {
      const minimum = DEFAULT_FUNNEL_CONFIG.thresholds[`${transition.from}->${transition.to}`]?.minimumSessions ?? 0;
      return transition.fromSessions < minimum;
    });
    expect(thin.length).toBeGreaterThan(0);
    const checkout = thin.find((transition) => transition.from === 'checkout');
    expect(checkout).toBeDefined();

    for (const transition of thin) {
      const key = `${transition.from}->${transition.to}`;
      expect(outcome.findings.some((finding) => finding.ruleId === key)).toBe(false);
    }
    expect(outcome.findings.every((finding) => finding.strength === 'sufficient')).toBe(true);
    expect(rankFindings(outcome.findings).ranked.some((r) => r.finding.ruleId === 'checkout->purchase')).toBe(false);

    const known = new Set(outcome.meta.refs.map((ref) => ref.refId));
    const stepGaps = outcome.meta.gaps.filter((gap) => gap.code === 'below-minimum-sessions' && gap.refIds !== undefined);
    expect(stepGaps.length).toBeGreaterThan(0);
    const checkoutGap = stepGaps.find((gap) => gap.message.startsWith('Checkout → Purchase'));
    expect(checkoutGap?.message).toContain(`only ${checkout?.fromSessions} sessions`);
    for (const gap of stepGaps) for (const id of gap.refIds ?? []) expect(known).toContain(id);
  });

  it('keeps a step above its minimum as a finding on the site funnel', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', {}, context()));
    expect(outcome.findings.some((finding) => finding.ruleId === 'checkout->purchase')).toBe(true);
  });

  it('marks a small channel funnel as indicative', async () => {
    const outcome = ok<FunnelData>(await runTool('get_funnel', { channel: 'AI Referral' }, context()));
    expect(outcome.meta.gaps.map((gap) => gap.code)).toContain('below-minimum-sessions');
  });
});

describe('get_product_performance', () => {
  it('looks up by SKU case-insensitively and reports unknown SKUs', async () => {
    const outcome = ok<ProductPerformanceData>(
      await runTool('get_product_performance', { products: ['nt-tent-rdg2', 'NT-999'] }, context()),
    );
    expect(outcome.data.rows.map((row) => row.productId)).toEqual(['prd_ridgeline_2p_tent']);
    expect(outcome.data.notFound).toEqual(['NT-999']);
    expect(outcome.meta.gaps.some((gap) => gap.code === 'product-not-found' && gap.message.includes('NT-999'))).toBe(true);
    const purchases = outcome.meta.refs.find((ref) => ref.refId.endsWith(':purchase_sessions'));
    expect(purchases?.definition).toBe('product_purchase_sessions');
    expect(purchases?.unit).toBe('count');
  });

  it('is empty, not an error, when nothing matches', async () => {
    const outcome = await runTool('get_product_performance', { products: ['NT-999'] }, context());
    expect(outcome.status).toBe('empty');
  });

  it('matches a text query', async () => {
    const outcome = ok<ProductPerformanceData>(await runTool('get_product_performance', { query: 'tent' }, context()));
    expect(outcome.data.rows.length).toBeGreaterThan(0);
    expect(outcome.data.rows.every((row) => /tent/i.test(`${row.title} ${row.sku}`))).toBe(true);
  });

  it('apportions revenue so every product adds up to site revenue', async () => {
    const products = ok<ProductPerformanceData>(await runTool('get_product_performance', { limit: 20 }, context()));
    const channels = ok<ChannelPerformanceData>(await runTool('get_channel_performance', { compare: false }, context()));
    const sum = products.data.rows.reduce((total, row) => total + row.metrics.revenueCents, 0);
    expect(sum).toBe(channels.data.totals.revenueCents);
  });

  it('narrows by channel on the same definition: Organic view sessions equal the organic column', async () => {
    const all = ok<ProductPerformanceData>(await runTool('get_product_performance', { limit: 20 }, context()));
    const organic = ok<ProductPerformanceData>(
      await runTool('get_product_performance', { limit: 20, channel: 'Organic Search' }, context()),
    );
    for (const row of organic.data.rows) {
      const unfiltered = all.data.rows.find((candidate) => candidate.productId === row.productId);
      expect(row.metrics.viewSessions).toBe(unfiltered?.metrics.organicSessions);
    }
    expect(organic.meta.refs[0]?.href).toMatch(/^\/products\/[^?]+\?range=30&channel=Organic\+Search$/);
  });

  it('reports a product with no views as a zero-sample gap with N/A conversion', async () => {
    const outcome = ok<ProductPerformanceData>(await runTool('get_product_performance', { range: 7, limit: 20, channel: 'AI Referral' }, context()));
    const unseen = outcome.data.rows.filter((row) => row.metrics.viewSessions === 0);
    expect(unseen.length).toBeGreaterThan(0);
    for (const row of unseen) {
      expect(row.metrics.conversionRate).toBeNull();
      expect(outcome.meta.gaps.some((gap) => gap.code === 'zero-sessions' && gap.message.includes(row.sku))).toBe(true);
    }
    expect(nonFiniteNumbers(outcome)).toEqual([]);
  });

  it('needs a catalogue', async () => {
    const outcome = await runTool('get_product_performance', {}, context({ state: null }));
    expect(outcome.status).toBe('error');
  });
});

describe('get_audit_findings', () => {
  async function auditedState(): Promise<{ state: DemoState; repository: ReturnType<typeof createMemoryStateRepository> }> {
    const repository = createMemoryStateRepository(buildDemoSeedState());
    await runSeoAuditForAllPages({ state: repository, now: () => NOW });
    await runGeoAuditForAllPages({ state: repository, now: () => NOW });
    return { state: (await repository.load()).state, repository };
  }

  it('computes on request when this browser has never audited, and labels it', async () => {
    const outcome = ok<AuditFindingsData>(await runTool('get_audit_findings', {}, context()));
    expect(outcome.data.pages).toHaveLength(34);
    expect(outcome.data.pages.every((page) => page.origin === 'computed-on-request' && page.computedBecause === 'not-audited')).toBe(true);
    expect(outcome.data.pages.every((page) => page.href.endsWith('?preview=1'))).toBe(true);
    expect(outcome.data.priorityWindow).toEqual(outcome.meta.window);
    expect(outcome.meta.gaps.map((gap) => gap.code)).toContain('not-audited');
    expect(outcome.meta.dataSources).toContain('seed:page-snapshots');
  });

  it('gives the same checks the audit page shows after running the audit there', async () => {
    const computed = ok<AuditFindingsData>(await runTool('get_audit_findings', {}, context()));
    const { state } = await auditedState();
    const stored = ok<AuditFindingsData>(
      await runTool('get_audit_findings', {}, context({ state: { source: 'browser-local', value: state } })),
    );
    expect(stored.data.pages.every((page) => page.origin === 'stored')).toBe(true);
    expect(stored.meta.gaps.map((gap) => gap.code)).not.toContain('not-audited');
    const strip = (refs: typeof stored.meta.auditRefs) =>
      refs.map((ref) => ({ ...ref, origin: 'ignored' }));
    expect(strip(stored.meta.auditRefs)).toEqual(strip(computed.meta.auditRefs));
    expect(stored.data.pages.map((page) => page.score)).toEqual(computed.data.pages.map((page) => page.score));
    expect(stored.meta.dataSources).toContain('browser-local:audit-results');
  });

  it("uses the visitor's edits: an edited page is recomputed as stale and reflects the edit", async () => {
    const { repository } = await auditedState();
    const product = 'prd_ridgeline_2p_tent';
    const saved = await saveProductSeo(
      { state: repository, traffic: createFixtureTrafficRepository() },
      product,
      { primaryKeyword: 'ultralight two person tent', metaTitle: 'Ridgeline 2P', metaDescription: 'Short.' },
    );
    expect(saved.status).toBe('saved');
    const state = (await repository.load()).state;

    const outcome = ok<AuditFindingsData>(
      await runTool('get_audit_findings', { kind: 'seo', products: [product] }, context({ state: { source: 'browser-local', value: state } })),
    );
    const page = outcome.data.pages[0];
    expect(outcome.data.pages).toHaveLength(1);
    expect(page?.origin).toBe('computed-on-request');
    expect(page?.computedBecause).toBe('stale');
    const titleLength = outcome.meta.auditRefs.find((ref) => ref.ruleId === 'meta-title-length');
    expect(titleLength?.evidence).toContain('12');
  });

  it('filters by severity and by product, and reports unknown products', async () => {
    const outcome = ok<AuditFindingsData>(
      await runTool('get_audit_findings', { products: ['NT-TENT-TARP1', 'NT-999'], minSeverity: 'high' }, context()),
    );
    expect(new Set(outcome.data.pages.map((page) => page.productId))).toEqual(new Set(['prd_basecamp_tarp']));
    expect(outcome.data.notFound).toEqual(['NT-999']);
    expect(outcome.meta.auditRefs.length).toBeGreaterThan(0);
    expect(outcome.meta.auditRefs.every((ref) => ref.severity === 'critical' || ref.severity === 'high')).toBe(true);
    expectRefsResolve(outcome);
  });

  it('needs page snapshots', async () => {
    expect((await runTool('get_audit_findings', {}, context({ state: null }))).status).toBe('error');
  });
});

describe('parseLocalState', () => {
  it('accepts a valid persisted state', () => {
    const state = buildDemoSeedState();
    const result = parseLocalState(state, JSON.stringify(state).length);
    expect(result.ok).toBe(true);
  });

  it('rejects a different schema version rather than falling back', () => {
    const state = { ...buildDemoSeedState(), schemaVersion: 6 };
    const result = parseLocalState(state, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('schemaVersion');
  });

  it('rejects garbage and oversized payloads', () => {
    expect(parseLocalState('nope', 4).ok).toBe(false);
    expect(parseLocalState(buildDemoSeedState(), MAX_LOCAL_STATE_BYTES + 1).ok).toBe(false);
  });
});
