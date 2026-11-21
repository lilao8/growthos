import { describe, expect, it } from 'vitest';
import type { AnswerContext, KnownFinding } from '@/domain/agent/answer';
import { fallbackAnswer, formatValue, renderAnswer, renderText } from '@/domain/agent/answer-render';

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
    ...overrides,
  };
}

const CVR = 'channels:w:Meta:all:conversion_rate';
const ORDERS = 'channels:w:Meta:all:orders';

function context(findings: KnownFinding[]): AnswerContext {
  return {
    refs: new Map([
      [CVR, { refId: CVR, label: 'Meta conversion rate', value: 0.0054, unit: 'ratio', channel: 'Meta', productId: null, href: '/analytics?range=30' }],
      [ORDERS, { refId: ORDERS, label: 'Meta orders', value: 1234, unit: 'count', channel: 'Meta', productId: null, href: '/analytics?range=30' }],
    ]),
    comparisons: new Map([
      [CVR, { currentRefId: CVR, previousRefId: 'prev', current: 0.25, previous: 0.4, relativeChange: -0.375, direction: 'down', supportsConclusion: true }],
    ]),
    audits: new Map([['aud', { refId: 'aud', ruleId: 'h1', status: 'error', evidence: '0 H1 elements', href: '/seo/snap_a?preview=1' }]]),
    findings: new Map(findings.map((finding) => [finding.id, finding])),
    namedPhrases: [],
    allowedNumbers: new Set(),
  };
}

describe('formatValue', () => {
  it('formats each unit the way the pages do', () => {
    expect(formatValue(1234, 'count')).toBe('1,234');
    expect(formatValue(0.0054, 'ratio')).toBe('0.54%');
    expect(formatValue(12345, 'cents')).toBe('$123.45');
    expect(formatValue(2.5, 'multiple')).toBe('2.50x');
    expect(formatValue(null, 'ratio')).toBe('N/A');
  });
});

describe('renderText', () => {
  it('turns placeholders into linked figures and keeps the text around them', () => {
    const segments = renderText(`Rate {{ref:${CVR}}} on {{ref:${ORDERS}}} orders.`, context([]));
    expect(segments).toEqual([
      { kind: 'text', text: 'Rate ' },
      { kind: 'figure', text: '0.54%', refId: CVR, href: '/analytics?range=30', label: 'Meta conversion rate' },
      { kind: 'text', text: ' on ' },
      { kind: 'figure', text: '1,234', refId: ORDERS, href: '/analytics?range=30', label: 'Meta orders' },
      { kind: 'text', text: ' orders.' },
    ]);
  });

  it('renders a change as previous → current with the relative change', () => {
    const [segment] = renderText(`{{change:${CVR}}}`, context([]));
    expect(segment).toMatchObject({ kind: 'change', text: '40.00% → 25.00% (−37.5%)', previousRefId: 'prev' });
  });

  it('signs a rise and a flat change, and omits the relative part when there is none', () => {
    const ctx = context([]);
    const comparisons = new Map(ctx.comparisons);
    comparisons.set(CVR, { ...comparisons.get(CVR)!, current: 0.5, previous: 0.4, relativeChange: 0.25 });
    expect(renderText(`{{change:${CVR}}}`, { ...ctx, comparisons })[0]?.text).toBe('40.00% → 50.00% (+25.0%)');
    comparisons.set(CVR, { ...comparisons.get(CVR)!, current: 0.4, previous: 0.4, relativeChange: 0 });
    expect(renderText(`{{change:${CVR}}}`, { ...ctx, comparisons })[0]?.text).toBe('40.00% → 40.00% (±0.0%)');
    comparisons.set(CVR, { ...comparisons.get(CVR)!, current: 0.4, previous: 0, relativeChange: null });
    expect(renderText(`{{change:${CVR}}}`, { ...ctx, comparisons })[0]?.text).toBe('0.00% → 40.00%');
  });

  it('leaves a change as text when either its comparison or its figure is missing', () => {
    const ctx = context([]);
    expect(renderText(`{{change:${ORDERS}}}`, ctx)).toEqual([{ kind: 'text', text: `{{change:${ORDERS}}}` }]);
    const refs = new Map(ctx.refs);
    refs.delete(CVR);
    expect(renderText(`{{change:${CVR}}}`, { ...ctx, refs })).toEqual([{ kind: 'text', text: `{{change:${CVR}}}` }]);
  });

  it('renders an audit verdict without evidence as the bare verdict', () => {
    const ctx = context([]);
    const audits = new Map([['aud', { ...ctx.audits.get('aud')!, evidence: null }]]);
    expect(renderText('{{audit:aud}}', { ...ctx, audits })[0]?.text).toBe('h1: error');
  });

  it('renders an audit verdict with its evidence and preview link', () => {
    const [segment] = renderText('{{audit:aud}}', context([]));
    expect(segment).toEqual({ kind: 'audit', text: 'h1: error (0 H1 elements)', refId: 'aud', href: '/seo/snap_a?preview=1' });
  });

  it('leaves an unknown placeholder visible as text rather than inventing a value', () => {
    expect(renderText('{{ref:nope}}', context([]))).toEqual([{ kind: 'text', text: '{{ref:nope}}' }]);
  });
});

describe('renderAnswer', () => {
  it('orders findings by the agent ranking, not by the order the model wrote them', () => {
    const ctx = context([known('low', { priority: 'Low' }), known('critical', { priority: 'Critical' })]);
    const rendered = renderAnswer(
      {
        summary: 'S',
        findings: [
          { basedOn: 'low', title: 'Low one', observed: 'a', whyPriority: 'b', howToVerify: 'c', scope: { channel: null, productId: null } },
          { basedOn: 'critical', title: 'Critical one', observed: 'a', whyPriority: 'b', howToVerify: 'c', scope: { channel: null, productId: null } },
        ],
        gaps: ['g'],
      },
      ctx,
      'model',
    );
    expect(rendered.findings.map((finding) => finding.title)).toEqual(['Critical one', 'Low one']);
    expect(rendered.findings.map((finding) => finding.rank)).toEqual([1, 2]);
    expect(rendered.source).toBe('model');
    expect(rendered.gaps).toEqual([[{ kind: 'text', text: 'g' }]]);
  });

  it('lists the finding page first, then each cited figure page once', () => {
    const ctx = context([known('f', { refIds: [ORDERS, 'aud'] })]);
    const rendered = renderAnswer(
      { summary: 'S', findings: [{ basedOn: 'f', title: 'T', observed: `{{ref:${CVR}}}`, whyPriority: 'b', howToVerify: 'c', scope: { channel: 'Meta', productId: null } }], gaps: [] },
      ctx,
      'model',
    );
    expect(rendered.findings[0]?.evidence).toEqual([
      { href: '/page/f', label: 'Title f' },
      { href: '/analytics?range=30', label: 'Meta conversion rate' },
      { href: '/seo/snap_a?preview=1', label: 'h1' },
    ]);
  });

  it('drops a finding whose basis is unknown instead of failing', () => {
    const ctx = context([known('f')]);
    const rendered = renderAnswer(
      {
        summary: 'S',
        findings: [
          { basedOn: 'ghost', title: 'G', observed: 'a', whyPriority: 'b', howToVerify: 'c', scope: { channel: null, productId: null } },
          { basedOn: 'f', title: 'F', observed: 'a', whyPriority: 'b', howToVerify: 'c', scope: { channel: null, productId: null } },
        ],
        gaps: [],
      },
      ctx,
      'model',
    );
    expect(rendered.findings.map((finding) => finding.basedOn)).toEqual(['f']);
  });

  it('shows the sample and the downgrade of a limited finding', () => {
    const ctx = context([known('f', { priority: 'Critical', strength: 'limited', affectedSessions: 372 })]);
    const rendered = renderAnswer(
      { summary: 'S', findings: [{ basedOn: 'f', title: 'T', observed: 'a', whyPriority: 'b', howToVerify: 'c', scope: { channel: null, productId: null } }], gaps: [] },
      ctx,
      'model',
    );
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
    const rendered = fallbackAnswer(context(findings), ['gap one'], 'Model failed.', 2);
    expect(rendered.source).toBe('fallback');
    expect(rendered.findings.map((finding) => finding.basedOn)).toEqual(['b', 'c']);
    expect(rendered.summary).toEqual([{ kind: 'text', text: 'Model failed.' }]);
    expect(rendered.gaps).toEqual([[{ kind: 'text', text: 'gap one' }]]);
    expect(rendered.findings[0]?.observed).toEqual([{ kind: 'text', text: 'Engine says b' }]);
    expect(rendered.findings[0]?.whyPriority[0]?.text).toContain('rule severity Critical');
    expect(rendered.findings[0]?.howToVerify).toEqual([{ kind: 'text', text: 'Check b' }]);
    expect(rendered.findings[0]?.evidence).toEqual([{ href: '/page/b', label: 'Title b' }]);
  });

  it('states the sample, the downgrade, and an unknown sample in plain words', () => {
    const rendered = fallbackAnswer(
      context([
        known('limited', { priority: 'Critical', strength: 'limited', affectedSessions: 1234 }),
        known('unknown', { priority: 'Low', affectedSessions: null }),
      ]),
      [],
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
