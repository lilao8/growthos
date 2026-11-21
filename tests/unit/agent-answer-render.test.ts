import { describe, expect, it } from 'vitest';
import type { AnswerContext, CitableRef, KnownFinding } from '@/domain/agent/answer';
import { fallbackAnswer, formatValue, renderAnswer, renderFact, renderProse } from '@/domain/agent/answer-render';

function known(id: string, overrides: Partial<KnownFinding> = {}): KnownFinding {
  return {
    id,
    title: `Title ${id}`,
    priority: 'High',
    strength: 'sufficient',
    affectedSessions: 100,
    observed: `Engine says ${id}`,
    howToVerify: `Check ${id}`,
    refIds: [],
    href: `/page/${id}`,
    scope: { channel: 'Organic Search', productId: null },
    ...overrides,
  };
}

const CVR = 'channels:2026-08-02..2026-08-31:Organic Search:all:conversion_rate';
const CVR_PREV = 'channels:2026-07-03..2026-08-01:Organic Search:all:conversion_rate';
const ORDERS = 'channels:2026-08-02..2026-08-31:Organic Search:all:orders';

function ref(refId: string, overrides: Partial<CitableRef>): CitableRef {
  return { refId, label: refId, value: 0, unit: 'count', channel: 'Organic Search', productId: null, window: { start: '2026-08-02', end: '2026-08-31' }, funnel: false, href: '/analytics?range=30', ...overrides };
}

function context(findings: KnownFinding[] = [], overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    refs: new Map([
      [CVR, ref(CVR, { label: 'Organic Search conversion rate', value: 0.25, unit: 'ratio' })],
      [CVR_PREV, ref(CVR_PREV, { label: 'Organic Search conversion rate', value: 0.4, unit: 'ratio', window: { start: '2026-07-03', end: '2026-08-01' }, href: '/analytics?range=30&end=2026-08-01' })],
      [ORDERS, ref(ORDERS, { label: 'Organic Search orders', value: 1234 })],
    ]),
    comparisons: new Map([
      [CVR, { currentRefId: CVR, previousRefId: CVR_PREV, current: 0.25, previous: 0.4, relativeChange: -0.375, direction: 'down', supportsConclusion: true }],
    ]),
    audits: new Map([['aud', { refId: 'aud', ruleId: 'h1', status: 'error', evidence: '0 H1 elements', productId: 'prd_a', pageLabel: 'Ridgeline 2P Backpacking Tent', href: '/seo/snap_a?preview=1' }]]),
    findings: new Map(findings.map((finding) => [finding.id, finding])),
    products: new Map([['prd_a', 'Ridgeline 2P Backpacking Tent']]),
    figuresWithoutFindings: [],
    ...overrides,
  };
}

const text = (segments: { text: string }[]) => segments.map((segment) => segment.text).join('');

describe('formatValue', () => {
  it('formats each unit the way the pages do', () => {
    expect(formatValue(1234, 'count')).toBe('1,234');
    expect(formatValue(0.0054, 'ratio')).toBe('0.54%');
    expect(formatValue(12345, 'cents')).toBe('$123.45');
    expect(formatValue(2.5, 'multiple')).toBe('2.50x');
    expect(formatValue(null, 'ratio')).toBe('N/A');
  });
});

describe('renderFact', () => {
  it('writes a value fact with its metric, channel and dates, and links the figure', () => {
    const segments = renderFact({ kind: 'value', refId: ORDERS }, context());
    expect(text(segments)).toBe('Organic Search orders, 2026-08-02 — 2026-08-31: 1,234');
    expect(segments).toEqual([
      { kind: 'text', text: 'Organic Search orders, 2026-08-02 — 2026-08-31: ' },
      { kind: 'link', text: '1,234', href: '/analytics?range=30', title: 'Organic Search orders, 2026-08-02 — 2026-08-31' },
    ]);
  });

  it('makes the channel scope explicit when the metric label does not carry it', () => {
    const funnel = 'funnel:2026-08-02..2026-08-31:Meta:all:conversion:checkout->purchase';
    const site = 'channels:2026-08-02..2026-08-31:all:all:sessions';
    const product = 'products:2026-08-02..2026-08-31:all:prd_a:view_sessions';
    const ctx = context([], {
      refs: new Map([
        [funnel, ref(funnel, { label: 'Checkout → Purchase conversion', channel: 'Meta', unit: 'ratio', value: 0.25, funnel: true })],
        [site, ref(site, { label: 'Site sessions', channel: null, value: 10 })],
        [product, ref(product, { label: 'Ridgeline 2P view sessions', channel: null, productId: 'prd_a', value: 5 })],
      ]),
    });
    expect(text(renderFact({ kind: 'value', refId: funnel }, ctx))).toBe('Checkout → Purchase conversion (Meta), 2026-08-02 — 2026-08-31: 25.00%');
    expect(text(renderFact({ kind: 'value', refId: site }, ctx))).toBe('Site sessions (all channels), 2026-08-02 — 2026-08-31: 10');
    expect(text(renderFact({ kind: 'value', refId: product }, ctx))).toBe('Ridgeline 2P view sessions (all channels), 2026-08-02 — 2026-08-31: 5');
  });

  it('labels a site figure inside a channel finding as a site-wide benchmark', () => {
    const site = 'channels:2026-08-02..2026-08-31:all:all:average_order_value';
    const funnel = 'funnel:2026-08-02..2026-08-31:all:all:stage:session';
    const ctx = context([], {
      refs: new Map([
        [site, ref(site, { label: 'Site average order value', channel: null, unit: 'cents', value: 17731 })],
        [funnel, ref(funnel, { label: 'Sessions sessions', channel: null, funnel: true, value: 9 })],
      ]),
    });
    const meta = { channel: 'Meta', productId: null };
    expect(text(renderFact({ kind: 'value', refId: site }, ctx, meta))).toBe('Site average order value (site-wide benchmark), 2026-08-02 — 2026-08-31: $177.31');
    expect(text(renderFact({ kind: 'value', refId: site }, ctx))).toBe('Site average order value (all channels), 2026-08-02 — 2026-08-31: $177.31');
    expect(text(renderFact({ kind: 'value', refId: site }, ctx, { channel: null, productId: null }))).toContain('(all channels)');
    expect(text(renderFact({ kind: 'value', refId: funnel }, ctx, meta))).toContain('(all channels)');
  });

  it('writes a change with both periods, each linked to its own window', () => {
    const segments = renderFact({ kind: 'change', refId: CVR, direction: 'down' }, context());
    expect(text(segments)).toBe(
      'Organic Search conversion rate: 40.00% (2026-07-03 — 2026-08-01) → 25.00% (2026-08-02 — 2026-08-31), −37.5%',
    );
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'link', 'text', 'link', 'text']);
    const links = segments.filter((segment) => segment.kind === 'link');
    expect(links.map((link) => (link.kind === 'link' ? link.href : ''))).toEqual([
      '/analytics?range=30&end=2026-08-01',
      '/analytics?range=30',
    ]);
  });

  it('signs a rise and a flat change, and omits the relative part when there is none', () => {
    const base = context();
    const comparisons = new Map(base.comparisons);
    const cvr = comparisons.get(CVR)!;
    comparisons.set(CVR, { ...cvr, relativeChange: 0.25 });
    expect(text(renderFact({ kind: 'change', refId: CVR, direction: 'up' }, { ...base, comparisons }))).toMatch(/, \+25\.0%$/);
    comparisons.set(CVR, { ...cvr, relativeChange: 0 });
    expect(text(renderFact({ kind: 'change', refId: CVR, direction: 'flat' }, { ...base, comparisons }))).toMatch(/, ±0\.0%$/);
    comparisons.set(CVR, { ...cvr, relativeChange: null });
    expect(text(renderFact({ kind: 'change', refId: CVR, direction: 'down' }, { ...base, comparisons }))).toMatch(/2026-08-31\)$/);
  });

  it('writes an audit verdict with the page it is about and its evidence, or bare when there is none', () => {
    expect(renderFact({ kind: 'audit', refId: 'aud' }, context())).toEqual([
      { kind: 'text', text: 'Ridgeline 2P Backpacking Tent: ' },
      { kind: 'link', text: 'h1: error (0 H1 elements)', href: '/seo/snap_a?preview=1', title: 'Open the audit evidence for Ridgeline 2P Backpacking Tent' },
    ]);
    const base = context();
    const audits = new Map([['aud', { ...base.audits.get('aud')!, evidence: null }]]);
    expect(text(renderFact({ kind: 'audit', refId: 'aud' }, { ...base, audits }))).toBe('Ridgeline 2P Backpacking Tent: h1: error');
  });

  it('marks a site-level page cited on a product card as background, not that product', () => {
    const base = context();
    const audits = new Map([['aud', { ...base.audits.get('aud')!, productId: null, pageLabel: 'page snap_home' }]]);
    const ctx = { ...base, audits };
    expect(text(renderFact({ kind: 'audit', refId: 'aud' }, ctx, { channel: null, productId: 'prd_a' }))).toBe(
      'page snap_home (site-level page, not this product): h1: error (0 H1 elements)',
    );
    expect(text(renderFact({ kind: 'audit', refId: 'aud' }, ctx, { channel: null, productId: null }))).toBe('page snap_home: h1: error (0 H1 elements)');
    expect(text(renderFact({ kind: 'audit', refId: 'aud' }, ctx))).toBe('page snap_home: h1: error (0 H1 elements)');
    // A product's own verdict on its own card carries no background note.
    expect(text(renderFact({ kind: 'audit', refId: 'aud' }, base, { channel: null, productId: 'prd_a' }))).toBe('Ridgeline 2P Backpacking Tent: h1: error (0 H1 elements)');
  });

  it('renders nothing for a fact it cannot resolve, rather than inventing a value', () => {
    expect(renderFact({ kind: 'value', refId: 'nope' }, context())).toEqual([]);
    expect(renderFact({ kind: 'audit', refId: 'nope' }, context())).toEqual([]);
    expect(renderFact({ kind: 'change', refId: ORDERS, direction: 'up' }, context())).toEqual([]);
    const base = context();
    const refs = new Map(base.refs);
    refs.delete(CVR_PREV);
    expect(renderFact({ kind: 'change', refId: CVR, direction: 'down' }, { ...base, refs })).toEqual([]);
  });
});

describe('renderProse', () => {
  it('replaces a product placeholder with the linked product name', () => {
    expect(renderProse('Start with {{product:prd_a}} today.', context())).toEqual([
      { kind: 'text', text: 'Start with ' },
      { kind: 'link', text: 'Ridgeline 2P Backpacking Tent', href: '/products/prd_a', title: 'Ridgeline 2P Backpacking Tent' },
      { kind: 'text', text: ' today.' },
    ]);
  });

  it('leaves an unknown product placeholder visible', () => {
    expect(renderProse('{{product:ghost}}', context())).toEqual([{ kind: 'text', text: '{{product:ghost}}' }]);
  });
});

describe('renderAnswer', () => {
  const finding = (basedOn: string, refId = ORDERS) => ({
    basedOn,
    facts: [{ kind: 'value' as const, refId }],
    whyPriority: 'b',
    howToVerify: 'c',
  });

  it('orders findings by the agent ranking and titles them from the tool finding', () => {
    const ctx = context([known('low', { priority: 'Low' }), known('critical', { priority: 'Critical' })]);
    const rendered = renderAnswer({ summary: 'S', facts: [], findings: [finding('low'), finding('critical')], gaps: ['g'] }, ctx, 'model');
    expect(rendered.findings.map((item) => item.title)).toEqual(['Title critical', 'Title low']);
    expect(rendered.findings.map((item) => item.rank)).toEqual([1, 2]);
    expect(rendered.findings[0]?.ruleGuidance).toBe('Check critical');
    // Scope and fact sentences come from the tool finding, not from the answer.
    expect(rendered.findings[0]?.scope).toEqual({ channel: 'Organic Search', productId: null });
    expect(rendered.findings[0]?.facts).toEqual([renderFact({ kind: 'value', refId: ORDERS }, ctx, { channel: 'Organic Search', productId: null })]);
    expect(rendered.source).toBe('model');
    expect(rendered.gaps).toEqual([[{ kind: 'text', text: 'g' }]]);
  });

  it('writes out the top-level facts that answer a lookup', () => {
    const rendered = renderAnswer({ summary: 'S', facts: [{ kind: 'value', refId: ORDERS }], findings: [], gaps: [] }, context(), 'model');
    expect(rendered.facts).toEqual([renderFact({ kind: 'value', refId: ORDERS }, context())]);
    expect(rendered.findings).toEqual([]);
  });

  it('drops a finding whose basis is unknown instead of failing', () => {
    const rendered = renderAnswer({ summary: 'S', facts: [], findings: [finding('ghost'), finding('f')], gaps: [] }, context([known('f')]), 'model');
    expect(rendered.findings.map((item) => item.basedOn)).toEqual(['f']);
  });

  it('links the finding page, each cited figure and both periods of a change', () => {
    const ctx = context([known('f', { refIds: ['aud'] })]);
    const rendered = renderAnswer({ summary: 'S', facts: [], findings: [finding('f', CVR)], gaps: [] }, ctx, 'model');
    expect(rendered.findings[0]?.evidence).toEqual([
      { href: '/page/f', label: 'Title f' },
      { href: '/analytics?range=30', label: 'Organic Search conversion rate, 2026-08-02 — 2026-08-31' },
      { href: '/analytics?range=30&end=2026-08-01', label: 'Organic Search conversion rate, 2026-07-03 — 2026-08-01' },
      { href: '/seo/snap_a?preview=1', label: 'h1' },
    ]);
  });

  it('labels each evidence link by what it shows, and keeps the first label for a shared page', () => {
    const ctx = context([known('f', { href: '/analytics?range=30', title: 'Organic Search: conversion' })]);
    const rendered = renderAnswer({ summary: 'S', facts: [], findings: [finding('f', CVR)], gaps: [] }, ctx, 'model');
    expect(rendered.findings[0]?.evidence).toEqual([
      { href: '/analytics?range=30', label: 'Organic Search: conversion' },
      { href: '/analytics?range=30&end=2026-08-01', label: 'Organic Search conversion rate, 2026-07-03 — 2026-08-01' },
    ]);
  });

  it('shows the sample and the downgrade of a limited finding', () => {
    const ctx = context([known('f', { priority: 'Critical', strength: 'limited', affectedSessions: 372 })]);
    const rendered = renderAnswer({ summary: 'S', facts: [], findings: [finding('f')], gaps: [] }, ctx, 'model');
    expect(rendered.findings[0]).toMatchObject({ priority: 'Critical', effectivePriority: 'High', downgraded: true, affectedSessions: 372 });
  });
});

describe('fallbackAnswer', () => {
  it('ranks the tool findings itself, leaves out insufficient ones and stops at the limit', () => {
    const findings = [
      known('a', { priority: 'Low' }),
      known('b', { priority: 'Critical' }),
      known('c', { priority: 'High' }),
      known('thin', { priority: 'Critical', strength: 'insufficient' }),
    ];
    const rendered = fallbackAnswer(context(findings), 'Model failed.', 2);
    expect(rendered.source).toBe('fallback');
    expect(rendered.findings.map((item) => item.basedOn)).toEqual(['b', 'c']);
    expect(rendered.summary).toEqual([{ kind: 'text', text: 'Model failed.' }]);
    expect(rendered.findings[0]?.facts).toEqual([[{ kind: 'text', text: 'Engine says b' }]]);
    expect(rendered.findings[0]?.howToVerify).toEqual([{ kind: 'text', text: 'Check b' }]);
    expect(rendered.findings[0]?.evidence).toEqual([{ href: '/page/b', label: 'Title b' }]);
    expect(rendered.findings[0]?.whyPriority[0]?.kind).toBe('text');
    expect(rendered.findings[0]?.scope).toEqual({ channel: 'Organic Search', productId: null });
    expect(rendered.facts).toEqual([]);
  });

  it('keeps the figures of a lookup that raised no finding, in order and at most twelve', () => {
    const ids = Array.from({ length: 14 }, (_, index) => `products:w:all:p${index}:purchase_sessions`);
    const refs = new Map(ids.map((id, index) => [id, ref(id, { label: `P${index} purchasing sessions`, channel: null, productId: `p${index}`, value: index })]));
    const rendered = fallbackAnswer(context([], { refs, figuresWithoutFindings: ['missing', ...ids] }), 'R');
    // Twelve candidates, one of which cannot be resolved and is left out.
    expect(rendered.facts).toHaveLength(11);
    expect(text(rendered.facts[0] ?? [])).toBe('P0 purchasing sessions (all channels), 2026-08-02 — 2026-08-31: 0');
    expect(rendered.findings).toEqual([]);
    expect(rendered.gaps).toEqual([]);
  });

  it('states the sample, the downgrade, and an unknown sample in plain words', () => {
    const rendered = fallbackAnswer(
      context([
        known('limited', { priority: 'Critical', strength: 'limited', affectedSessions: 1234 }),
        known('unknown', { priority: 'Low', affectedSessions: null }),
      ]),
      'R',
    );
    expect(rendered.findings[0]?.whyPriority[0]?.text).toBe(
      'Ranked High: rule severity Critical, evidence limited (moved down one level for limited evidence), 1,234 sessions affected.',
    );
    expect(rendered.findings[1]?.whyPriority[0]?.text).toBe(
      'Ranked Low: rule severity Low, evidence sufficient, an unknown number of sessions affected.',
    );
  });
});
