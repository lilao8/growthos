import { describe, expect, it } from 'vitest';
import {
  agentAnswerSchema,
  repairRequest,
  validateAnswer,
  type AgentAnswer,
  type AnswerContext,
  type AnswerFinding,
  type KnownFinding,
} from '@/domain/agent/answer';

const W = '2026-08-02..2026-08-31';
const META_CVR = `channels:${W}:Meta:all:conversion_rate`;
const META_SESSIONS = `channels:${W}:Meta:all:sessions`;
const SITE_FUNNEL = `funnel:${W}:all:all:conversion:checkout->purchase`;
const META_FUNNEL = `funnel:${W}:Meta:all:conversion:checkout->purchase`;
const AUDIT = 'audits:seo:snap_a:h1:abc';

function known(id: string, overrides: Partial<KnownFinding> = {}): KnownFinding {
  return {
    id,
    title: `Finding ${id}`,
    priority: 'High',
    strength: 'sufficient',
    affectedSessions: 100,
    observed: 'engine text',
    howToVerify: 'Keep the title under 60 characters.',
    refIds: [],
    href: '/analytics?range=30',
    ...overrides,
  };
}

function context(overrides: Partial<AnswerContext> = {}): AnswerContext {
  const ref = (refId: string, channel: string | null) => ({ refId, label: refId, value: 1, unit: 'count' as const, channel, productId: null, href: '/x' });
  return {
    refs: new Map([
      [META_CVR, ref(META_CVR, 'Meta')],
      [META_SESSIONS, ref(META_SESSIONS, 'Meta')],
      [SITE_FUNNEL, ref(SITE_FUNNEL, null)],
      [META_FUNNEL, ref(META_FUNNEL, 'Meta')],
    ]),
    comparisons: new Map([
      [META_CVR, { currentRefId: META_CVR, previousRefId: 'p', current: 0.01, previous: 0.02, relativeChange: -0.5, direction: 'down', supportsConclusion: true }],
      [META_SESSIONS, { currentRefId: META_SESSIONS, previousRefId: 'p', current: 1, previous: 2, relativeChange: -0.5, direction: 'down', supportsConclusion: false }],
    ]),
    audits: new Map([[AUDIT, { refId: AUDIT, ruleId: 'h1', status: 'error', evidence: '0 H1', href: '/seo/snap_a?preview=1' }]]),
    findings: new Map([
      ['f1', known('f1')],
      ['f2', known('f2')],
      ['thin', known('thin', { strength: 'insufficient' })],
    ]),
    namedPhrases: ['Ridgeline 2P Backpacking Tent', 'NT-TENT-RDG2', 'Meta'],
    allowedNumbers: new Set(['7', '30', '90']),
    ...overrides,
  };
}

function finding(overrides: Partial<AnswerFinding> = {}): AnswerFinding {
  return {
    basedOn: 'f1',
    title: 'Meta converts poorly',
    observed: `Conversion is {{ref:${META_CVR}}} on {{ref:${META_SESSIONS}}}.`,
    whyPriority: 'Paid traffic that is not converting.',
    howToVerify: 'Compare landing pages with the ads.',
    scope: { channel: 'Meta', productId: null },
    ...overrides,
  };
}

function answer(findings: AnswerFinding[], summary = 'Two things to check in the last 30 days.'): AgentAnswer {
  return { summary, findings, gaps: [] };
}

function codes(result: ReturnType<typeof validateAnswer>): string[] {
  return result.map((issue) => issue.code);
}

describe('validateAnswer', () => {
  it('accepts an answer whose figures are all placeholders for returned refs', () => {
    expect(validateAnswer(answer([finding()]), context())).toEqual([]);
  });

  it('rejects a placeholder for a figure no tool returned', () => {
    const result = validateAnswer(answer([finding({ observed: 'It is {{ref:channels:made-up}}.' })]), context());
    expect(codes(result)).toEqual(['unknown-ref']);
    expect(result[0]?.finding).toBe(0);
  });

  it('rejects an audit placeholder that was not returned, and accepts one that was', () => {
    expect(codes(validateAnswer(answer([finding({ observed: '{{audit:audits:nope}}' })]), context()))).toEqual(['unknown-audit']);
    expect(validateAnswer(answer([finding({ observed: `See {{audit:${AUDIT}}}.` })]), context())).toEqual([]);
  });

  it('rejects figures written as digits, in the summary and in findings', () => {
    expect(codes(validateAnswer(answer([], 'Conversion was 0.54% on 372 sessions.'), context()))).toEqual(['raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([finding({ observed: 'About 1,200 sessions.' })]), context()))).toEqual(['raw-number']);
  });

  it('allows window lengths, ISO dates, product names and SKUs that contain digits', () => {
    const text = 'Over the last 30 days (2026-08-02 to 2026-08-31), Ridgeline 2P Backpacking Tent (NT-TENT-RDG2) stands out.';
    expect(validateAnswer(answer([], text), context())).toEqual([]);
  });

  it('requires a supported change placeholder before a change word', () => {
    const claim = finding({ observed: 'Meta conversion fell this period.' });
    expect(codes(validateAnswer(answer([claim]), context()))).toEqual(['change-without-comparison']);
    const backed = finding({ observed: `Meta conversion fell: {{change:${META_CVR}}}.` });
    expect(validateAnswer(answer([backed]), context())).toEqual([]);
  });

  it('applies the change rule to Chinese wording too', () => {
    expect(codes(validateAnswer(answer([], 'Meta 转化率下降了。'), context()))).toEqual(['change-without-comparison']);
  });

  it('does not treat "drop-off" as a change claim', () => {
    expect(validateAnswer(answer([], 'The largest drop-off is at checkout.'), context())).toEqual([]);
  });

  it('refuses a change placeholder whose comparison cannot support a conclusion', () => {
    const result = validateAnswer(answer([finding({ observed: `Sessions dropped: {{change:${META_SESSIONS}}}.` })]), context());
    expect(codes(result)).toContain('unsupported-change');
    expect(codes(result)).toContain('change-without-comparison');
    expect(codes(validateAnswer(answer([finding({ observed: '{{change:channels:none}}' })]), context()))).toEqual(['unknown-change']);
  });

  it('lets howToVerify use change words and the engine advice numbers, but not new figures', () => {
    expect(validateAnswer(answer([finding({ howToVerify: 'Check whether conversion improves; keep the title under 60 characters.' })]), context())).toEqual([]);
    expect(codes(validateAnswer(answer([finding({ howToVerify: 'Aim for 45 orders.' })]), context()))).toEqual(['raw-number']);
  });

  it('requires each finding to rest on a returned, sufficient, unused tool finding', () => {
    expect(codes(validateAnswer(answer([finding({ basedOn: 'invented' })]), context()))).toEqual(['unknown-basis']);
    expect(codes(validateAnswer(answer([finding({ basedOn: 'thin' })]), context()))).toEqual(['insufficient-basis']);
    expect(codes(validateAnswer(answer([finding(), finding()]), context()))).toEqual(['duplicate-basis']);
  });

  it('does not let the site funnel stand in for a channel', () => {
    const site = finding({ observed: `Checkout converts at {{ref:${SITE_FUNNEL}}}.` });
    expect(codes(validateAnswer(answer([site]), context()))).toEqual(['site-funnel-for-narrow-scope']);
    const own = finding({ observed: `Checkout converts at {{ref:${META_FUNNEL}}}.` });
    expect(validateAnswer(answer([own]), context())).toEqual([]);
    const siteWide = finding({ observed: `Checkout converts at {{ref:${SITE_FUNNEL}}}.`, scope: { channel: null, productId: null } });
    expect(validateAnswer(answer([siteWide]), context())).toEqual([]);
  });

  it('checks the funnel figures a basis cites, not only those in the text', () => {
    const ctx = context({ findings: new Map([['f1', known('f1', { refIds: [SITE_FUNNEL] })]]) });
    expect(codes(validateAnswer(answer([finding({ observed: 'See the page.' })]), ctx))).toEqual(['site-funnel-for-narrow-scope']);
  });

  it('does not let any funnel figure support a claim about one product', () => {
    const product = finding({ observed: `{{ref:${META_FUNNEL}}}`, scope: { channel: null, productId: 'prd_a' } });
    expect(codes(validateAnswer(answer([product]), context()))).toEqual(['funnel-for-product']);
  });
});

describe('validateAnswer edge cases', () => {
  const SITE_AOV = `channels:${W}:all:all:average_order_value`;
  const withSite = (overrides: Partial<AnswerContext> = {}) => {
    const base = context();
    const refs = new Map(base.refs);
    refs.set(SITE_AOV, { refId: SITE_AOV, label: 'AOV', value: 1, unit: 'cents', channel: null, productId: null, href: '/analytics?range=30' });
    const comparisons = new Map(base.comparisons);
    comparisons.set(SITE_FUNNEL, { currentRefId: SITE_FUNNEL, previousRefId: 'p', current: 0.4, previous: 0.5, relativeChange: -0.2, direction: 'down', supportsConclusion: true });
    return { ...base, refs, comparisons, ...overrides };
  };

  it.each(['falls', 'fall', 'falling', 'rises', 'rise', 'rising', 'declined', 'declines', 'decreased', 'increased', 'grows', 'grow', 'growing', 'worsened', 'improved', 'down from', 'up from', '下滑', '增长', '环比'])(
    'treats "%s" as a change claim',
    (word) => {
      expect(codes(validateAnswer(answer([], `Meta conversion ${word} here.`), context()))).toEqual(['change-without-comparison']);
    },
  );

  it('checks change claims in whyPriority too', () => {
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'Conversion fell.' })]), context()))).toEqual(['change-without-comparison']);
  });

  it('removes longer names before shorter ones, so a name never leaves digits behind', () => {
    const ctx = context({ namedPhrases: ['Traverse 35', 'Traverse 35 Daypack 2'] });
    expect(validateAnswer(answer([], 'Traverse 35 Daypack 2 stands out.'), ctx)).toEqual([]);
  });

  it('ignores an empty name instead of splitting the text apart', () => {
    const ctx = context({ namedPhrases: [''] });
    expect(codes(validateAnswer(answer([], 'About 1,200 visits.'), ctx))).toEqual(['raw-number']);
  });

  it('does not join digits on either side of a placeholder into one number', () => {
    expect(codes(validateAnswer(answer([], `1{{ref:${META_CVR}}}2`), context()))).toEqual(['raw-number', 'raw-number']);
  });

  it('lets a channel finding cite a site figure that is not a funnel figure', () => {
    const cited = finding({ observed: `CAC is high against the site AOV {{ref:${SITE_AOV}}}.` });
    expect(validateAnswer(answer([cited]), withSite())).toEqual([]);
  });

  it('catches the site funnel cited through a change placeholder', () => {
    const cited = finding({ observed: `Checkout conversion fell: {{change:${SITE_FUNNEL}}}.` });
    expect(codes(validateAnswer(answer([cited]), withSite()))).toEqual(['site-funnel-for-narrow-scope']);
  });

  it('does not accept a plain figure as backing for a change claim, even if it has a comparison', () => {
    const claim = finding({ observed: `Meta conversion fell to {{ref:${META_CVR}}}.` });
    expect(codes(validateAnswer(answer([claim]), context()))).toEqual(['change-without-comparison']);
  });

  it('reports an unknown change id next to a change word instead of failing', () => {
    const claim = finding({ observed: 'Conversion fell: {{change:channels:none}}.' });
    expect(codes(validateAnswer(answer([claim]), context()))).toEqual(['unknown-change', 'change-without-comparison']);
  });

  it('reports an unknown funnel figure on a channel finding instead of failing', () => {
    const claim = finding({ observed: '{{ref:funnel:nowhere}}' });
    expect(codes(validateAnswer(answer([claim]), context()))).toEqual(['unknown-ref']);
  });

  it('lets a product finding stand when it cites no funnel figure', () => {
    const product = finding({ observed: `Sessions {{ref:${META_SESSIONS}}}.`, scope: { channel: null, productId: 'prd_a' } });
    expect(validateAnswer(answer([product]), context())).toEqual([]);
  });
});

describe('answer schema and repair', () => {
  const base = { basedOn: 'f', title: 'T', observed: 'o', whyPriority: 'w', howToVerify: 'h', scope: { channel: null, productId: null } };
  const parses = (finding: object) => agentAnswerSchema.safeParse({ summary: 's', findings: [finding], gaps: [] }).success;

  it('bounds every finding field', () => {
    expect(parses(base)).toBe(true);
    expect(parses({ ...base, basedOn: '' })).toBe(false);
    expect(parses({ ...base, basedOn: 'x'.repeat(301) })).toBe(false);
    expect(parses({ ...base, basedOn: 'x'.repeat(300) })).toBe(true);
    expect(parses({ ...base, title: '   ' })).toBe(false);
    expect(parses({ ...base, title: 'x'.repeat(201) })).toBe(false);
    expect(parses({ ...base, title: 'x'.repeat(200) })).toBe(true);
    expect(parses({ ...base, observed: 'x'.repeat(1201) })).toBe(false);
    expect(parses({ ...base, scope: { channel: 'x'.repeat(41), productId: null } })).toBe(false);
    expect(parses({ ...base, scope: { channel: 'Meta', productId: 'x'.repeat(81) } })).toBe(false);
    expect(parses({ ...base, scope: { channel: 'Meta', productId: 'prd_a' } })).toBe(true);
    expect(parses({ ...base, scope: { channel: null, productId: null, extra: 1 } })).toBe(false);
    expect(parses({ ...base, extra: 1 })).toBe(false);
  });

  it('trims titles', () => {
    const parsed = agentAnswerSchema.parse({ summary: 's', findings: [{ ...base, title: '  T  ' }], gaps: [] });
    expect(parsed.findings[0]?.title).toBe('T');
  });

  it('allows at most eight findings and eight gaps', () => {
    expect(agentAnswerSchema.safeParse({ summary: 's', findings: Array(9).fill(base), gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 's', findings: [], gaps: Array(9).fill('g') }).success).toBe(false);
  });

  it('rejects unknown fields and empty text', () => {
    expect(agentAnswerSchema.safeParse({ summary: 'x', findings: [], gaps: [], extra: 1 }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: ' ', findings: [], gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 'x', findings: [], gaps: [] }).success).toBe(true);
  });

  it('lists every issue with where it is', () => {
    const text = repairRequest([
      { finding: null, code: 'raw-number', message: 'a' },
      { finding: 2, code: 'unknown-ref', message: 'b' },
    ]);
    expect(text).toContain('- summary (raw-number): a');
    expect(text).toContain('- findings[2] (unknown-ref): b');
    expect(text.startsWith('Your answer did not pass validation')).toBe(true);
    expect(text.split('\n')).toHaveLength(3);
  });
});
